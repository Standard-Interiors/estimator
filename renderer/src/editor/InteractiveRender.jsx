import { useCallback, useState, useRef } from "react";

// ── Shared rendering constants (mirrored from App.jsx Render) ──
const SC = 2.5;
const IDX = 0.42;
const IDY = -0.32;
const LOWER_BACK_LANE = 12;
function dp(depth) { const v = depth || 0; return { x: v * SC * IDX, y: v * SC * IDY }; }

// Confidence → visual style
const CONF_STROKE = { low: "#e07020", medium: "#c0a030", high: null };
const CONF_DASH = { low: "4,3", medium: "6,2", high: "" };
function confStyle(cab) {
  // Cabinets flagged as duplicates of another photo get a yellow dashed outline
  // so the user can see them in the layout but know they won't count in the
  // cut list. Takes precedence over confidence styling.
  if (cab?.exclude_from_cutlist) {
    return { stroke: "#eab308", dash: "6,3" };
  }
  const conf = cab?.confidence;
  if (!conf || conf === "high") return {};
  return { stroke: CONF_STROKE[conf], dash: CONF_DASH[conf] };
}

function Box3D({ cx, cy, w, h, depth, front, top, side, stroke, sw, dash }) {
  const cw = Math.max((w || 1) * SC, 1), ch = Math.max((h || 1) * SC, 1);
  const dd = dp(depth);
  return (
    <g>
      <polygon points={`${cx},${cy} ${cx + dd.x},${cy + dd.y} ${cx + cw + dd.x},${cy + dd.y} ${cx + cw},${cy}`}
        fill={top || "#f2f2f2"} stroke={stroke || "#333"} strokeWidth={(sw || 1.2) * 0.6} strokeDasharray={dash || ""}
        style={{ pointerEvents: "none" }} />
      <polygon points={`${cx + cw},${cy} ${cx + cw + dd.x},${cy + dd.y} ${cx + cw + dd.x},${cy + ch + dd.y} ${cx + cw},${cy + ch}`}
        fill={side || "#e4e4e4"} stroke={stroke || "#333"} strokeWidth={(sw || 1.2) * 0.6} strokeDasharray={dash || ""}
        style={{ pointerEvents: "none" }} />
      <polygon points={`${cx},${cy} ${cx + cw},${cy} ${cx + cw},${cy + ch} ${cx},${cy + ch}`}
        fill={front || "#fff"} stroke={stroke || "#333"} strokeWidth={sw || 1.2} strokeDasharray={dash || ""} />
    </g>
  );
}

function Face({ cab, cx, cy, w, h }) {
  const secs = Array.isArray(cab?.face?.sections) ? cab.face.sections : [];
  if (!secs.length) return null;
  const cw = w * SC, ch = h * SC, m = 3;
  const fixH = secs.reduce((s, sec) => s + (sec.height || 0) * SC, 0);
  const flexN = secs.filter(s => !s.height).length;
  const flexH = flexN > 0 ? Math.max(0, (ch - fixH) / flexN) : 0;
  const els = [];
  let sy = cy, si = 0;
  secs.forEach(sec => {
    const sh = Math.max(sec.height ? sec.height * SC : flexH, 2);
    if (sec.type === "drawer" || sec.type === "false_front") {
      els.push(<rect key={si + "r"} x={cx + m} y={sy + m} width={Math.max(cw - m * 2, 1)} height={Math.max(sh - m * 2, 1)} fill="none" stroke="#666" strokeWidth={0.8} rx={1} />);
      els.push(<line key={si + "p"} x1={cx + cw / 2 - 7} y1={sy + sh / 2} x2={cx + cw / 2 + 7} y2={sy + sh / 2} stroke="#999" strokeWidth={1.3} strokeLinecap="round" />);
    } else if (sec.type === "door" || sec.type === "glass_door") {
      const n = Math.max(sec.count || 1, 1), dw = (cw - m * 2) / n;
      if (dw >= 4) for (let di = 0; di < n; di++) {
        const dx = cx + m + di * dw;
        els.push(<rect key={`${si}d${di}`} x={dx + 1} y={sy + m} width={Math.max(dw - 2, 1)} height={Math.max(sh - m * 2, 1)} fill="none" stroke="#666" strokeWidth={0.8} rx={1} />);
        if (dw > 14) els.push(<rect key={`${si}d${di}i`} x={dx + 5} y={sy + m + 4} width={Math.max(dw - 10, 1)} height={Math.max(sh - m * 2 - 8, 1)} fill="none" stroke="#ccc" strokeWidth={0.4} rx={1} />);
        let px = n === 1 ? (sec.hinge_side === "left" ? dx + dw - 9 : dx + 9) : (di === 0 ? dx + dw - 9 : dx + 9);
        const pl = Math.min(10, sh * 0.15);
        const py = cab.row === "wall" ? sy + sh - m - 8 - pl : sy + m + 6;
        els.push(<line key={`${si}d${di}h`} x1={px} y1={py} x2={px} y2={py + pl} stroke="#999" strokeWidth={1.3} strokeLinecap="round" />);
      }
    }
    sy += sh; si++;
  });
  return <>{els}</>;
}

