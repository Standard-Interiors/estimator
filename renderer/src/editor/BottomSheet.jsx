import { useState } from "react";
import WidthGrid from "./WidthGrid";
import ActionRow from "./ActionRow";
import {
  BASE_TYPES, WALL_TYPES, WALL_HEIGHTS, BASE_HEIGHT,
  BASE_DEPTH, WALL_DEPTH, calcDoorSizes
} from "../state/specHelpers";

export default function BottomSheet({ spec, selectedId, dispatch, onSelect, onInsert, onSectionClick }) {
  const [showMore, setShowMore] = useState(false);

  const cab = selectedId ? spec.cabinets.find(c => c.id === selectedId) : null;

  if (!cab) {
    return (
      <div style={{
        background: "#0c0c14", borderTop: "1px solid #1a1a2a",
        padding: "24px 16px", textAlign: "center"
      }}>
        <div style={{ color: "#555", fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
          Tap a cabinet to edit
        </div>
      </div>
    );
  }

  const row = cab.row;
  const rowColor = row === "base" ? "#D94420" : "#1a6fbf";
  const types = row === "base" ? BASE_TYPES : WALL_TYPES;
  const heightPresets = row === "base" ? [BASE_HEIGHT] : WALL_HEIGHTS;
  const depthPresets = row === "base" ? [BASE_DEPTH] : [WALL_DEPTH];

  const handleWidthChange = (w) => {
    dispatch({ type: "SET_DIMENSION", id: cab.id, field: "width", value: w });
  };

  const handleTypeChange = (newType) => {
    dispatch({ type: "CHANGE_TYPE", id: cab.id, newType });
  };

  const handleHeightChange = (h) => {
    dispatch({ type: "SET_DIMENSION", id: cab.id, field: "height", value: h });
  };

  const handleDepthChange = (d) => {
    dispatch({ type: "SET_DIMENSION", id: cab.id, field: "depth", value: d });
  };

  const typePill = (t) => {
    const active = cab.type === t;
    const label = t.replace("base_", "").replace("wall_", "").replace("_", " ");
    return (
      <button key={t} onClick={() => handleTypeChange(t)} style={{
        minHeight: 36, borderRadius: 20, padding: "0 14px",
        background: active ? rowColor : "#14141e",
        border: active ? `2px solid ${rowColor}` : "1px solid #2a2a3a",
        color: active ? "#fff" : "#999",
        fontWeight: active ? 700 : 400, fontSize: 11,
        fontFamily: "'DM Sans',sans-serif",
        cursor: "pointer", whiteSpace: "nowrap", textTransform: "capitalize"
      }}>{label}</button>
    );
  };

  const sectionBadge = (sec, i) => {
    const colors = {
      drawer: { bg: "#f972161a", fg: "#f97216" },
      false_front: { bg: "#8b5cf61a", fg: "#8b5cf6" },
      door: { bg: "#22c55e1a", fg: "#22c55e" },
      glass_door: { bg: "#3b82f61a", fg: "#3b82f6" },
      open: { bg: "#eab3081a", fg: "#eab308" },
    };
    const c = colors[sec.type] || colors.door;
    return (
      <span key={i} style={{
        display: "inline-block", fontSize: 10, padding: "3px 8px",
        borderRadius: 4, fontFamily: "'JetBrains Mono',monospace",
        background: c.bg, color: c.fg, marginRight: 4
      }}>
        {sec.type}{sec.count > 1 ? ` x${sec.count}` : ""}{sec.height ? ` ${sec.height}"` : ""}
        {sec.hinge_side ? ` ${sec.hinge_side}` : ""}
      </span>
    );
  };

  return (
    <div style={{
      background: "#0c0c14", borderTop: "1px solid #1a1a2a",
      padding: "12px 12px 16px"
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 10
      }}>
        <span style={{
          color: rowColor, fontWeight: 700, fontSize: 18,
          fontFamily: "'JetBrains Mono',monospace"
        }}>{cab.id}</span>
        <span style={{
          background: "#14141e", border: "1px solid #2a2a3a",
          borderRadius: 4, padding: "2px 8px",
          color: "#888", fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace",
          textTransform: "capitalize"
        }}>{cab.type.replace("_", " ")}</span>
        <span style={{ flex: 1 }} />
        <span style={{
          color: "#e0e0e0", fontWeight: 700, fontSize: 22,
          fontFamily: "'JetBrains Mono',monospace"
        }}>{cab.width}"</span>
      </div>

      {/* Type picker */}
      <div style={{
        display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12,
        overflowX: "auto", WebkitOverflowScrolling: "touch"
      }}>
        {types.map(typePill)}
      </div>

      {/* Width grid */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 10, color: "#666", fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em"
        }}>WIDTH</div>
        <WidthGrid currentWidth={cab.width} rowColor={rowColor} onWidthChange={handleWidthChange} />
      </div>

      {/* Face sections + front sizes — ALWAYS visible (critical for tweaking) */}
      {cab.face?.sections?.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{
            fontSize: 10, color: "#666", fontWeight: 600,
            fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em"
          }}>FACE SECTIONS</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
            {cab.face.sections.map(sectionBadge)}
          </div>
          <div style={{
            fontSize: 10, color: "#666", fontWeight: 600,
            fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em",
            display: "flex", alignItems: "center", gap: 6,
          }}>FRONT SIZES <span style={{ fontWeight: 400, color: "#D94420", fontSize: 9, letterSpacing: 0 }}>tap to edit →</span></div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {calcDoorSizes(cab, spec.frame_style || "framed").map((ds, i) => {
              const colors = { door: "#22c55e", glass_door: "#06b6d4", drawer: "#f97216", false_front: "#8b5cf6" };
              const c = colors[ds.type] || "#888";
              return (
                <span key={i} onClick={() => onSectionClick?.(ds.sectionIndex)} style={{
                  fontSize: 11, fontFamily: "'JetBrains Mono',monospace", padding: "6px 10px", borderRadius: 6,
                  background: `${c}1a`, color: c, fontWeight: 600, cursor: "pointer",
                  border: `1px solid ${c}33`,
                }}>
                  {ds.label}
                  {ds.needsVerify && <span style={{ color: "#eab308", marginLeft: 4 }}>!</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Action row */}
      <div style={{ marginBottom: 10 }}>
        <ActionRow cabId={cab.id} spec={spec} dispatch={dispatch} onSelect={onSelect} />
      </div>

      {/* Duplicate of another photo — exclude from cut list but keep in layout */}
      <div style={{ marginBottom: 10 }}>
        <button
          onClick={() => dispatch({ type: "SET_EXCLUDE_FROM_CUTLIST", id: cab.id, value: !cab.exclude_from_cutlist })}
          style={{
            width: "100%", minHeight: 40, borderRadius: 8,
            background: cab.exclude_from_cutlist ? "#eab30822" : "#14141e",
            border: `1px solid ${cab.exclude_from_cutlist ? "#eab308" : "#2a2a3a"}`,
            color: cab.exclude_from_cutlist ? "#eab308" : "#888",
            fontWeight: 600, fontSize: 11, cursor: "pointer",
            fontFamily: "'DM Sans',sans-serif", padding: "0 12px",
          }}
        >{cab.exclude_from_cutlist
          ? "\u2713 Marked as duplicate — excluded from cut list"
          : "Mark as duplicate of another photo (exclude from cut list)"}</button>
      </div>

      {/* More section — height, depth, advanced */}
      <button onClick={() => setShowMore(!showMore)} style={{
        width: "100%", minHeight: 36, borderRadius: 8,
        background: "#14141e", border: "1px solid #1a1a2a",
        color: "#666", fontSize: 11, cursor: "pointer",
        fontFamily: "'DM Sans',sans-serif", fontWeight: 600,
        marginBottom: showMore ? 10 : 0
      }}>
        {showMore ? "Show Less" : "Height · Depth · More"} {showMore ? "\u25B2" : "\u25BC"}
      </button>

      {showMore && (
        <div>
          {/* Height — preset pills + custom input. Bathroom vanities (26-32"),
              short wall cabinets (24, 26, 28, 31"), and any custom height need
              to be enterable directly. */}
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 10, color: "#666", fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em"
            }}>HEIGHT</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {heightPresets.map(h => (
                <button key={h} onClick={() => handleHeightChange(h)} style={{
                  minWidth: 48, minHeight: 44, borderRadius: 8,
                  background: cab.height === h ? rowColor : "#1a1a2a",
                  border: cab.height === h ? `2px solid ${rowColor}` : "1px solid #2a2a3a",
                  color: "#fff", fontWeight: cab.height === h ? 700 : 400,
                  fontSize: 13, fontFamily: "'JetBrains Mono',monospace",
                  cursor: "pointer"
                }}>{h}"</button>
              ))}
              <span style={{ color: "#444", fontSize: 11, fontFamily: "'DM Sans',sans-serif", padding: "0 4px" }}>or</span>
              <input
                key={`${cab.id}-h-custom`}
                type="number"
                defaultValue={cab.height}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === "Enter") { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) handleHeightChange(Math.round(v * 4) / 4); e.target.blur(); } }}
                onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) { const r = Math.round(v * 4) / 4; if (r !== cab.height) handleHeightChange(r); e.target.value = r; } }}
                placeholder="custom"
                style={{
                  width: 70, minHeight: 44, background: "#14141e",
                  border: heightPresets.includes(cab.height) ? "1px solid #2a2a3a" : `2px solid ${rowColor}`,
                  borderRadius: 8, color: "#fff", fontSize: 13, textAlign: "center",
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 600,
                }}
              />
            </div>
          </div>

          {/* Depth — preset pills + custom input. Wall cabinets sometimes 14" or 24" deep;
              bathroom vanities 18-21" deep. */}
          <div style={{ marginBottom: 10 }}>
            <div style={{
              fontSize: 10, color: "#666", fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em"
            }}>DEPTH</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {depthPresets.map(d => (
                <button key={d} onClick={() => handleDepthChange(d)} style={{
                  minWidth: 48, minHeight: 44, borderRadius: 8,
                  background: cab.depth === d ? rowColor : "#1a1a2a",
                  border: cab.depth === d ? `2px solid ${rowColor}` : "1px solid #2a2a3a",
                  color: "#fff", fontWeight: cab.depth === d ? 700 : 400,
                  fontSize: 13, fontFamily: "'JetBrains Mono',monospace",
                  cursor: "pointer"
                }}>{d}"</button>
              ))}
              <span style={{ color: "#444", fontSize: 11, fontFamily: "'DM Sans',sans-serif", padding: "0 4px" }}>or</span>
              <input
                key={`${cab.id}-d-custom`}
                type="number"
                defaultValue={cab.depth}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === "Enter") { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) handleDepthChange(Math.round(v * 4) / 4); e.target.blur(); } }}
                onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) { const r = Math.round(v * 4) / 4; if (r !== cab.depth) handleDepthChange(r); e.target.value = r; } }}
                placeholder="custom"
                style={{
                  width: 70, minHeight: 44, background: "#14141e",
                  border: depthPresets.includes(cab.depth) ? "1px solid #2a2a3a" : `2px solid ${rowColor}`,
                  borderRadius: 8, color: "#fff", fontSize: 13, textAlign: "center",
                  fontFamily: "'JetBrains Mono',monospace", fontWeight: 600,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
