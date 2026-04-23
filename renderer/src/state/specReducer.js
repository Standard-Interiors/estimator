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
  if (row === "wall") return "wall_layout";
  if (row === "base" || row === "tall") return "base_layout";
  return null;
}

function findCabinetIndex(spec, id) {
  return spec.cabinets.findIndex((c) => c.id === id);
}

function findRefIndex(layout, id) {
  return layout.findIndex((item) => item.ref === id);
}

function rowForCabinet(spec, id) {
  const cab = spec.cabinets.find((c) => c.id === id);
  if (!cab) return null;
  if (spec.wall_layout.some((item) => item.ref === id)) return cab.row || "wall";
  if (spec.base_layout.some((item) => item.ref === id)) return cab.row || "base";
  return cab.row || null;
}

function isGapItem(item) {
  return !!item && !item.ref;
}

function defaultTypeForRow(row) {
  if (row === "wall") return "wall";
  if (row === "tall") return "tall_pantry";
  return "base";
}

function defaultHeightForRow(row) {
  if (row === "wall") return 30;
  if (row === "tall") return 84;
  return 34.5;
}

function defaultDepthForRow(row) {
  return row === "wall" ? 12 : 24;
}

function isFrontBaseCabinet(cab) {
  return !!cab && cab.row === "base" && (cab.lane || "front") !== "back";
}

function rowSupportsLane(row) {
  return row === "base" || row === "tall";
}

function rowSupportsVerticalOffset(row) {
  return row === "wall" || row === "tall";
}

function rowSupportsDepthOffset(row) {
  return row === "tall";
}

function normalizeYOffset(row, yOffset) {
  if (!rowSupportsVerticalOffset(row)) return undefined;
  const value = Number.isFinite(yOffset) ? Math.round(yOffset * 4) / 4 : 0;
  if (row === "wall") return Math.max(0, value);
  return Math.max(-96, Math.min(96, value));
}

function normalizeDepthOffset(row, depthOffset) {
  if (!rowSupportsDepthOffset(row)) return undefined;
  const value = Number.isFinite(depthOffset) ? Math.round(depthOffset * 4) / 4 : 0;
  return Math.max(-24, Math.min(24, value));
}

function sanitizeAlignments(spec) {
  const cabMap = new Map((spec.cabinets || []).map((cab) => [cab.id, cab]));
  const lowerXById = new Map();
  let lowerX = 0;
  (spec.base_layout || []).forEach((item) => {
    const id = item?.ref || item?.id;
    const cab = id ? cabMap.get(id) : null;
    const width = cab ? cab.width : item?.width || 30;
    if (item?.ref) lowerXById.set(item.ref, lowerX);
    lowerX += width;
  });

  const rawByWall = new Map();
  const seenWalls = new Set();
  const seenBases = new Set();
  for (const entry of spec.alignment || []) {
    if (!entry?.wall || !entry?.base) continue;
    const wallCab = cabMap.get(entry.wall);
    const baseCab = cabMap.get(entry.base);
    if (!wallCab || wallCab.row !== "wall") continue;
    if (!isFrontBaseCabinet(baseCab)) continue;
    if (seenWalls.has(entry.wall) || seenBases.has(entry.base)) continue;
    rawByWall.set(entry.wall, entry.base);
    seenWalls.add(entry.wall);
    seenBases.add(entry.base);
  }

  const accepted = [];
  let wallX = 0;
  let prevWasGap = false;
  (spec.wall_layout || []).forEach((item) => {
    const id = item?.ref || item?.id;
    const cab = id ? cabMap.get(id) : null;
    const width = cab ? cab.width : item?.width || 30;
    const baseId = item?.ref ? rawByWall.get(item.ref) : null;
    const baseX = baseId != null ? lowerXById.get(baseId) : null;
    if (!prevWasGap && baseId && baseX != null && baseX >= wallX) {
      accepted.push({ wall: item.ref, base: baseId });
      wallX = baseX;
    }
    wallX += width;
    prevWasGap = !item?.ref;
  });

  spec.alignment = accepted;
}

function typeMatchesRow(type, row) {
  if (!type) return false;
  if (row === "wall") return type === "wall" || type.startsWith("wall_");
  if (row === "tall") return type.startsWith("tall_");
  return (
    type === "base" ||
    type.startsWith("base_") ||
    type === "sink" ||
    type === "drawer_bank"
  );
}

