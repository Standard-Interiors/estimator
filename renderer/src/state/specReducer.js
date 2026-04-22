/**
 * Pure reducer for cabinet spec state.
 * Deep-clones state on every action to guarantee immutability.
 */
import { DRAWER_BANK_HEIGHTS, FRAME_OFFSETS } from "./specHelpers";

function clone(obj) {
  return typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

function getLayoutKey(row) {
  if (row === "base") return "base_layout";
  if (row === "wall") return "wall_layout";
  return null;
}

function findCabinetIndex(spec, id) {
  return spec.cabinets.findIndex((c) => c.id === id);
}

function findRefIndex(layout, id) {
  return layout.findIndex((item) => item.ref === id);
}

function rowForCabinet(spec, id) {
  if (spec.base_layout.some((item) => item.ref === id)) return "base";
  if (spec.wall_layout.some((item) => item.ref === id)) return "wall";
  return null;
}

function isExplicitSpacer(item) {
  return !!item && !item.ref && (item.type === "filler" || item.type === "spacer");
}

function isGapItem(item) {
  return !!item && !item.ref;
}

export default function specReducer(state, action) {
  const spec = clone(state);

  switch (action.type) {
    // ── Cabinet operations ──────────────────────────────────────────

    case "ADD_CABINET": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      spec.cabinets.push(action.cabinet);
      const pos = Math.min(action.position, spec[layoutKey].length);
      spec[layoutKey].splice(pos, 0, { ref: action.cabinet.id });
      return spec;
    }

    case "DELETE_CABINET": {
      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx !== -1) spec.cabinets.splice(cabIdx, 1);

      for (const key of ["base_layout", "wall_layout"]) {
        const refIdx = findRefIndex(spec[key], action.id);
        if (refIdx !== -1) spec[key].splice(refIdx, 1);
      }

      spec.alignment = spec.alignment.filter(
        (a) => a.wall !== action.id && a.base !== action.id
      );
      return spec;
    }

    case "MOVE_CABINET": {
      const row = rowForCabinet(spec, action.id);
      if (!row) return spec;
      const layoutKey = getLayoutKey(row);
      const layout = spec[layoutKey];
      const idx = findRefIndex(layout, action.id);
      if (idx === -1) return spec;

      const swapIdx = action.direction === "left" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= layout.length) return spec;

      [layout[idx], layout[swapIdx]] = [layout[swapIdx], layout[idx]];
      return spec;
    }

    case "MOVE_ROW": {
      // Move a cabinet between base and wall rows
      // action: { id, targetRow } — "base" or "wall"
      const currentRow = rowForCabinet(spec, action.id);
      if (!currentRow || currentRow === action.targetRow) return spec;

      const fromKey = getLayoutKey(currentRow);
      const toKey = getLayoutKey(action.targetRow);
      const fromLayout = spec[fromKey];
      const idx = findRefIndex(fromLayout, action.id);
      if (idx === -1) return spec;

      // Remove from source layout
      fromLayout.splice(idx, 1);

      // Add to end of target layout
      spec[toKey].push({ ref: action.id });

      // Update cabinet's row property
      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx !== -1) {
        spec.cabinets[cabIdx].row = action.targetRow;
        // Adjust default dimensions for new row
        if (action.targetRow === "wall") {
          if (spec.cabinets[cabIdx].height === 34.5) spec.cabinets[cabIdx].height = 30;
          if (spec.cabinets[cabIdx].depth === 24) spec.cabinets[cabIdx].depth = 12;
        } else {
          if (spec.cabinets[cabIdx].height === 30) spec.cabinets[cabIdx].height = 34.5;
          if (spec.cabinets[cabIdx].depth === 12) spec.cabinets[cabIdx].depth = 24;
        }
        // Update ID prefix — ensure uniqueness
        const oldId = spec.cabinets[cabIdx].id;
        const prefix = action.targetRow === "wall" ? "W" : "B";
        const num = oldId.replace(/^[BW]/, "");
        let newId = prefix + num;
        // If ID already taken, find next available number
        const existingIds = new Set(spec.cabinets.map(c => c.id));
        if (existingIds.has(newId)) {
          let n = 1;
          while (existingIds.has(prefix + n)) n++;
          newId = prefix + n;
        }
        spec.cabinets[cabIdx].id = newId;
        // Update layout ref
        const toLayout = spec[toKey];
        const newIdx = toLayout.findIndex(i => i.ref === oldId);
        if (newIdx !== -1) toLayout[newIdx].ref = newId;
        // Update alignment refs
        spec.alignment = (spec.alignment || []).filter(a => a.wall !== oldId && a.base !== oldId);
        return { ...spec, _movedTo: newId };
      }
      return spec;
    }

    case "NUDGE_CABINET": {
      // Move a cabinet left/right by inserting/resizing surrounding gap stock.
      // Real openings can be resized too, but the UI warns when that happens.
      // action: { id, amount } — positive = right, negative = left
      const row = rowForCabinet(spec, action.id);
      if (!row) return state;
      const layoutKey = getLayoutKey(row);
      const layout = spec[layoutKey];
      let idx = findRefIndex(layout, action.id);
      if (idx === -1) return state;

      const amount = action.amount || 1;
      if (!amount) return state;

      // Find filler immediately before this cabinet
      const prevIdx = idx - 1;
      const prevItem = prevIdx >= 0 ? layout[prevIdx] : null;
      const prevIsGap = isGapItem(prevItem);

      const makeSpacer = (width) => ({
        type: "filler",
        id: `spacer_${Date.now()}`,
        label: "",
        width,
      });

      if (amount > 0) {
        // Moving right — grow/create gap before, then shrink any gap after.
        const afterIdx = idx + 1;
        const afterItem = afterIdx < layout.length ? layout[afterIdx] : null;
        const afterIsGap = isGapItem(afterItem);

        if (prevIsGap) {
          prevItem.width = (prevItem.width || 0) + amount;
        } else {
          layout.splice(idx, 0, makeSpacer(amount));
          idx++; // cabinet shifted right in array
        }
        if (afterIsGap) {
          const shiftedAfterIdx = idx + 1;
          const shiftedAfter = layout[shiftedAfterIdx];
          shiftedAfter.width = (shiftedAfter.width || 0) - amount;
          if (shiftedAfter.width <= 0) layout.splice(shiftedAfterIdx, 1);
        }
      } else {
        // Moving left — shrink/remove gap before, then grow/create gap after.
        if (!prevIsGap) return state; // blocked — nothing movable before this cabinet
        const shrink = Math.min(prevItem.width || 0, Math.abs(amount));
        if (!shrink) return state;
        prevItem.width = (prevItem.width || 0) - shrink;
        if (prevItem.width <= 0) {
          layout.splice(prevIdx, 1);
          idx--; // cabinet shifted left in array
        }
        // Compensate with explicit spacer stock after the cabinet.
        const afterIdx = idx + 1;
        const afterItem = afterIdx < layout.length ? layout[afterIdx] : null;
        const afterIsGap = isGapItem(afterItem);
        if (afterIsGap) {
          afterItem.width = (afterItem.width || 0) + shrink;
        } else {
          layout.splice(afterIdx, 0, makeSpacer(shrink));
        }
      }
      return spec;
    }

    case "NUDGE_VERTICAL": {
      // Move a wall cabinet up/down by adjusting its yOffset (inches from top).
      // action: { id, amount } — positive = down, negative = up
      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx === -1) return spec;
      const cab = spec.cabinets[cabIdx];
      if (cab.row !== "wall") return spec; // only wall cabinets can be nudged vertically
      const cur = cab.yOffset || 0;
      cab.yOffset = Math.max(0, cur + (action.amount || 0));
      return spec;
    }

    case "REORDER_CABINET": {
      const row = rowForCabinet(spec, action.id);
      if (!row) return spec;
      const layoutKey = getLayoutKey(row);
      const layout = spec[layoutKey];
      const fromIdx = findRefIndex(layout, action.id);
      if (fromIdx === -1) return spec;
      const toIdx = Math.max(0, Math.min(action.toIndex, layout.length - 1));
      if (fromIdx === toIdx) return spec;
      const [item] = layout.splice(fromIdx, 1);
      layout.splice(toIdx, 0, item);
      return spec;
    }

    case "SET_DIMENSION": {
      const cab = spec.cabinets.find((c) => c.id === action.id);
      if (cab && (action.field === "width" || action.field === "height" || action.field === "depth")) {
        cab[action.field] = action.value;
      }
      return spec;
    }

    case "SET_LABEL": {
      const cab = spec.cabinets.find((c) => c.id === action.id);
      if (cab) cab.label = action.label;
      return spec;
    }

    case "SET_EXCLUDE_FROM_CUTLIST": {
      // Mark a cabinet as a duplicate of one seen in another photo. The 3D view
      // still shows it (so the wall layout reads correctly), but the project-
      // level cut list skips it to avoid double-counting material.
      const cab = spec.cabinets.find((c) => c.id === action.id);
      if (cab) cab.exclude_from_cutlist = !!action.value;
      return spec;
    }

    case "CHANGE_TYPE": {
      const cab = spec.cabinets.find((c) => c.id === action.id);
      if (!cab) return spec;
      cab.type = action.newType;
      // Auto-update face to match common types
      const t = action.newType;
      if (t === "base_drawer_bank" || t === "drawer_bank") {
        // Neil's spec: 10.5" bottom, 6" × 3 above (section order = top→bottom).
        // These are often custom — `needsVerify` badge prompts the cabinet maker
        // to double-check sizes in the UI.
        cab.face = {
          sections: DRAWER_BANK_HEIGHTS.map((height) => ({ type: "drawer", count: 1, height })),
        };
      } else if (t === "base_sink" || t === "sink") {
        cab.face = { sections: [
          { type: "false_front", height: 6 },
          { type: "door", count: cab.width >= 30 ? 2 : 1, hinge_side: cab.width >= 30 ? "both" : "left" },
        ]};
      } else if (t === "base_pullout" || t === "pullout") {
        cab.face = { sections: [
          { type: "drawer", count: 1, height: 6 },
          { type: "drawer", count: 1, height: 6 },
          { type: "drawer", count: 1, height: 6 },
          { type: "drawer", count: 1, height: 6 },
        ]};
      } else if (t === "base_spice" || t === "spice") {
        cab.face = { sections: [
          { type: "door", count: 1, hinge_side: "left" },
        ]};
      }
      return spec;
    }

    case "DUPLICATE_CABINET": {
      const srcIdx = findCabinetIndex(spec, action.id);
      if (srcIdx === -1) return spec;

      const dup = clone(spec.cabinets[srcIdx]);
      dup.id = action.newId;
      spec.cabinets.push(dup);

      const row = rowForCabinet(spec, action.id);
      if (!row) return spec;
      const layoutKey = getLayoutKey(row);
      const refIdx = findRefIndex(spec[layoutKey], action.id);
      if (refIdx !== -1) {
        spec[layoutKey].splice(refIdx + 1, 0, { ref: action.newId });
      }
      return spec;
    }

    case "MERGE_CABINETS": {
      // Merge target into source: sum widths, concat face sections, remove target.
      // Used when AI split one physical cabinet into two (e.g., B3+B4 that should be
      // one 36" cabinet with 2 doors + 2 drawers). User then edits face sections.
      const srcIdx = findCabinetIndex(spec, action.sourceId);
      const tgtIdx = findCabinetIndex(spec, action.targetId);
      if (srcIdx === -1 || tgtIdx === -1) return spec;

      const source = spec.cabinets[srcIdx];
      const target = spec.cabinets[tgtIdx];

      // Must be same row — can't merge a base with a wall cabinet
      const srcRow = rowForCabinet(state, action.sourceId);
      const tgtRow = rowForCabinet(state, action.targetId);
      if (!srcRow || srcRow !== tgtRow) return spec;

      // Sum widths (quarter-inch precision to match editor)
      source.width = Math.round((source.width + target.width) * 4) / 4;

      // Clear exclude flag — user is actively merging, so this is a real cabinet
      delete source.exclude_from_cutlist;

      // Concat face sections — preserve everything. User trims/combines after.
      if (!source.face) source.face = { sections: [] };
      if (!source.face.sections) source.face.sections = [];
      const targetSections = (target.face && target.face.sections) || [];
      source.face.sections = [...source.face.sections, ...targetSections];

      // OVERFLOW GUARD: a concatenated face may push the door's auto-computed height
      // below zero (e.g. B1[drawer+door] + B2[3 drawers] → 4 drawers totalling > cab).
      // We used to let that propagate silently into the cut list and CSV (-6.5" door!).
      // Now: if a door exists and the arithmetic would produce <= 0" for the door,
      // reset the face to a sensible default matching the merged cabinet.
      {
        const isBase = srcRow === "base";
        const hasDoor = source.face.sections.some((s) => s.type === "door" || s.type === "glass_door");
        if (hasDoor) {
          const drawerSum = source.face.sections
            .filter((s) => s.type === "drawer" || s.type === "false_front")
            .reduce((sum, s) => sum + (s.height || 6), 0);
          const fs = spec.frame_style || "framed";
          const offsets = FRAME_OFFSETS[fs] || FRAME_OFFSETS.framed;
          const toeKick = spec.shop_profile_override?.toe_kick_height ?? 4.5;
          const baseDeduct = (isBase && source.height > 28) ? toeKick + offsets.baseRevealExtra : 0;
          // availableDoorH mirrors calcDoorSizes: base>28 uses baseDeduct only; everything
          // else (vanities, walls, tall) uses offsets.height for the top reveal.
          const availableDoorH = baseDeduct > 0
            ? source.height - baseDeduct - drawerSum
            : source.height - drawerSum - offsets.height;
          if (availableDoorH <= 0) {
            const isWide = source.width >= 24;
            source.face = {
              sections: [
                ...(isBase && source.height > 28 ? [{ type: "drawer", count: 1, height: 6 }] : []),
                { type: "door", count: isWide ? 2 : 1, hinge_side: isWide ? "both" : "left" },
              ],
            };
          }
        }
      }

      // Remove target cabinet
      const targetCabIdx = findCabinetIndex(spec, action.targetId);
      if (targetCabIdx !== -1) spec.cabinets.splice(targetCabIdx, 1);

      // Remove target from layout
      const layoutKey = getLayoutKey(srcRow);
      const tgtRefIdx = findRefIndex(spec[layoutKey], action.targetId);
      if (tgtRefIdx !== -1) spec[layoutKey].splice(tgtRefIdx, 1);

      // Remap alignments that referenced the target to now reference the source
      spec.alignment = spec.alignment
        .map((a) => {
          if (a.wall === action.targetId) return { ...a, wall: action.sourceId };
          if (a.base === action.targetId) return { ...a, base: action.sourceId };
          return a;
        })
        // Deduplicate — if source was already aligned, drop the duplicate
        .filter((a, i, arr) => {
          const key = `${a.wall}-${a.base}`;
          return arr.findIndex((x) => `${x.wall}-${x.base}` === key) === i;
        });

      return spec;
    }

    case "SPLIT_CABINET": {
      const srcIdx = findCabinetIndex(spec, action.id);
      if (srcIdx === -1) return spec;
      const original = spec.cabinets[srcIdx];

      const leftCab = clone(original);
      leftCab.id = action.leftId;
      leftCab.width = action.leftWidth;

      const rightCab = clone(original);
      rightCab.id = action.rightId;
      rightCab.width = action.rightWidth;

      // Remove original from cabinets
      spec.cabinets.splice(srcIdx, 1);

      // Add the two new cabinets
      spec.cabinets.push(leftCab, rightCab);

      // Replace ref in layout
      const row = rowForCabinet(state, action.id); // use original state since we already removed from spec
      if (!row) {
        // Fallback: check both layouts in spec clone before splice
        for (const key of ["base_layout", "wall_layout"]) {
          const refIdx = findRefIndex(spec[key], action.id);
          if (refIdx !== -1) {
            spec[key].splice(refIdx, 1, { ref: action.leftId }, { ref: action.rightId });
            break;
          }
        }
      } else {
        const layoutKey = getLayoutKey(row);
        const refIdx = findRefIndex(spec[layoutKey], action.id);
        if (refIdx !== -1) {
          spec[layoutKey].splice(refIdx, 1, { ref: action.leftId }, { ref: action.rightId });
        }
      }

      // Update alignments that referenced the original
      spec.alignment = spec.alignment.map((a) => {
        if (a.wall === action.id) return { ...a, wall: action.leftId };
        if (a.base === action.id) return { ...a, base: action.leftId };
        return a;
      });
      return spec;
    }

    // ── Face operations ─────────────────────────────────────────────

    case "ADD_SECTION": {
      const cab = spec.cabinets.find((c) => c.id === action.cabId);
      if (!cab) return spec;
      if (!cab.face) cab.face = { sections: [] };
      if (!cab.face.sections) cab.face.sections = [];
      cab.face.sections.push(action.section);
      return spec;
    }

    case "REMOVE_SECTION": {
      const cab = spec.cabinets.find((c) => c.id === action.cabId);
      if (!cab?.face?.sections) return spec;
      if (action.sectionIndex >= 0 && action.sectionIndex < cab.face.sections.length) {
        cab.face.sections.splice(action.sectionIndex, 1);
      }
      return spec;
    }

    case "UPDATE_SECTION": {
      const cab = spec.cabinets.find((c) => c.id === action.cabId);
      if (!cab?.face?.sections) return spec;
      const section = cab.face.sections[action.sectionIndex];
      if (section) {
        Object.assign(section, action.updates);
      }
      return spec;
    }

    // ── Gap operations ──────────────────────────────────────────────

    case "ADD_GAP": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const pos = Math.min(action.position, spec[layoutKey].length);
      spec[layoutKey].splice(pos, 0, action.gap);
      return spec;
    }

    case "DELETE_GAP": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const item = spec[layoutKey][action.position];
      // Only delete if it's a gap (not a ref)
      if (item && !item.ref) {
        spec[layoutKey].splice(action.position, 1);
      }
      return spec;
    }

    case "UPDATE_GAP": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const item = spec[layoutKey][action.position];
      if (item && !item.ref) {
        Object.assign(item, action.updates);
      }
      return spec;
    }

    // ── Alignment ───────────────────────────────────────────────────

    case "SET_ALIGNMENT": {
      const existing = spec.alignment.findIndex((a) => a.wall === action.wall);
      if (existing !== -1) {
        spec.alignment[existing].base = action.base;
      } else {
        spec.alignment.push({ wall: action.wall, base: action.base });
      }
      return spec;
    }

    case "REMOVE_ALIGNMENT": {
      spec.alignment = spec.alignment.filter((a) => a.wall !== action.wall);
      return spec;
    }

    // ── Door sizing ──────────────────────────────────────────────────

    case "SET_FRAME_STYLE": {
      spec.frame_style = action.value;
      return spec;
    }

    case "SET_SCRIBE": {
      const cab = spec.cabinets.find((c) => c.id === action.id);
      if (cab) {
        if (!cab.scribe) cab.scribe = { left: false, right: false, top: false };
        Object.assign(cab.scribe, action.updates);
      }
      return spec;
    }

    case "SET_SECTION_OVERRIDE": {
      const cab = spec.cabinets.find((c) => c.id === action.cabId);
      if (cab?.face?.sections?.[action.sectionIndex]) {
        const sec = cab.face.sections[action.sectionIndex];
        if (action.widthOverride !== undefined) sec.width_override = action.widthOverride;
        if (action.heightOverride !== undefined) sec.height_override = action.heightOverride;
      }
      return spec;
    }

    case "SET_SHOP_OVERRIDE": {
      spec.shop_profile_override = action.override;
      return spec;
    }

    case "CLEAR_SHOP_OVERRIDE": {
      delete spec.shop_profile_override;
      return spec;
    }

    // ── Meta ────────────────────────────────────────────────────────

    case "LOAD_SPEC": {
      const loaded = clone(action.spec || {});
      loaded.base_layout = Array.isArray(loaded.base_layout) ? loaded.base_layout : [];
      loaded.wall_layout = Array.isArray(loaded.wall_layout) ? loaded.wall_layout : [];
      loaded.cabinets = Array.isArray(loaded.cabinets) ? loaded.cabinets : [];
      // Keep alignment first-class so render/load/save all preserve the same intent.
      loaded.alignment = Array.isArray(loaded.alignment)
        ? loaded.alignment.filter((a) => a?.wall && a?.base)
        : [];
      return loaded;
    }

    default:
      return spec;
  }
}