export default function InteractiveRender({ spec, selectedId, isMobile, onSelect, onDoubleClick, onContextMenu: onCtxMenu, onGapSelect, onNudge, onNudgeVertical, onPlaceCabinet, alignmentTargetWallId = null }) {
  if (!spec?.cabinets?.length) return <div style={{ color: "#555", padding: 20, textAlign: "center" }}>No cabinets loaded</div>;

  const cabMap = {}; spec.cabinets.forEach(c => { cabMap[c.id] = c; });
  const PAD = 45, FLOOR = 450, TOE = 4.5 * SC, CTH = 1.5 * SC, GAP = 18 * SC;
  const CTTOP = FLOOR - TOE - 34.5 * SC - CTH, WBOT = CTTOP - GAP;

  const lowerItems = []; let bx = PAD;
  (spec.base_layout || []).forEach(item => {
    const id = item.ref || item.id, cab = cabMap[id], w = cab ? cab.width : (item.width || 30);
    lowerItems.push({ id, x: bx, w, cab, item }); bx += w * SC;
  });
  const bMap = {}; lowerItems.forEach(b => { bMap[b.id] = b; });

  const aMap = {}; (spec.alignment || []).forEach(a => { aMap[a.wall] = a.base; });
  const baseToWallMap = {}; (spec.alignment || []).forEach((a) => { baseToWallMap[a.base] = a.wall; });
  const wallItems = []; let wx = PAD; let prevWasGap = false;
  (spec.wall_layout || []).forEach(item => {
    const id = item.ref || item.id, cab = cabMap[id], w = cab ? cab.width : (item.width || 30);
    if (!prevWasGap && aMap[id] && bMap[aMap[id]]) {
      const alignX = bMap[aMap[id]].x;
      if (alignX >= wx) wx = alignX;
    }
    wallItems.push({ id, x: wx, w, cab, item }); wx += w * SC;
    prevWasGap = !item.ref;
  });

  const baseCabItems = lowerItems.filter((item) => item.cab && item.cab.row !== "tall");
  const tallCabItems = lowerItems.filter((item) => item.cab && item.cab.row === "tall");
  const lowerLane = (cab) => (cab?.lane === "back" ? "back" : "front");
  const lowerDepthInset = (cab) => (lowerLane(cab) === "back" ? LOWER_BACK_LANE : 0);
  const lowerDepthOffset = (cab) => (cab?.row === "tall" ? (cab.depthOffset || 0) : 0);
  const lowerLaneOffset = (cab) => dp(lowerDepthInset(cab) + lowerDepthOffset(cab));
  const lowerVerticalOffset = (cab) => (cab?.row === "tall" ? (cab.yOffset || 0) * SC : 0);
  const supportsVerticalPlacement = (row) => row === "wall" || row === "tall";
  const maxWH = Math.max(...wallItems.filter(w => w.cab).map(w => (w.cab.height || 30)), 30) * SC;
  const WTOP = WBOT - maxWH;
  // Cap visual depth at 30" for viewBox sizing — prevents extreme depths from blowing up the layout
  const ddMax = dp(Math.min(30, Math.max(...(spec.cabinets||[]).map(c=>c.depth||(c.row==="wall"?12:24)), 24)));
  const svgW = Math.max(bx, wx) + PAD + ddMax.x + 20;
  const wallBounds = wallItems.filter((item) => item.cab).map((item) => {
    const cab = item.cab;
    const top = WTOP + (cab.yOffset || 0) * SC;
    const bottom = top + (cab.height || 30) * SC;
    return { top: top - 28, bottom: bottom + 12 };
  });
  const tallBounds = tallCabItems.map((item) => {
    const cab = item.cab;
    const laneOffset = lowerLaneOffset(cab);
    const top = FLOOR - TOE - (cab.height || 84) * SC + laneOffset.y + lowerVerticalOffset(cab);
    const bottom = top + (cab.height || 84) * SC + TOE;
    return { top: top - 20, bottom: bottom + 34 };
  });

  // Tight viewBox: crop unused vertical whitespace while still keeping moved talls visible.
  const contentTop = Math.min(
    wallBounds.length ? Math.min(...wallBounds.map((b) => b.top)) : CTTOP - 12,
    tallBounds.length ? Math.min(...tallBounds.map((b) => b.top)) : Number.POSITIVE_INFINITY,
  );
  const contentBottom = Math.max(
    FLOOR + 42,
    wallBounds.length ? Math.max(...wallBounds.map((b) => b.bottom)) : FLOOR + 42,
    tallBounds.length ? Math.max(...tallBounds.map((b) => b.bottom)) : FLOOR + 42,
  );
  const svgH = contentBottom - contentTop;
  const mergeIntervals = (intervals) => {
    if (!intervals.length) return [];
    const sorted = intervals
      .filter((interval) => interval.end > interval.start)
      .sort((a, b) => a.start - b.start);
    if (!sorted.length) return [];
    const merged = [sorted[0]];
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = merged[merged.length - 1];
      const next = sorted[i];
      if (next.start <= prev.end) {
        prev.end = Math.max(prev.end, next.end);
      } else {
        merged.push({ ...next });
      }
    }
    return merged;
  };
  const clipCounterSegments = (segments, blockers) => {
    if (!blockers.length) return segments;
    return segments.flatMap((segment) => {
      let visible = [{ start: segment.start, end: segment.end }];
      blockers.forEach((blocker) => {
        visible = visible.flatMap((piece) => {
          if (blocker.end <= piece.start || blocker.start >= piece.end) return [piece];
          const nextPieces = [];
          if (blocker.start > piece.start) nextPieces.push({ start: piece.start, end: blocker.start });
          if (blocker.end < piece.end) nextPieces.push({ start: blocker.end, end: piece.end });
          return nextPieces;
        });
      });
      return visible;
    });
  };
  const tallCounterBlockers = mergeIntervals(
    tallCabItems.map((item) => {
      const cab = item.cab;
      const laneOffset = lowerLaneOffset(cab);
      const drawX = item.x + laneOffset.x;
      const projectedRight = drawX + cab.width * SC + dp(cab.depth || 24).x;
      return { start: drawX, end: projectedRight };
    })
  );
  const buildCounterSegments = (lane) => {
    const supported = [];
    let current = null;
    lowerItems.forEach((item) => {
      const itemLane = item.cab ? lowerLane(item.cab) : "front";
      if (itemLane !== lane) {
        if (current) supported.push(current);
        current = null;
        return;
      }
      if (item.cab?.row === "tall") {
        if (current) supported.push(current);
        current = null;
        return;
      }
      const x2 = item.x + item.w * SC;
      if (!current) {
        current = { start: item.x, end: x2 };
        return;
      }
      current.end = x2;
    });
    if (current) supported.push(current);
    return clipCounterSegments(supported, tallCounterBlockers)
      .filter((segment) => segment.end > segment.start)
      .map((segment) => ({
        x: segment.start,
        w: (segment.end - segment.start) / SC,
        lane,
      }));
  };
  const frontCounterSegments = buildCounterSegments("front");
  const backCounterSegments = buildCounterSegments("back");
  const frontBaseCabItems = baseCabItems.filter((item) => lowerLane(item.cab) === "front");
  const backBaseCabItems = baseCabItems.filter((item) => lowerLane(item.cab) === "back");
  const frontTallCabItems = tallCabItems.filter((item) => lowerLane(item.cab) === "front");
  const backTallCabItems = tallCabItems.filter((item) => lowerLane(item.cab) === "back");

  const handleClick = useCallback((id) => (e) => {
    e.stopPropagation();
    onSelect(id);
  }, [onSelect]);

  const handleDblClick = useCallback((id) => (e) => {
    e.stopPropagation();
    if (onDoubleClick) onDoubleClick(id);
  }, [onDoubleClick]);

  const handleContextMenu = useCallback((id, row) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect(id);
    if (onCtxMenu) onCtxMenu({ x: e.clientX, y: e.clientY, id, row });
  }, [onSelect, onCtxMenu]);

  const handleGapClick = useCallback((item) => (e) => {
    e.stopPropagation();
    if (onGapSelect) onGapSelect(item);
  }, [onGapSelect]);

  // ── Drag-to-move state (2D: horizontal + vertical) ──
  const [drag, setDrag] = useState(null); // { id, startClientX, startClientY, dx, dy, row }
  const svgRef = useRef(null);
  const dragThreshold = 4; // px before drag starts

  const getCurrentInsertIndex = (items, id) => {
    let insertIndex = 0;
    for (const item of items) {
      if (item.id === id) return insertIndex;
      insertIndex += 1;
    }
    return insertIndex;
  };

  const getInsertIndexAtX = (items, svgX) => {
    const idx = items.findIndex((item) => svgX < item.x + (item.w * SC) / 2);
    return idx === -1 ? items.length : idx;
  };

  const getInsertX = (items, insertIndex) => {
    if (!items.length) return PAD;
    if (insertIndex <= 0) return items[0].x;
    if (insertIndex >= items.length) {
      const last = items[items.length - 1];
      return last.x + last.w * SC;
    }
    return items[insertIndex].x;
  };

  const getDropPlacement = (activeDrag) => {
    if (!activeDrag || typeof activeDrag.svgX !== "number" || typeof activeDrag.svgY !== "number") {
      return null;
    }

    const targetRow = activeDrag.row;
    const targetItems = (targetRow === "wall" ? wallItems : lowerItems).filter((item) => item.id !== activeDrag.id);
    const currentItems = activeDrag.row === "wall" ? wallItems : lowerItems;
    const currentIndex = getCurrentInsertIndex(currentItems, activeDrag.id);
    const targetIndex = activeDrag.lockHorizontal
      ? currentIndex
      : getInsertIndexAtX(targetItems, activeDrag.svgX);
    const currentYOffset = cabMap[activeDrag.id]?.yOffset || 0;
    const targetYOffset = supportsVerticalPlacement(targetRow)
      ? currentYOffset + (activeDrag.dyInches || 0)
      : undefined;
    const currentItem = currentItems.find((item) => item.id === activeDrag.id);

    return {
      id: activeDrag.id,
      targetRow,
      targetIndex,
      currentIndex,
      targetYOffset,
      previewX: activeDrag.lockHorizontal && currentItem
        ? currentItem.x
        : getInsertX(targetItems, targetIndex),
    };
  };

  const onPointerDown = useCallback((id, row) => (e) => {
    if (e.button !== 0) return; // left click only
    e.stopPropagation();
    if (alignmentTargetWallId) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    onSelect(id);
    setDrag({
      id,
      row,
      startClientX: e.clientX,
      startClientY: e.clientY,
      dx: 0,
      dy: 0,
      started: false,
      lockHorizontal: row === "wall" && !!aMap[id],
    });
  }, [aMap, alignmentTargetWallId, onSelect]);

  const onPointerMove = useCallback((e) => {
    if (!drag) return;
    const rawDx = e.clientX - drag.startClientX;
    const rawDy = e.clientY - drag.startClientY;
    if (!drag.started && Math.abs(rawDx) < dragThreshold && Math.abs(rawDy) < dragThreshold) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const svgScale = rect.width / svg.viewBox.baseVal.width;
    const svgX = (e.clientX - rect.left) / svgScale + svg.viewBox.baseVal.x;
    const svgY = (e.clientY - rect.top) / svgScale + svg.viewBox.baseVal.y;
    // Horizontal snap
    const dxSvg = rawDx / svgScale;
    const snapInchX = drag.lockHorizontal ? 0 : Math.round(dxSvg / SC);
    const snappedDx = snapInchX * SC * svgScale;
    // Vertical snap for rows that persist vertical offset.
    let snappedDy = 0, snapInchY = 0;
    if (supportsVerticalPlacement(drag.row)) {
      const dySvg = rawDy / svgScale;
      snapInchY = Math.round(dySvg / SC);
      snappedDy = snapInchY * SC * svgScale;
    }
    setDrag(d => ({ ...d, dx: snappedDx, dy: snappedDy, dxInches: snapInchX, dyInches: snapInchY, svgX, svgY, started: true }));
  }, [drag, supportsVerticalPlacement]);

  const onPointerUp = useCallback((e) => {
    if (!drag) return;
    if (drag.started) {
      const placement = getDropPlacement(drag);
      const sameSlot = placement && placement.targetRow === drag.row && placement.targetIndex === placement.currentIndex;

      if (placement && !sameSlot && onPlaceCabinet) {
        onPlaceCabinet(placement);
      } else {
        if (drag.dxInches && drag.dxInches !== 0 && onNudge) {
          onNudge(drag.id, drag.dxInches);
        }
        if (drag.dyInches && drag.dyInches !== 0 && onNudgeVertical && supportsVerticalPlacement(drag.row)) {
          onNudgeVertical(drag.id, drag.dyInches);
        }
      }
    }
    setDrag(null);
  }, [drag, onNudge, onNudgeVertical, onPlaceCabinet, supportsVerticalPlacement]);

  const highlightRect = (x, cy, w, h, row) => {
    const color = row === "wall" ? "#1a6fbf" : "#D94420";
    return (
      <rect x={x - 1.5} y={cy - 1.5} width={w * SC + 3} height={h * SC + 3}
        fill={color} fillOpacity={0.08} stroke={color} strokeWidth={2.5}
        rx={2} style={{ pointerEvents: "none" }} />
    );
  };

  const dropPlacement = drag?.started ? getDropPlacement(drag) : null;
  const dropColor = dropPlacement?.targetRow === "wall" ? "#1a6fbf" : "#D94420";
  const dropTop = dropPlacement?.targetRow === "wall"
    ? WTOP - 8
    : contentTop + 8;
  const dropBottom = dropPlacement?.targetRow === "wall" ? Math.max(WBOT + 8, contentBottom - 24) : contentBottom - 8;

  return (
    <div style={{
      background: "#fff",
      borderRadius: isMobile ? 0 : 10,
      border: isMobile ? "none" : "1px solid rgba(26,26,46,0.12)",
      padding: isMobile ? 2 : 10,
    }}
      onClick={() => onSelect(null)}>
      <svg ref={svgRef} viewBox={`0 ${contentTop} ${svgW} ${svgH}`}
        onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ display: "block", width: "100%", maxWidth: isMobile ? "100%" : svgW * 2, height: "auto", cursor: drag?.started ? "grabbing" : "pointer", touchAction: "none" }}>
        {backCounterSegments.map((segment, idx) => {
          const offset = dp(LOWER_BACK_LANE);
          return (
            <Box3D
              key={`ct-under-back-${idx}`}
              cx={segment.x + offset.x}
              cy={CTTOP + offset.y}
              w={segment.w}
              h={1.5}
              depth={25.5}
              front="none"
              top="none"
              side="none"
              stroke="#888"
              sw={0.8}
            />
          );
        })}
        {frontCounterSegments.map((segment, idx) => (
          <Box3D key={`ct-under-front-${idx}`} cx={segment.x} cy={CTTOP} w={segment.w} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#888" sw={0.8} />
        ))}

        {dropPlacement && (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={dropPlacement.previewX}
              y1={dropTop}
              x2={dropPlacement.previewX}
              y2={dropBottom}
              stroke={dropColor}
              strokeWidth={2}
              strokeDasharray="5,4"
            />
          </g>
        )}

        {/* Lower cabinets first (bases only here; talls render later so bridge uppers don't cut through them) */}
        {backBaseCabItems.map(bi => {
          const c = bi.cab, ch = c.height || 34.5, d = c.depth || 24, cy = FLOOR - TOE - ch * SC;
          const laneOffset = lowerLaneOffset(c);
          const drawX = bi.x + laneOffset.x;
          const drawY = cy + laneOffset.y;
          const isSelected = selectedId === bi.id;
          const isAlignmentCandidate =
            !!alignmentTargetWallId &&
            c.row === "base" &&
            lowerLane(c) === "front" &&
            (!baseToWallMap[bi.id] || baseToWallMap[bi.id] === alignmentTargetWallId);
          const isDragging = drag?.started && drag.id === bi.id;
          const dragTx = isDragging ? `translate(${drag.dx / (svgRef.current ? svgRef.current.getBoundingClientRect().width / svgW : 1)}, 0)` : undefined;
          const cs = confStyle(c);
          return (<g key={`b-${bi.id}`} onClick={!drag?.started ? handleClick(bi.id) : undefined} onDoubleClick={handleDblClick(bi.id)} onContextMenu={handleContextMenu(bi.id, "base")} onPointerDown={onPointerDown(bi.id, "base")} style={{ cursor: isDragging ? "grabbing" : "grab" }} transform={dragTx}>
            <rect x={drawX} y={drawY - 4} width={c.width * SC} height={ch * SC + 8 + TOE + 30} fill="transparent" />
            {isSelected && highlightRect(drawX, drawY, c.width, ch, "base")}
            {isAlignmentCandidate && (
              <rect
                x={drawX - 2}
                y={drawY - 2}
                width={c.width * SC + 4}
                height={ch * SC + 4}
                fill="#1a6fbf"
                fillOpacity={0.06}
                stroke="#1a6fbf"
                strokeWidth={1.5}
                strokeDasharray="4,3"
                rx={2}
                style={{ pointerEvents: "none" }}
              />
            )}
            <Box3D cx={drawX} cy={drawY} w={c.width} h={ch} depth={d} stroke={cs.stroke} dash={cs.dash} />
            <rect x={drawX + 2 * SC} y={FLOOR - TOE + laneOffset.y} width={Math.max(0, c.width * SC - 4 * SC)} height={TOE} fill="none" stroke="#ccc" strokeWidth={0.4} />
            <Face cab={c} cx={drawX} cy={drawY} w={c.width} h={ch} />
            <text x={drawX + c.width * SC / 2} y={FLOOR + 13 + laneOffset.y} textAnchor="middle" fontSize={9} fill={cs.stroke || "#D94420"} fontWeight={700} fontFamily="monospace">{bi.id}</text>
            <text x={drawX + c.width * SC / 2} y={FLOOR + 23 + laneOffset.y} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width < 21 ? `${c.width}w` : `${c.width}w ${ch}h ${d}d`}</text>
            {isDragging && <text x={drawX + c.width * SC / 2} y={drawY - 8} textAnchor="middle" fontSize={10} fill="#D94420" fontWeight={700} fontFamily="monospace">{drag.dxInches > 0 ? "+" : ""}{drag.dxInches}"</text>}
          </g>);
        })}

        {frontBaseCabItems.map(bi => {
          const c = bi.cab, ch = c.height || 34.5, d = c.depth || 24, cy = FLOOR - TOE - ch * SC;
          const isSelected = selectedId === bi.id;
          const isAlignmentCandidate =
            !!alignmentTargetWallId &&
            c.row === "base" &&
            lowerLane(c) === "front" &&
            (!baseToWallMap[bi.id] || baseToWallMap[bi.id] === alignmentTargetWallId);
          const isDragging = drag?.started && drag.id === bi.id;
          const dragTx = isDragging ? `translate(${drag.dx / (svgRef.current ? svgRef.current.getBoundingClientRect().width / svgW : 1)}, 0)` : undefined;
          const cs = confStyle(c);
          return (<g key={`b-${bi.id}`} onClick={!drag?.started ? handleClick(bi.id) : undefined} onDoubleClick={handleDblClick(bi.id)} onContextMenu={handleContextMenu(bi.id, "base")} onPointerDown={onPointerDown(bi.id, "base")} style={{ cursor: isDragging ? "grabbing" : "grab" }} transform={dragTx}>
            <rect x={bi.x} y={cy - 4} width={c.width * SC} height={ch * SC + 8 + TOE + 30} fill="transparent" />
            {isSelected && highlightRect(bi.x, cy, c.width, ch, "base")}
            {isAlignmentCandidate && (
              <rect
                x={bi.x - 2}
                y={cy - 2}
                width={c.width * SC + 4}
                height={ch * SC + 4}
                fill="#1a6fbf"
                fillOpacity={0.06}
                stroke="#1a6fbf"
                strokeWidth={1.5}
                strokeDasharray="4,3"
                rx={2}
                style={{ pointerEvents: "none" }}
              />
            )}
            <Box3D cx={bi.x} cy={cy} w={c.width} h={ch} depth={d} stroke={cs.stroke} dash={cs.dash} />
            <rect x={bi.x + 2 * SC} y={FLOOR - TOE} width={Math.max(0, c.width * SC - 4 * SC)} height={TOE} fill="none" stroke="#ccc" strokeWidth={0.4} />
            <Face cab={c} cx={bi.x} cy={cy} w={c.width} h={ch} />
            <text x={bi.x + c.width * SC / 2} y={FLOOR + 13} textAnchor="middle" fontSize={9} fill={cs.stroke || "#D94420"} fontWeight={700} fontFamily="monospace">{bi.id}</text>
            <text x={bi.x + c.width * SC / 2} y={FLOOR + 23} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width < 21 ? `${c.width}w` : `${c.width}w ${ch}h ${d}d`}</text>
            {isDragging && <text x={bi.x + c.width * SC / 2} y={cy - 8} textAnchor="middle" fontSize={10} fill="#D94420" fontWeight={700} fontFamily="monospace">{drag.dxInches > 0 ? "+" : ""}{drag.dxInches}"</text>}
          </g>);
        })}
        {/* Lower-row gaps on top (clickable) */}
        {lowerItems.filter(bi => !bi.cab).map(bi => {
            const gapW = bi.w * SC, midX = bi.x + gapW / 2;
            const label = (bi.item?.label || "").toUpperCase();
            const dimY = FLOOR - TOE - 34.5 * SC / 2;
            return (<g key={`a-${bi.id}`} onClick={handleGapClick(bi.item)} style={{ cursor: "pointer" }}>
              <rect x={bi.x} y={dimY - 10} width={gapW} height={30} fill="transparent" />
              <line x1={bi.x + 1} y1={dimY - 6} x2={bi.x + 1} y2={dimY + 6} stroke="#bbb" strokeWidth={0.6} />
              <line x1={bi.x + gapW - 1} y1={dimY - 6} x2={bi.x + gapW - 1} y2={dimY + 6} stroke="#bbb" strokeWidth={0.6} />
              <line x1={bi.x + 1} y1={dimY} x2={bi.x + gapW - 1} y2={dimY} stroke="#bbb" strokeWidth={0.5} strokeDasharray="3,2" />
              <text x={midX} y={dimY - 4} textAnchor="middle" fontSize={8} fill="#999" fontWeight={600} fontFamily="monospace">{bi.w}"</text>
              {label && <text x={midX} y={dimY + 11} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">{label}</text>}
            </g>);
        })}

        {backCounterSegments.map((segment, idx) => {
          const offset = dp(LOWER_BACK_LANE);
          return (
            <Box3D
              key={`ct-top-back-${idx}`}
              cx={segment.x + offset.x}
              cy={CTTOP + offset.y}
              w={segment.w}
              h={1.5}
              depth={25.5}
              front="none"
              top="none"
              side="none"
              stroke="#444"
              sw={1.3}
            />
          );
        })}
        {frontCounterSegments.map((segment, idx) => (
          <Box3D key={`ct-top-front-${idx}`} cx={segment.x} cy={CTTOP} w={segment.w} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#444" sw={1.3} />
        ))}

        {/* Wall cabinets first — top-aligned (all tops at WTOP) */}
        {wallItems.filter(wi => wi.cab).map(wi => {
          const c = wi.cab, ch = c.height || 30, d = c.depth || 12;
          const wcy = WTOP + (c.yOffset || 0) * SC; // top-align with vertical offset
          const isSelected = selectedId === wi.id;
          const isDragging = drag?.started && drag.id === wi.id;
          const svgScale = svgRef.current ? svgRef.current.getBoundingClientRect().width / svgW : 1;
          const dragTx = isDragging ? `translate(${drag.dx / svgScale}, ${drag.dy / svgScale})` : undefined;
          const midX = wi.x + c.width * SC / 2;
          const cs = confStyle(c);
          return (<g key={`w-${wi.id}`} onClick={!drag?.started ? handleClick(wi.id) : undefined} onDoubleClick={handleDblClick(wi.id)} onContextMenu={handleContextMenu(wi.id, "wall")} onPointerDown={onPointerDown(wi.id, "wall")} style={{ cursor: isDragging ? "grabbing" : "grab" }} transform={dragTx}>
            <rect x={wi.x} y={wcy - 20} width={c.width * SC} height={ch * SC + 28} fill="transparent" />
            {isSelected && highlightRect(wi.x, wcy, c.width, ch, "wall")}
            <Box3D cx={wi.x} cy={wcy} w={c.width} h={ch} depth={d} front="#fff" top="#eee" side="#ddd" stroke={cs.stroke} dash={cs.dash} />
            <Face cab={c} cx={wi.x} cy={wcy} w={c.width} h={ch} />
            <text x={midX} y={wcy - 5} textAnchor="middle" fontSize={9} fill={cs.stroke || "#1a6fbf"} fontWeight={700} fontFamily="monospace">{wi.id}</text>
            <text x={midX} y={wcy - 15} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width < 21 ? `${c.width}w` : `${c.width}x${ch}x${d}`}</text>
            {isDragging && (drag.dxInches !== 0 || drag.dyInches !== 0) && <text x={midX} y={wcy - 22} textAnchor="middle" fontSize={10} fill="#1a6fbf" fontWeight={700} fontFamily="monospace">{drag.dxInches !== 0 ? `${drag.dxInches > 0 ? "+" : ""}${drag.dxInches}"` : ""}{drag.dxInches !== 0 && drag.dyInches !== 0 ? " " : ""}{drag.dyInches !== 0 ? `${drag.dyInches > 0 ? "↓" : "↑"}${Math.abs(drag.dyInches)}"` : ""}</text>}
          </g>);
        })}

        {/* Wall gaps on top (clickable) */}
        {wallItems.filter(wi => !wi.cab).map(wi => {
            const gapW = wi.w * SC, midX = wi.x + gapW / 2;
            const label = (wi.item?.label || "").toUpperCase();
            const dimY = WTOP + maxWH / 2;
            return (<g key={`h-${wi.id}`} onClick={handleGapClick(wi.item)} style={{ cursor: "pointer" }}>
              <rect x={wi.x} y={dimY - 10} width={gapW} height={30} fill="transparent" />
              <line x1={wi.x + 1} y1={dimY - 6} x2={wi.x + 1} y2={dimY + 6} stroke="#bbb" strokeWidth={0.6} />
              <line x1={wi.x + gapW - 1} y1={dimY - 6} x2={wi.x + gapW - 1} y2={dimY + 6} stroke="#bbb" strokeWidth={0.6} />
              <line x1={wi.x + 1} y1={dimY} x2={wi.x + gapW - 1} y2={dimY} stroke="#bbb" strokeWidth={0.5} strokeDasharray="3,2" />
              <text x={midX} y={dimY - 4} textAnchor="middle" fontSize={8} fill="#999" fontWeight={600} fontFamily="monospace">{wi.w}"</text>
              {label && <text x={midX} y={dimY + 11} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">{label}</text>}
            </g>);
        })}

        {/* Back-lane talls keep tall-specific rendering, but shift onto the setback lane. */}
        {backTallCabItems.map(ti => {
          const c = ti.cab, ch = c.height || 84, d = c.depth || 24, cy = FLOOR - TOE - ch * SC;
          const laneOffset = lowerLaneOffset(c);
          const verticalOffset = lowerVerticalOffset(c);
          const drawX = ti.x + laneOffset.x;
          const drawY = cy + laneOffset.y + verticalOffset;
          const isSelected = selectedId === ti.id;
          const isDragging = drag?.started && drag.id === ti.id;
          const svgScale = svgRef.current ? svgRef.current.getBoundingClientRect().width / svgW : 1;
          const dragTx = isDragging ? `translate(${drag.dx / svgScale}, ${drag.dy / svgScale})` : undefined;
          const cs = confStyle(c);
          return (<g key={`t-${ti.id}`} onClick={!drag?.started ? handleClick(ti.id) : undefined} onDoubleClick={handleDblClick(ti.id)} onContextMenu={handleContextMenu(ti.id, "tall")} onPointerDown={onPointerDown(ti.id, "tall")} style={{ cursor: isDragging ? "grabbing" : "grab" }} transform={dragTx}>
            <rect x={drawX} y={drawY - 4} width={c.width * SC} height={ch * SC + 8 + TOE + 30} fill="transparent" />
            {isSelected && highlightRect(drawX, drawY, c.width, ch, "tall")}
            <Box3D cx={drawX} cy={drawY} w={c.width} h={ch} depth={d} stroke={cs.stroke} dash={cs.dash} />
            <rect x={drawX + 2 * SC} y={FLOOR - TOE + laneOffset.y + verticalOffset} width={Math.max(0, c.width * SC - 4 * SC)} height={TOE} fill="none" stroke="#ccc" strokeWidth={0.4} />
            <Face cab={c} cx={drawX} cy={drawY} w={c.width} h={ch} />
            <text x={drawX + c.width * SC / 2} y={FLOOR + 13 + laneOffset.y + verticalOffset} textAnchor="middle" fontSize={9} fill={cs.stroke || "#D94420"} fontWeight={700} fontFamily="monospace">{ti.id}</text>
            <text x={drawX + c.width * SC / 2} y={FLOOR + 23 + laneOffset.y + verticalOffset} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{`${c.width}w ${ch}h ${d}d`}</text>
            {isDragging && (drag.dxInches !== 0 || drag.dyInches !== 0) && <text x={drawX + c.width * SC / 2} y={drawY - 8} textAnchor="middle" fontSize={10} fill="#D94420" fontWeight={700} fontFamily="monospace">{drag.dxInches !== 0 ? `${drag.dxInches > 0 ? "+" : ""}${drag.dxInches}"` : ""}{drag.dxInches !== 0 && drag.dyInches !== 0 ? " " : ""}{drag.dyInches !== 0 ? `${drag.dyInches > 0 ? "↓" : "↑"}${Math.abs(drag.dyInches)}"` : ""}</text>}
          </g>);
        })}

        {/* Tall cabinets render after uppers so a pantry/oven stack stays visually in front of bridge cabinets. */}
        {frontTallCabItems.map(ti => {
          const c = ti.cab, ch = c.height || 84, d = c.depth || 24, cy = FLOOR - TOE - ch * SC;
          const verticalOffset = lowerVerticalOffset(c);
          const drawY = cy + verticalOffset;
          const isSelected = selectedId === ti.id;
          const isDragging = drag?.started && drag.id === ti.id;
          const svgScale = svgRef.current ? svgRef.current.getBoundingClientRect().width / svgW : 1;
          const dragTx = isDragging ? `translate(${drag.dx / svgScale}, ${drag.dy / svgScale})` : undefined;
          const cs = confStyle(c);
          return (<g key={`t-${ti.id}`} onClick={!drag?.started ? handleClick(ti.id) : undefined} onDoubleClick={handleDblClick(ti.id)} onContextMenu={handleContextMenu(ti.id, "tall")} onPointerDown={onPointerDown(ti.id, "tall")} style={{ cursor: isDragging ? "grabbing" : "grab" }} transform={dragTx}>
            <rect x={ti.x} y={drawY - 4} width={c.width * SC} height={ch * SC + 8 + TOE + 30} fill="transparent" />
            {isSelected && highlightRect(ti.x, drawY, c.width, ch, "tall")}
            <Box3D cx={ti.x} cy={drawY} w={c.width} h={ch} depth={d} stroke={cs.stroke} dash={cs.dash} />
            <rect x={ti.x + 2 * SC} y={FLOOR - TOE + verticalOffset} width={Math.max(0, c.width * SC - 4 * SC)} height={TOE} fill="none" stroke="#ccc" strokeWidth={0.4} />
            <Face cab={c} cx={ti.x} cy={drawY} w={c.width} h={ch} />
            <text x={ti.x + c.width * SC / 2} y={FLOOR + 13 + verticalOffset} textAnchor="middle" fontSize={9} fill={cs.stroke || "#D94420"} fontWeight={700} fontFamily="monospace">{ti.id}</text>
            <text x={ti.x + c.width * SC / 2} y={FLOOR + 23 + verticalOffset} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{`${c.width}w ${ch}h ${d}d`}</text>
            {isDragging && (drag.dxInches !== 0 || drag.dyInches !== 0) && <text x={ti.x + c.width * SC / 2} y={drawY - 8} textAnchor="middle" fontSize={10} fill="#D94420" fontWeight={700} fontFamily="monospace">{drag.dxInches !== 0 ? `${drag.dxInches > 0 ? "+" : ""}${drag.dxInches}"` : ""}{drag.dxInches !== 0 && drag.dyInches !== 0 ? " " : ""}{drag.dyInches !== 0 ? `${drag.dyInches > 0 ? "↓" : "↑"}${Math.abs(drag.dyInches)}"` : ""}</text>}
          </g>);
        })}

        {wallItems.length > 0 && (() => {
          const mn = Math.min(...wallItems.map(p => p.x)), mx = Math.max(...wallItems.map(p => p.x + p.w * SC)), dd = dp(12);
          return <g>
            <line x1={mn} y1={WBOT} x2={mx} y2={WBOT} stroke="#bbb" strokeWidth={0.5} strokeDasharray="4,3" />
            <line x1={mn} y1={WTOP} x2={mx} y2={WTOP} stroke="#444" strokeWidth={1} />
            <line x1={mx} y1={WTOP} x2={mx + dd.x} y2={WTOP + dd.y} stroke="#666" strokeWidth={0.5} />
          </g>;
        })()}
        <line x1={0} y1={FLOOR} x2={svgW} y2={FLOOR} stroke="#e0e0e0" strokeWidth={0.5} />
      </svg>
    </div>
  );
}