function normalizeLane(row, lane) {
  if (!rowSupportsLane(row)) return undefined;
  return lane === "back" ? "back" : "front";
}

function initializeCabinetForRow(cab, targetRow) {
  cab.row = targetRow;

  if (!typeMatchesRow(cab.type, targetRow)) {
    cab.type = defaultTypeForRow(targetRow);
  }

  if (!Number.isFinite(cab.height) || cab.height <= 0) {
    cab.height = defaultHeightForRow(targetRow);
  }
  if (!Number.isFinite(cab.depth) || cab.depth <= 0) {
    cab.depth = defaultDepthForRow(targetRow);
  }

  if (rowSupportsVerticalOffset(targetRow)) {
    cab.yOffset = normalizeYOffset(targetRow, cab.yOffset);
  } else {
    delete cab.yOffset;
  }

  if (rowSupportsLane(targetRow)) {
    cab.lane = normalizeLane(targetRow, cab.lane);
  } else {
    delete cab.lane;
  }

  if (rowSupportsDepthOffset(targetRow)) {
    cab.depthOffset = normalizeDepthOffset(targetRow, cab.depthOffset);
  } else {
    delete cab.depthOffset;
  }
}

function moveCabinetToRow(cab, targetRow, sourceRow = cab.row) {
  cab.row = targetRow;

  if (!typeMatchesRow(cab.type, targetRow)) {
    cab.type = defaultTypeForRow(targetRow);
  }

  if (rowSupportsVerticalOffset(targetRow)) {
    const seedYOffset = sourceRow === targetRow ? cab.yOffset : 0;
    cab.yOffset = normalizeYOffset(targetRow, seedYOffset);
  } else {
    delete cab.yOffset;
  }

  if (rowSupportsLane(targetRow)) {
    cab.lane = normalizeLane(targetRow, cab.lane);
  } else {
    delete cab.lane;
  }

  if (rowSupportsDepthOffset(targetRow)) {
    const seedDepthOffset = rowSupportsDepthOffset(sourceRow) ? cab.depthOffset : 0;
    cab.depthOffset = normalizeDepthOffset(targetRow, seedDepthOffset);
  } else {
    delete cab.depthOffset;
  }
}

function removeRefFromLayout(layout, id) {
  const idx = findRefIndex(layout, id);
  if (idx === -1) return false;
  layout.splice(idx, 1);
  return true;
}

function clampInsertIndex(layout, targetIndex) {
  if (!Array.isArray(layout) || layout.length === 0) return 0;
  return Math.max(0, Math.min(targetIndex, layout.length));
}

function layoutItemWidth(spec, item) {
  if (!item) return 0;
  if (!item.ref) return Math.max(0, item.width || 0);
  const cab = spec.cabinets.find((entry) => entry.id === item.ref);
  return Math.max(0, cab?.width || 0);
}

function centerXForRef(spec, layout, id) {
  let cursor = 0;
  for (const item of layout || []) {
    const width = layoutItemWidth(spec, item);
    if (item?.ref === id) return cursor + width / 2;
    cursor += width;
  }
  return null;
}

function bestInsertIndexForCenterX(spec, layout, cabId, centerX) {
  const movingWidth = layoutItemWidth(spec, { ref: cabId });
  let cursor = 0;
  let bestIdx = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let idx = 0; idx <= (layout || []).length; idx += 1) {
    const candidateCenter = cursor + movingWidth / 2;
    const distance = Math.abs(candidateCenter - centerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIdx = idx;
    }
    if (idx < (layout || []).length) {
      cursor += layoutItemWidth(spec, layout[idx]);
    }
  }

  return bestIdx;
}

