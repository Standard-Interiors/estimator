"""Build quote-scope payloads for Nancy from normalized room specs.

This is intentionally separate from cut-list math. Nancy needs cabinet scope,
not CNC parts or browser-local shop defaults.
"""
from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

import db


SCHEMA = "nancy_quote_scope_v1"

DOOR_SECTION_TYPES = {"door", "glass_door"}
DRAWER_SECTION_TYPES = {"drawer"}
FILLER_ITEM_TYPES = {"filler", "spacer"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _number(value: Any) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n else None


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _warning(code: str, message: str, severity: str = "review", **extra: Any) -> dict:
    item = {"code": code, "severity": severity, "message": message}
    item.update({k: v for k, v in extra.items() if v is not None})
    return item


def _face_summary(cab: dict) -> tuple[dict, list[dict]]:
    sections = deepcopy(cab.get("face", {}).get("sections") or [])
    warnings = []
    door_count = 0
    drawer_count = 0
    false_front_count = 0
    open_count = 0
    panel_count = 0
    known_types = DOOR_SECTION_TYPES | DRAWER_SECTION_TYPES | {"false_front", "open", "appliance_panel", "x_panel"}

    explicit_height_total = 0.0
    explicit_height_sections = 0

    for index, section in enumerate(sections):
        if not isinstance(section, dict):
            warnings.append(_warning(
                "invalid_face_section",
                "Face section is not readable.",
                cabinet_id=cab.get("id"),
                section_index=index,
            ))
            continue

        section_type = section.get("type")
        count = int(section.get("count") or 1)
        if section_type in DOOR_SECTION_TYPES:
            door_count += count
        elif section_type in DRAWER_SECTION_TYPES:
            drawer_count += count
        elif section_type == "false_front":
            false_front_count += count
        elif section_type == "open":
            open_count += count
        elif section_type in {"appliance_panel", "x_panel"}:
            panel_count += count
        elif section_type not in known_types:
            warnings.append(_warning(
                "unknown_face_section_type",
                f"Unknown face section type '{section_type}'.",
                cabinet_id=cab.get("id"),
                section_index=index,
            ))

        height = _number(section.get("height"))
        if height is not None:
            explicit_height_total += height
            explicit_height_sections += 1

    if not sections:
        warnings.append(_warning(
            "missing_face_sections",
            "Cabinet has no face sections.",
            cabinet_id=cab.get("id"),
        ))

    cab_height = _number(cab.get("height")) or 0
    if explicit_height_sections and cab_height > 0 and explicit_height_total > cab_height:
        warnings.append(_warning(
            "face_heights_exceed_cabinet",
            "Face section heights add up taller than the cabinet.",
            cabinet_id=cab.get("id"),
            height=explicit_height_total,
            cabinet_height=cab_height,
        ))

    return {
        "door_count": door_count,
        "drawer_count": drawer_count,
        "false_front_count": false_front_count,
        "open_count": open_count,
        "panel_count": panel_count,
        "sections": sections,
    }, warnings


def _cabinet_scope(cab: dict, layout_row: str | None = None, position: int | None = None) -> tuple[dict, list[dict]]:
    warnings = []
    width = _number(cab.get("width"))
    height = _number(cab.get("height"))
    depth = _number(cab.get("depth"))

    for key, value in (("width", width), ("height", height), ("depth", depth)):
        if value is None or value <= 0:
            warnings.append(_warning(
                "invalid_cabinet_dimension",
                f"Cabinet has an invalid {key}.",
                "blocker",
                cabinet_id=cab.get("id"),
                dimension=key,
                value=cab.get(key),
            ))

    confidence = _clean_text(cab.get("confidence"))
    if confidence and confidence.lower() not in {"high", "verified"}:
        warnings.append(_warning(
            "cabinet_needs_review",
            "Cabinet was saved with a non-high confidence value.",
            cabinet_id=cab.get("id"),
            confidence=confidence,
        ))

    alternatives = cab.get("alternatives") or []
    if alternatives:
        warnings.append(_warning(
            "cabinet_has_alternative_sizes",
            "Cabinet has alternate size candidates from extraction.",
            cabinet_id=cab.get("id"),
            alternatives=alternatives,
        ))

    if cab.get("exclude_from_cutlist"):
        warnings.append(_warning(
            "cabinet_marked_duplicate",
            "Cabinet is marked as duplicate/excluded and should not be priced twice.",
            cabinet_id=cab.get("id"),
        ))

    face, face_warnings = _face_summary(cab)
    warnings.extend(face_warnings)

    scribe = deepcopy(cab.get("scribe") or {})
    end_panels = deepcopy(cab.get("end_panels") or {})

    item = {
        "kind": "cabinet",
        "id": cab.get("id"),
        "type": cab.get("type"),
        "label": cab.get("label") or "",
        "row": cab.get("row"),
        "layout_row": layout_row or cab.get("row"),
        "position": position,
        "width": width,
        "height": height,
        "depth": depth,
        "lane": cab.get("lane"),
        "y_offset": cab.get("yOffset"),
        "depth_offset": cab.get("depthOffset"),
        "face": face,
        "scribe": scribe,
        "end_panels": end_panels,
        "notes": cab.get("notes") or "",
        "confidence": confidence or None,
        "alternatives": deepcopy(alternatives),
        "include_in_quote": not bool(cab.get("exclude_from_cutlist")),
        "warnings": warnings,
    }
    return item, warnings


def _gap_scope(item: dict, layout_row: str, position: int) -> tuple[dict, list[dict]]:
    item_type = item.get("type") or "opening"
    width = _number(item.get("width"))
    kind = "filler" if item_type in FILLER_ITEM_TYPES else "opening"
    label = item.get("label") or ("Filler" if kind == "filler" else "Opening")
    warnings = []

    if width is None or width <= 0:
        warnings.append(_warning(
            "invalid_gap_width",
            f"{label} has an invalid width.",
            "blocker",
            item_id=item.get("id"),
            width=item.get("width"),
        ))
    elif kind == "opening" and width >= 72:
        warnings.append(_warning(
            "large_opening_width",
            f"{label} opening is unusually wide; verify before pricing.",
            item_id=item.get("id"),
            width=width,
        ))

    if kind == "opening" and not _clean_text(item.get("label")):
        warnings.append(_warning(
            "opening_missing_label",
            "Opening has no label.",
            item_id=item.get("id"),
        ))

    scope = {
        "kind": kind,
        "id": item.get("id"),
        "type": item_type,
        "label": label,
        "layout_row": layout_row,
        "position": position,
        "width": width,
        "notes": item.get("notes") or "",
        "warnings": warnings,
    }
    return scope, warnings


def _layout_items(spec: dict, layout_key: str, cab_by_id: dict[str, dict]) -> tuple[list[dict], list[dict], set[str]]:
    row = "wall" if layout_key == "wall_layout" else "base"
    items = []
    warnings = []
    placed = set()

    for position, layout_item in enumerate(spec.get(layout_key) or []):
        if not isinstance(layout_item, dict):
            warning = _warning(
                "invalid_layout_item",
                "Layout item is not readable.",
                layout_row=row,
                position=position,
            )
            warnings.append(warning)
            items.append({
                "kind": "unknown",
                "layout_row": row,
                "position": position,
                "warnings": [warning],
            })
            continue

        ref = layout_item.get("ref")
        if ref:
            cab = cab_by_id.get(ref)
            if not cab:
                warning = _warning(
                    "missing_cabinet_reference",
                    "Layout references a cabinet that is not in the cabinet list.",
                    "blocker",
                    cabinet_id=ref,
                    layout_row=row,
                    position=position,
                )
                warnings.append(warning)
                items.append({
                    "kind": "missing_cabinet",
                    "id": ref,
                    "layout_row": row,
                    "position": position,
                    "warnings": [warning],
                })
                continue
            scope, item_warnings = _cabinet_scope(cab, row, position)
            items.append(scope)
            warnings.extend(item_warnings)
            placed.add(ref)
        else:
            scope, item_warnings = _gap_scope(layout_item, row, position)
            items.append(scope)
            warnings.extend(item_warnings)

    return items, warnings, placed


def _wall_scope(room: dict) -> dict:
    wall_warnings = []
    if not room.get("spec_json"):
        return {
            "room_id": room.get("id"),
            "room_name": room.get("room_name") or "",
            "wall_name": room.get("name") or "Wall",
            "spec_version": room.get("spec_version") or 0,
            "status": "missing_spec",
            "items": [],
            "unplaced_cabinets": [],
            "warnings": [
                _warning("missing_spec", "Room/wall has no saved cabinet spec.", "blocker")
            ],
        }

    try:
        spec = db.normalize_spec(json.loads(room["spec_json"]))
    except (json.JSONDecodeError, TypeError):
        return {
            "room_id": room.get("id"),
            "room_name": room.get("room_name") or "",
            "wall_name": room.get("name") or "Wall",
            "spec_version": room.get("spec_version") or 0,
            "status": "invalid_spec",
            "items": [],
            "unplaced_cabinets": [],
            "warnings": [
                _warning("invalid_spec", "Saved cabinet spec could not be read.", "blocker")
            ],
        }

    cabinets = [c for c in (spec.get("cabinets") or []) if isinstance(c, dict)]
    cab_by_id = {}
    duplicate_ids = set()
    for cab in cabinets:
        cab_id = cab.get("id")
        if not cab_id:
            wall_warnings.append(_warning(
                "cabinet_missing_id",
                "Cabinet is missing an id.",
                "blocker",
            ))
            continue
        if cab_id in cab_by_id:
            duplicate_ids.add(cab_id)
        cab_by_id[cab_id] = cab

    for cab_id in sorted(duplicate_ids):
        wall_warnings.append(_warning(
            "duplicate_cabinet_id",
            "Multiple cabinets share the same id.",
            "blocker",
            cabinet_id=cab_id,
        ))

    base_items, base_warnings, base_placed = _layout_items(spec, "base_layout", cab_by_id)
    wall_items, upper_warnings, wall_placed = _layout_items(spec, "wall_layout", cab_by_id)
    placed = base_placed | wall_placed
    wall_warnings.extend(base_warnings)
    wall_warnings.extend(upper_warnings)

    unplaced = []
    for cab in cabinets:
        cab_id = cab.get("id")
        if cab_id and cab_id not in placed:
            scope, cab_warnings = _cabinet_scope(cab, None, None)
            scope["warnings"] = [
                *scope["warnings"],
                _warning(
                    "cabinet_not_in_layout",
                    "Cabinet exists but is not placed in a layout row.",
                    "blocker",
                    cabinet_id=cab_id,
                ),
            ]
            unplaced.append(scope)
            wall_warnings.extend(cab_warnings)
            wall_warnings.append(scope["warnings"][-1])

    items = base_items + wall_items
    return {
        "room_id": room.get("id"),
        "room_name": room.get("room_name") or "",
        "wall_name": room.get("name") or "Wall",
        "spec_version": room.get("spec_version") or 0,
        "status": "ready" if not any(w.get("severity") == "blocker" for w in wall_warnings) else "needs_review",
        "frame_style": spec.get("frame_style") or "framed",
        "alignment": deepcopy(spec.get("alignment") or []),
        "items": items,
        "unplaced_cabinets": unplaced,
        "warnings": wall_warnings,
    }


def build_project_quote_scope(project: dict, lookup: dict | None = None) -> dict:
    walls = [_wall_scope(room) for room in project.get("rooms") or []]
    all_items = [item for wall in walls for item in wall.get("items", [])]
    all_warnings = [
        {**warning, "room_id": wall.get("room_id"), "wall_name": wall.get("wall_name")}
        for wall in walls
        for warning in wall.get("warnings", [])
    ]

    cabinets = [item for item in all_items if item.get("kind") == "cabinet"]
    included_cabinets = [item for item in cabinets if item.get("include_in_quote")]
    openings = [item for item in all_items if item.get("kind") == "opening"]
    fillers = [item for item in all_items if item.get("kind") == "filler"]

    return {
        "schema": SCHEMA,
        "generated_at": _now_iso(),
        "lookup": lookup or {},
        "project": {
            "id": project.get("id"),
            "name": project.get("name"),
            "status": project.get("status"),
            "notes": project.get("notes") or "",
            "updated_at": project.get("updated_at"),
        },
        "totals": {
            "rooms": len({wall.get("room_name") for wall in walls if wall.get("room_name")}),
            "walls": len(walls),
            "cabinets": len(cabinets),
            "included_cabinets": len(included_cabinets),
            "excluded_cabinets": len(cabinets) - len(included_cabinets),
            "openings": len(openings),
            "fillers": len(fillers),
            "warnings": len(all_warnings),
            "blockers": sum(1 for w in all_warnings if w.get("severity") == "blocker"),
        },
        "walls": walls,
        "warnings": all_warnings,
    }
