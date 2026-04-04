import { useState } from "react";
import { calcDoorSizes, formatFraction, FRAME_OFFSETS, SCRIBE_OFFSETS } from "../state/specHelpers";

const MONO = "'JetBrains Mono',monospace";

/**
 * 3/4 angle SVG showing a single door/drawer section in context,
 * with editable dimensions and scribe controls.
 */
export default function DoorDetailView({ cab, spec, sectionIndex, dispatch, onBack, onPrev, onNext, totalSections }) {
  const [overrideMode, setOverrideMode] = useState(false);

  const fs = spec.frame_style || "framed";
  const offsets = FRAME_OFFSETS[fs];
  const section = cab.face?.sections?.[sectionIndex];
  if (!section) return null;

  const sizes = calcDoorSizes(cab, fs);
  const ds = sizes.find(s => s.sectionIndex === sectionIndex);
  if (!ds) return null;

  const scribe = cab.scribe || {};
  const isDouble = ds.count >= 2 && (ds.type === "door" || ds.type === "glass_door");
  const doorW = isDouble ? ds.perDoorWidth : ds.width;
  const doorH = ds.height;

  const rowColor = cab.row === "base" ? "#D94420" : "#1a6fbf";

  // 3/4 angle SVG params
  const SC = 4; // pixels per inch for detail view
  const ISO = { dx: 0.35, dy: -0.25 }; // isometric offset per depth unit
  const pad = 40;
  const cabW = cab.width * SC;
  const cabH = (ds.type === "drawer" ? (section.height || 6) + 4 : doorH + 4) * SC;
  const depth = 12 * SC; // show 12" of depth
  const dOffX = depth * ISO.dx;
  const dOffY = depth * ISO.dy;
  const svgW = cabW + dOffX + pad * 2;
  const svgH = cabH + Math.abs(dOffY) + pad * 2 + 60;

  // Cabinet opening position
  const ox = pad;
  const oy = pad + Math.abs(dOffY);

  // Door position (overlayed on cabinet)
  const doorPxW = doorW * SC;
  const doorPxH = doorH * SC;
  const doorX = ox + (cabW - (isDouble ? doorPxW * 2 + offsets.centerStile * SC : doorPxW)) / 2;
  const doorY = oy + (cabH - doorPxH) / 2;

  // Formula display
  const formulaW = `${cab.width}" - ${offsets.width}" ${scribe.left ? `- ${SCRIBE_OFFSETS.side}" L` : ""}${scribe.right ? ` - ${SCRIBE_OFFSETS.side}" R` : ""}${isDouble ? ` - ${offsets.centerStile}" stile ÷ 2` : ""} = ${formatFraction(doorW)}"`;
  const formulaH = ds.type === "drawer"
    ? `Drawer height: ${formatFraction(doorH)}"`
    : `${cab.height}" - ${cab.row === "base" ? `${offsets.baseDeduct}" base` : "0"} ${cab.row === "base" && section.height ? "" : `- ${offsets.height}" frame`}${scribe.top ? ` - ${SCRIBE_OFFSETS.top}" top` : ""} = ${formatFraction(doorH)}"`;

  const typeLabel = ds.type === "door" ? "Door" : ds.type === "glass_door" ? "Glass Door" : ds.type === "drawer" ? "Drawer" : "False Front";

  const handleOverride = (field, val) => {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return;
    dispatch({
      type: "SET_SECTION_OVERRIDE",
      cabId: cab.id,
      sectionIndex,
      ...(field === "width" ? { widthOverride: num } : { heightOverride: num }),
    });
  };

  const clearOverrides = () => {
    dispatch({
      type: "SET_SECTION_OVERRIDE",
      cabId: cab.id,
      sectionIndex,
      widthOverride: null,
      heightOverride: null,
    });
    setOverrideMode(false);
  };

  return (
    <div style={{ background: "#0c0c14", borderTop: "1px solid #1a1a2a", padding: "10px 14px", flexShrink: 0 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button onClick={onBack} style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
          background: "transparent", border: "1px solid #2a2a3a", color: "#888", fontFamily: MONO,
        }}>← {cab.id}</button>
        <span style={{ color: rowColor, fontWeight: 700, fontSize: 14, fontFamily: MONO }}>{typeLabel}</span>
        <span style={{ color: "#555", fontSize: 11, fontFamily: MONO }}>
          {isDouble ? `(x${ds.count})` : ""} Section {sectionIndex + 1}/{totalSections}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: "#22c55e", fontSize: 12, fontWeight: 700, fontFamily: MONO }}>
          {formatFraction(doorW)}" × {formatFraction(doorH)}"
        </span>
      </div>

      {/* SVG Detail View */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", maxWidth: 400, height: "auto", background: "#08080e", borderRadius: 8 }}>
          {/* Cabinet opening - gray frame */}
          <rect x={ox} y={oy} width={cabW} height={cabH} fill="none" stroke="#444" strokeWidth={2} strokeDasharray="6,3" />
          {/* Cabinet depth lines (isometric) */}
          <line x1={ox} y1={oy} x2={ox + dOffX} y2={oy + dOffY} stroke="#333" strokeWidth={1} />
          <line x1={ox + cabW} y1={oy} x2={ox + cabW + dOffX} y2={oy + dOffY} stroke="#333" strokeWidth={1} />
          <line x1={ox + dOffX} y1={oy + dOffY} x2={ox + cabW + dOffX} y2={oy + dOffY} stroke="#333" strokeWidth={1} />
          {/* Top face */}
          <polygon points={`${ox},${oy} ${ox + dOffX},${oy + dOffY} ${ox + cabW + dOffX},${oy + dOffY} ${ox + cabW},${oy}`}
            fill="#1a1a2a" stroke="#444" strokeWidth={1} />

          {/* Door/drawer face - white overlay */}
          {isDouble ? (
            <>
              <rect x={doorX} y={doorY} width={doorPxW} height={doorPxH} fill="#fff" stroke="#22c55e" strokeWidth={2} rx={2} />
              <rect x={doorX + doorPxW + offsets.centerStile * SC} y={doorY} width={doorPxW} height={doorPxH} fill="#fff" stroke="#22c55e" strokeWidth={2} rx={2} />
              {/* Hinge marks */}
              <circle cx={doorX + doorPxW - 6} cy={doorY + 20} r={3} fill="#D94420" />
              <circle cx={doorX + doorPxW - 6} cy={doorY + doorPxH - 20} r={3} fill="#D94420" />
              <circle cx={doorX + doorPxW + offsets.centerStile * SC + 6} cy={doorY + 20} r={3} fill="#D94420" />
              <circle cx={doorX + doorPxW + offsets.centerStile * SC + 6} cy={doorY + doorPxH - 20} r={3} fill="#D94420" />
            </>
          ) : (
            <>
              <rect x={doorX} y={doorY} width={doorPxW} height={doorPxH}
                fill={ds.type === "drawer" ? "#f5e6d0" : "#fff"}
                stroke={ds.type === "drawer" ? "#f97216" : "#22c55e"} strokeWidth={2} rx={2} />
              {/* Hinge marks for doors */}
              {(ds.type === "door" || ds.type === "glass_door") && (
                <>
                  <circle cx={section.hinge_side === "left" ? doorX + 6 : doorX + doorPxW - 6} cy={doorY + 20} r={3} fill="#D94420" />
                  <circle cx={section.hinge_side === "left" ? doorX + 6 : doorX + doorPxW - 6} cy={doorY + doorPxH - 20} r={3} fill="#D94420" />
                </>
              )}
              {/* Drawer slide lines */}
              {ds.type === "drawer" && (
                <>
                  <line x1={ox + 4} y1={doorY + doorPxH / 2} x2={ox + 4 + dOffX * 0.6} y2={doorY + doorPxH / 2 + dOffY * 0.6} stroke="#888" strokeWidth={2} />
                  <line x1={ox + cabW - 4} y1={doorY + doorPxH / 2} x2={ox + cabW - 4 + dOffX * 0.6} y2={doorY + doorPxH / 2 + dOffY * 0.6} stroke="#888" strokeWidth={2} />
                </>
              )}
            </>
          )}

          {/* Width dimension line */}
          <line x1={doorX} y1={oy + cabH + 16} x2={doorX + doorPxW} y2={oy + cabH + 16} stroke="#D94420" strokeWidth={1.5} />
          <line x1={doorX} y1={oy + cabH + 10} x2={doorX} y2={oy + cabH + 22} stroke="#D94420" strokeWidth={1} />
          <line x1={doorX + doorPxW} y1={oy + cabH + 10} x2={doorX + doorPxW} y2={oy + cabH + 22} stroke="#D94420" strokeWidth={1} />
          <text x={doorX + doorPxW / 2} y={oy + cabH + 32} textAnchor="middle" fontSize={11} fill="#D94420" fontWeight={700} fontFamily="monospace">
            {formatFraction(doorW)}"
          </text>

          {/* Height dimension line */}
          <line x1={ox + cabW + 16} y1={doorY} x2={ox + cabW + 16} y2={doorY + doorPxH} stroke="#1a6fbf" strokeWidth={1.5} />
          <line x1={ox + cabW + 10} y1={doorY} x2={ox + cabW + 22} y2={doorY} stroke="#1a6fbf" strokeWidth={1} />
          <line x1={ox + cabW + 10} y1={doorY + doorPxH} x2={ox + cabW + 22} y2={doorY + doorPxH} stroke="#1a6fbf" strokeWidth={1} />
          <text x={ox + cabW + 28} y={doorY + doorPxH / 2 + 4} fontSize={11} fill="#1a6fbf" fontWeight={700} fontFamily="monospace">
            {formatFraction(doorH)}"
          </text>

          {/* Cabinet width label */}
          <text x={ox + cabW / 2} y={oy - 8} textAnchor="middle" fontSize={9} fill="#666" fontFamily="monospace">
            Cabinet: {cab.width}"
          </text>

          {/* Scribe indicators */}
          {scribe.left && <line x1={ox - 3} y1={oy} x2={ox - 3} y2={oy + cabH} stroke="#eab308" strokeWidth={3} />}
          {scribe.right && <line x1={ox + cabW + 3} y1={oy} x2={ox + cabW + 3} y2={oy + cabH} stroke="#eab308" strokeWidth={3} />}
          {scribe.top && <line x1={ox} y1={oy - 3} x2={ox + cabW} y2={oy - 3} stroke="#eab308" strokeWidth={3} />}
        </svg>

        {/* Controls panel */}
        <div style={{ flex: 1, minWidth: 200 }}>
          {/* Dimensions */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#666", fontWeight: 600, marginBottom: 6, fontFamily: MONO }}>CABINET</div>
            <span style={{ color: "#888", fontSize: 12, fontFamily: MONO }}>{cab.width}" w × {cab.height}" h × {cab.depth}" d</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#666", fontWeight: 600, marginBottom: 6, fontFamily: MONO }}>
              {typeLabel.toUpperCase()} CUT SIZE
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="number" step="0.0625"
                defaultValue={Math.round(doorW * 10000) / 10000}
                disabled={!overrideMode}
                onBlur={e => overrideMode && handleOverride("width", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                style={{
                  width: 80, height: 32, background: overrideMode ? "#14141e" : "#0a0a14",
                  border: `1px solid ${overrideMode ? "#8b5cf6" : "#1a1a2a"}`, borderRadius: 4,
                  color: "#eee", textAlign: "center", fontSize: 13, fontFamily: MONO, fontWeight: 700,
                }}
              />
              <span style={{ color: "#555", fontSize: 11 }}>w</span>
              <span style={{ color: "#333" }}>×</span>
              <input type="number" step="0.0625"
                defaultValue={Math.round(doorH * 10000) / 10000}
                disabled={!overrideMode}
                onBlur={e => overrideMode && handleOverride("height", e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                style={{
                  width: 80, height: 32, background: overrideMode ? "#14141e" : "#0a0a14",
                  border: `1px solid ${overrideMode ? "#8b5cf6" : "#1a1a2a"}`, borderRadius: 4,
                  color: "#eee", textAlign: "center", fontSize: 13, fontFamily: MONO, fontWeight: 700,
                }}
              />
              <span style={{ color: "#555", fontSize: 11 }}>h</span>
            </div>
          </div>

          {/* Override toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => { setOverrideMode(false); clearOverrides(); }}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
                border: "none", fontFamily: MONO,
                background: !overrideMode ? "rgba(34,197,94,0.15)" : "transparent",
                color: !overrideMode ? "#22c55e" : "#555",
              }}>Auto-calc</button>
            <button onClick={() => setOverrideMode(true)}
              style={{
                padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer",
                border: "none", fontFamily: MONO,
                background: overrideMode ? "rgba(139,92,246,0.15)" : "transparent",
                color: overrideMode ? "#8b5cf6" : "#555",
              }}>Override</button>
          </div>

          {/* Scribe toggles */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#666", fontWeight: 600, marginBottom: 6, fontFamily: MONO }}>SCRIBE</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["left", "Left"], ["right", "Right"], ["top", "Top"]].map(([key, label]) => {
                const active = scribe[key];
                return (
                  <button key={key} onClick={() => dispatch({ type: "SET_SCRIBE", id: cab.id, updates: { [key]: !active } })}
                    style={{
                      padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                      border: "none", fontFamily: MONO, minHeight: 36,
                      background: active ? "rgba(234,179,8,0.2)" : "#14141e",
                      color: active ? "#eab308" : "#555",
                    }}>{label}</button>
                );
              })}
            </div>
          </div>

          {/* Formula */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, color: "#666", fontWeight: 600, marginBottom: 4, fontFamily: MONO }}>FORMULA</div>
            <div style={{ fontSize: 10, color: "#888", fontFamily: MONO, lineHeight: 1.6 }}>
              <div>W: {formulaW}</div>
              <div>H: {formulaH}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={onPrev} disabled={sectionIndex <= 0}
          style={{
            flex: 1, padding: "8px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: sectionIndex > 0 ? "pointer" : "default",
            background: "#14141e", border: "1px solid #2a2a3a", color: sectionIndex > 0 ? "#aaa" : "#333", fontFamily: MONO,
          }}>← Prev Section</button>
        <button onClick={onNext} disabled={sectionIndex >= totalSections - 1}
          style={{
            flex: 1, padding: "8px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: sectionIndex < totalSections - 1 ? "pointer" : "default",
            background: "#14141e", border: "1px solid #2a2a3a", color: sectionIndex < totalSections - 1 ? "#aaa" : "#333", fontFamily: MONO,
          }}>Next Section →</button>
      </div>
    </div>
  );
}