export default function specReducer(state, action) {
  const spec = clone(state);

  switch (action.type) {
    // ── Cabinet operations ──────────────────────────────────────────

    case "ADD_CABINET": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const cab = clone(action.cabinet || {});
      initializeCabinetForRow(cab, action.row);
      spec.cabinets.push(cab);
      const pos = Math.min(action.position, spec[layoutKey].length);
      spec[layoutKey].splice(pos, 0, { ref: cab.id });
      sanitizeAlignments(spec);
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
      sanitizeAlignments(spec);
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
      sanitizeAlignments(spec);
      return spec;
    }

    case "MOVE_ROW": {
      // Move a cabinet between rows. Keep ids stable so selection, undo, and
      // cut-list references do not churn when the cabinet maker is correcting AI.
      // action: { id, targetRow } — "base", "wall", or "tall"
      const currentRow = rowForCabinet(spec, action.id);
      if (!currentRow || currentRow === action.targetRow) return spec;

      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx === -1) return spec;

      const currentKey = getLayoutKey(currentRow);
      const targetKey = getLayoutKey(action.targetRow);
      if (!currentKey || !targetKey) return spec;

      const sameLowerRun =
        currentKey === "base_layout" &&
        targetKey === "base_layout" &&
        (currentRow === "base" || currentRow === "tall") &&
        (action.targetRow === "base" || action.targetRow === "tall");

      if (!sameLowerRun) {
        const sourceCenterX = centerXForRef(spec, spec[currentKey], action.id);
        if (!removeRefFromLayout(spec[currentKey], action.id)) return spec;
        const insertAt =
          sourceCenterX == null
            ? spec[targetKey].length
            : bestInsertIndexForCenterX(spec, spec[targetKey], action.id, sourceCenterX);
        spec[targetKey].splice(insertAt, 0, { ref: action.id });
      }

      moveCabinetToRow(spec.cabinets[cabIdx], action.targetRow, currentRow);

      if (currentRow === "wall") {
        spec.alignment = (spec.alignment || []).filter((a) => a.wall !== action.id);
      }
      if (action.targetRow === "wall" && currentRow !== "wall") {
        spec.alignment = (spec.alignment || []).filter((a) => a.base !== action.id);
      }

      sanitizeAlignments(spec);

      return spec;
    }

    case "PLACE_CABINET": {
      // True 3D placement: move a cabinet to a row + insertion slot, instead of
      // only resizing surrounding gaps. targetIndex is relative to the target
      // layout with this cabinet already removed.
      const currentRow = rowForCabinet(spec, action.id);
      if (!currentRow) return state;

      const targetRow = action.targetRow || currentRow;
      const currentKey = getLayoutKey(currentRow);
      const targetKey = getLayoutKey(targetRow);
      if (!currentKey || !targetKey) return state;

      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx === -1) return state;
      const cab = spec.cabinets[cabIdx];

      const currentLayout = spec[currentKey];
      if (!removeRefFromLayout(currentLayout, action.id)) return state;

      const targetLayout = spec[targetKey];
      const insertAt = clampInsertIndex(targetLayout, action.targetIndex ?? targetLayout.length);
      targetLayout.splice(insertAt, 0, { ref: action.id });

      if (targetRow !== currentRow) {
        moveCabinetToRow(cab, targetRow, currentRow);
      }
      if (rowSupportsVerticalOffset(targetRow) && typeof action.targetYOffset === "number") {
        cab.yOffset = normalizeYOffset(targetRow, action.targetYOffset);
      }
      if (!rowSupportsVerticalOffset(targetRow)) {
        delete cab.yOffset;
      }
      if (!rowSupportsLane(targetRow)) {
        delete cab.lane;
      } else {
        cab.lane = normalizeLane(targetRow, cab.lane);
      }
      if (!rowSupportsDepthOffset(targetRow)) {
        delete cab.depthOffset;
      } else {
        cab.depthOffset = normalizeDepthOffset(targetRow, cab.depthOffset);
      }

      if (currentRow === "wall") {
        spec.alignment = (spec.alignment || []).filter((a) => a.wall !== action.id);
      }
      if (targetRow === "wall" && currentRow !== "wall") {
        spec.alignment = (spec.alignment || []).filter((a) => a.base !== action.id);
      }

      sanitizeAlignments(spec);

      return spec;
    }

    case "SET_LANE": {
      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx === -1) return state;
      const cab = spec.cabinets[cabIdx];
      if (cab.row === "wall") return state;

      const nextLane = normalizeLane(cab.row, action.lane);
      if ((cab.lane || "front") === nextLane) return state;
      cab.lane = nextLane;
      sanitizeAlignments(spec);
      return spec;
    }

    case "NUDGE_DEPTH": {
      // Move a tall cabinet forward/back by adjusting its saved depth offset.
      // action: { id, amount } — positive = back, negative = front
      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx === -1) return spec;
      const cab = spec.cabinets[cabIdx];
      if (!rowSupportsDepthOffset(cab.row)) return spec;
      const cur = cab.depthOffset || 0;
      cab.depthOffset = normalizeDepthOffset(cab.row, cur + (action.amount || 0));
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
      sanitizeAlignments(spec);
      return spec;
    }

    case "NUDGE_VERTICAL": {
      // Move a wall or tall cabinet up/down by adjusting its vertical offset.
      // action: { id, amount } — positive = down, negative = up
      const cabIdx = findCabinetIndex(spec, action.id);
      if (cabIdx === -1) return spec;
      const cab = spec.cabinets[cabIdx];
      if (!rowSupportsVerticalOffset(cab.row)) return spec;
      const cur = cab.yOffset || 0;
      cab.yOffset = normalizeYOffset(cab.row, cur + (action.amount || 0));
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
      sanitizeAlignments(spec);
      return spec;
    }

    case "SET_DIMENSION": {
      const cab = spec.cabinets.find((c) => c.id === action.id);
      if (cab && (action.field === "width" || action.field === "height" || action.field === "depth")) {
        cab[action.field] = action.value;
        sanitizeAlignments(spec);
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
      sanitizeAlignments(spec);
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

      // Merging changes the physical box identity enough that any existing
      // upper/lower anchor should be re-picked instead of guessed.
      spec.alignment = (spec.alignment || []).filter(
        (a) =>
          a.wall !== action.sourceId &&
          a.wall !== action.targetId &&
          a.base !== action.sourceId &&
          a.base !== action.targetId
      );
      sanitizeAlignments(spec);

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

      // Splitting also changes the physical box identity enough that anchored
      // uppers should be re-picked instead of silently snapping to one half.
      spec.alignment = (spec.alignment || []).filter(
        (a) => a.wall !== action.id && a.base !== action.id
      );
      sanitizeAlignments(spec);
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
      sanitizeAlignments(spec);
      return spec;
    }

    case "DELETE_GAP": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const item = spec[layoutKey][action.position];
      // Only delete if it's a gap (not a ref)
      if (item && !item.ref) {
        spec[layoutKey].splice(action.position, 1);
        sanitizeAlignments(spec);
      }
      return spec;
    }

    case "UPDATE_GAP": {
      const layoutKey = getLayoutKey(action.row);
      if (!layoutKey) return spec;
      const item = spec[layoutKey][action.position];
      if (item && !item.ref) {
        Object.assign(item, action.updates);
        sanitizeAlignments(spec);
      }
      return spec;
    }

    // ── Alignment ───────────────────────────────────────────────────

    case "SET_ALIGNMENT": {
      const wallCab = spec.cabinets.find((c) => c.id === action.wall);
      const baseCab = spec.cabinets.find((c) => c.id === action.base);
      if (!wallCab || wallCab.row !== "wall") return state;
      if (!isFrontBaseCabinet(baseCab)) return state;
      const occupiedBase = (spec.alignment || []).find(
        (a) => a.base === action.base && a.wall !== action.wall
      );
      if (occupiedBase) return state;

      spec.alignment = (spec.alignment || []).filter(
        (a) => a.wall !== action.wall && a.base !== action.base
      );
      const existing = spec.alignment.findIndex((a) => a.wall === action.wall);
      if (existing !== -1) {
        spec.alignment[existing].base = action.base;
      } else {
        spec.alignment.push({ wall: action.wall, base: action.base });
      }
      sanitizeAlignments(spec);
      return spec;
    }

    case "REMOVE_ALIGNMENT": {
      spec.alignment = spec.alignment.filter((a) => a.wall !== action.wall);
      sanitizeAlignments(spec);
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
      const placed = new Set(
        [...loaded.base_layout, ...loaded.wall_layout]
          .filter((item) => item?.ref)
          .map((item) => item.ref)
      );
      loaded.cabinets.forEach((cab) => {
        if (cab?.row === "wall") {
          delete cab.lane;
          delete cab.depthOffset;
          cab.yOffset = normalizeYOffset("wall", cab.yOffset);
        } else if (cab?.row === "tall") {
          cab.lane = normalizeLane(cab.row, cab.lane);
          cab.depthOffset = normalizeDepthOffset("tall", cab.depthOffset);
          cab.yOffset = normalizeYOffset("tall", cab.yOffset);
        } else if (cab) {
          delete cab.yOffset;
          delete cab.depthOffset;
          cab.lane = normalizeLane(cab.row, cab.lane);
        }
        const layoutKey = getLayoutKey(cab?.row);
        if (!layoutKey || placed.has(cab.id)) return;
        loaded[layoutKey].push({ ref: cab.id });
        placed.add(cab.id);
      });
      sanitizeAlignments(loaded);
      return loaded;
    }

    default:
      return spec;
  }
}
