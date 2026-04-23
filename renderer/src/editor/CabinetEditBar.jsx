import { useState, useRef, useEffect } from "react";
import { SECTION_TYPES, BASE_TYPES, WALL_TYPES, TALL_TYPES, STANDARD_WIDTHS, generateId, defaultCabinet, calcDoorSizes, formatFraction, calcScribeNotes, resolveShopProfile, layoutKeyForCabinetRow } from "../state/specHelpers";

const MONO = "'JetBrains Mono',monospace";
const SANS = "'DM Sans',sans-serif";

const TYPE_MAP = { base: BASE_TYPES, wall: WALL_TYPES, tall: TALL_TYPES };
const ROWS = ["base", "wall", "tall"];
const LANES = ["front", "back"];

const SEC_LABELS = {
  drawer: "Drawer",
  door: "Door",
  false_front: "False Front",
  glass_door: "Glass Door",
  open: "Open",
};

const SEC_COLORS = {
  drawer: { bg: "#f972161a", fg: "#f97216" },
  door: { bg: "#22c55e1a", fg: "#22c55e" },
  false_front: { bg: "#8b5cf61a", fg: "#8b5cf6" },
  glass_door: { bg: "#3b82f61a", fg: "#3b82f6" },
  open: { bg: "#6b72801a", fg: "#6b7280" },
};

function sectionSummary(sec) {
  let s = SEC_LABELS[sec.type] || sec.type;
  if (sec.count > 1) s += ` x${sec.count}`;
  if (sec.height) s += ` ${sec.height}"`;
  if (sec.hinge_side) s += ` (${sec.hinge_side[0].toUpperCase()})`;
  return s;
}

export default function CabinetEditBar({ cab, spec, dispatch, selColor, widthInputRef, currentAlignmentBaseId, isAligningOver, onStartAlign, onCancelAlign, onClearAlign, onSelectNext, onSelectId, onDelete, onAddGap, onAddCab, onSlotLeft, onSlotRight, onSpaceLeft, onSpaceRight, onMoveUp, onMoveDown, onMoveFront, onMoveBack, onSectionClick }) {
  const [editingSec, setEditingSec] = useState(null); // index of section being edited
  const [showSecPicker, setShowSecPicker] = useState(false);
  const sections = cab?.face?.sections || [];

  // Reset editing section when cabinet changes
  useEffect(() => { setEditingSec(null); }, [cab?.id]);

  if (!cab) return null;

  const types = TYPE_MAP[cab.row] || BASE_TYPES;

  // Merge neighbors — compute from layout so we can show "Merge ← B2" / "Merge B4 →"
  const layoutKey = layoutKeyForCabinetRow(cab.row);
  const layout = layoutKey ? (spec[layoutKey] || []) : [];
  const myRefIdx = layout.findIndex(item => item.ref === cab.id);
  const leftNeighborRef = myRefIdx > 0 ? layout[myRefIdx - 1] : null;
  const rightNeighborRef = myRefIdx >= 0 && myRefIdx < layout.length - 1 ? layout[myRefIdx + 1] : null;
  const leftNeighbor = leftNeighborRef?.ref
    ? spec.cabinets.find(c => c.id === leftNeighborRef.ref)
    : null;
  const rightNeighbor = rightNeighborRef?.ref
    ? spec.cabinets.find(c => c.id === rightNeighborRef.ref)
    : null;

  const onMergeLeft = leftNeighbor ? () => {
    // Preserve spatial order: left neighbor becomes source, absorbs this cabinet
    dispatch({ type: "MERGE_CABINETS", sourceId: leftNeighbor.id, targetId: cab.id });
    if (onSelectId) onSelectId(leftNeighbor.id);
  } : null;
  const onMergeRight = rightNeighbor ? () => {
    dispatch({ type: "MERGE_CABINETS", sourceId: cab.id, targetId: rightNeighbor.id });
  } : null;

  const btnStyle = (active) => ({
    height: 28, padding: "0 8px", borderRadius: 4,
    background: active ? "#1a1a2a" : "transparent",
    border: active ? `1px solid ${selColor}` : "1px solid #2a2a3a",
    color: active ? selColor : "#555",
    fontWeight: 600, fontSize: 10, cursor: "pointer", fontFamily: MONO,
  });

  const inputStyle = (w, border) => ({
    width: w, height: 32, background: "#14141e",
    border: `1px solid ${border || "#2a2a3a"}`, borderRadius: 6,
    color: "#fff", fontSize: 14, textAlign: "center", fontFamily: MONO, fontWeight: 700,
  });

  const topRowStyle = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: "6px 10px",
    borderBottom: "1px solid #111118",
    flexWrap: "wrap",
  };

  const wrapGroupStyle = { display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" };
  const headerGroupStyle = { display: "flex", alignItems: "center", gap: 8, flex: "1 1 580px", minWidth: 0, flexWrap: "wrap" };
  const dimensionGroupStyle = { display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: "auto" };
  const dividerStyle = { width: 1, height: 20, background: "#1a1a2a", flexShrink: 0 };
  const actionRowStyle = { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderBottom: "1px solid #111118", flexWrap: "wrap" };
  const actionGroupStyle = { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" };

  const commitDim = (field, val, inputEl) => {
    let v = parseFloat(val);
    if (isNaN(v) || v <= 0) {
      // Rejected — reset input to current valid value so it doesn't show "0" or garbage
      if (inputEl) inputEl.value = cab[field];
      return;
    }
    // Round to shop precision (0.25" = typical cut tolerance). Do NOT snap to
    // standard widths — cabinet makers measure real dimensions, and the AI's
    // correct non-standard widths must survive. Standard widths are offered
    // below the input as quick-pick chips for when they DO apply.
    v = Math.round(v * 4) / 4;
    if (inputEl) inputEl.value = v;
    if (v !== cab[field]) {
      dispatch({ type: "SET_DIMENSION", id: cab.id, field, value: v });
    }
  };

  const editSec = editingSec !== null ? sections[editingSec] : null;

  return (
    <div style={{ flexShrink: 0, background: "#0c0c14", borderTop: "1px solid #1a1a2a" }}>
      {/* Row 1: Identity + Placement + Dimensions */}
      <div style={topRowStyle}>
        <div style={headerGroupStyle}>
        <span style={{ color: selColor, fontWeight: 700, fontSize: 16, fontFamily: MONO }}>{cab.id}</span>
        <input
          key={cab.id + "-label"}
          type="text"
          defaultValue={cab.label || ""}
          placeholder="add label..."
          // Tooltip surfaces the full label even when width truncates — estimators
          // rely on the AI's context labels (e.g. "Double door left of microwave")
          // to match cabinets back to the field photo. 100px was too small.
          title={cab.label || ""}
          onBlur={e => { const v = e.target.value.trim(); if (v !== (cab.label || "")) dispatch({ type: "SET_LABEL", id: cab.id, label: v }); }}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { e.target.value = cab.label || ""; e.target.blur(); } }}
          style={{ flex: "1 1 220px", minWidth: 160, maxWidth: 360, height: 24, background: "transparent", border: "1px solid transparent", borderRadius: 4, color: "#888", fontSize: 11, fontFamily: MONO, padding: "0 4px", cursor: "text" }}
          onFocus={e => { e.target.style.borderColor = "#2a2a3a"; e.target.style.background = "#14141e"; }}
          onMouseEnter={e => { if (document.activeElement !== e.target) e.target.style.borderColor = "#1a1a2a"; }}
          onMouseLeave={e => { if (document.activeElement !== e.target) e.target.style.borderColor = "transparent"; }}
        />

        {/* Type pills */}
        <div style={wrapGroupStyle}>
          {types.map(t => (
            <button key={t} style={btnStyle(cab.type === t)}
              onClick={() => dispatch({ type: "CHANGE_TYPE", id: cab.id, newType: t })}>
              {t.replace(/^(base|wall|tall)_?/, "").replace(/_/g, " ") || t.split("_")[0]}
            </button>
          ))}
        </div>

        <div style={wrapGroupStyle}>
          {ROWS.map((row) => {
            const active = cab.row === row;
            return (
              <button
                key={row}
                style={btnStyle(active)}
                onClick={() => {
                  if (!active) dispatch({ type: "MOVE_ROW", id: cab.id, targetRow: row });
                }}
                title={`Move ${cab.id} to ${row} row`}
              >
                {row}
              </button>
            );
          })}
        </div>

        {cab.row !== "wall" && (
          <div style={wrapGroupStyle}>
            {LANES.map((lane) => {
              const active = (cab.lane || "front") === lane;
              return (
                <button
                  key={lane}
                  style={btnStyle(active)}
                  onClick={() => {
                    if (!active) dispatch({ type: "SET_LANE", id: cab.id, lane });
                  }}
                  title={`Snap ${cab.id} to the ${lane} lane`}
                >
                  {cab.row === "tall" ? `${lane} lane` : lane}
                </button>
              );
            })}
          </div>
        )}

        {cab.row === "wall" && (
          <div style={wrapGroupStyle}>
            <button
              style={btnStyle(!!isAligningOver)}
              onClick={isAligningOver ? onCancelAlign : onStartAlign}
              title={isAligningOver ? `Cancel aligning ${cab.id}` : `Pick the base cabinet this upper should sit over`}
            >
              {isAligningOver ? "Cancel Align" : "Align Over"}
            </button>
            {currentAlignmentBaseId && (
              <button
                style={btnStyle(true)}
                onClick={onClearAlign}
                title={`Currently aligned over ${currentAlignmentBaseId}. Click to clear.`}
              >
                Over {currentAlignmentBaseId}
              </button>
            )}
          </div>
        )}

        </div>

        <div style={dimensionGroupStyle}>
        <span style={dividerStyle} />

        {/* Dimensions — key includes current value so external changes (merge,
            chip click, undo) re-initialize the input. Within-typing state isn't
            affected because cab.width only updates on blur/Enter commit. */}
        <input ref={widthInputRef} key={`${cab.id}w${cab.width}`} type="number" defaultValue={cab.width}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === "Enter") { commitDim("width", e.target.value, e.target); e.target.blur(); } }}
          onBlur={e => commitDim("width", e.target.value, e.target)}
          style={{ ...inputStyle(56, selColor), border: `2px solid ${selColor}` }}
        />
        <span style={{ color: "#555", fontSize: 12, fontFamily: MONO }}>w</span>
        <input key={`${cab.id}h${cab.height}`} type="number" defaultValue={cab.height}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === "Enter") { commitDim("height", e.target.value); e.target.blur(); } }}
          onBlur={e => commitDim("height", e.target.value)}
          style={{ ...inputStyle(48, selColor), border: `2px solid ${selColor}` }}
        />
        <span style={{ color: "#555", fontSize: 12, fontFamily: MONO }}>h</span>
        <input key={`${cab.id}d${cab.depth}`} type="number" defaultValue={cab.depth}
          onFocus={e => e.target.select()}
          onKeyDown={e => { if (e.key === "Enter") { commitDim("depth", e.target.value); e.target.blur(); } }}
          onBlur={e => commitDim("depth", e.target.value)}
          style={{ ...inputStyle(48, selColor), border: `2px solid ${selColor}` }}
        />
        <span style={{ color: "#555", fontSize: 12, fontFamily: MONO }}>d</span>
        </div>
      </div>

      {/* Row 2: Placement + Edit Actions */}
      <div style={actionRowStyle}>
        <div style={actionGroupStyle}>
          {onSlotLeft && <button onClick={onSlotLeft} title="Move cabinet one slot left (Ctrl/Cmd + Arrow Left)" style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2190"} Slot</button>}
          {onSlotRight && <button onClick={onSlotRight} title="Move cabinet one slot right (Ctrl/Cmd + Arrow Right)" style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>Slot {"\u2192"}</button>}
          {onMoveFront && <button onClick={onMoveFront} title="Move cabinet 6 inches toward the front" style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2199"} Front</button>}
          {onMoveBack && <button onClick={onMoveBack} title="Move cabinet 6 inches toward the back" style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>Back {"\u2197"}</button>}
          {onMoveUp && <button onClick={onMoveUp} title="Move cabinet up 3 inches (Arrow Up)" style={{ height: 32, width: 32, padding: 0, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2191"}</button>}
          {onMoveDown && <button onClick={onMoveDown} title="Move cabinet down 3 inches (Arrow Down)" style={{ height: 32, width: 32, padding: 0, borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2193"}</button>}
          {onSpaceLeft && <button onClick={onSpaceLeft} title="Resize space on the left (Arrow Left)" style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>Space {"\u2190"}</button>}
          {onSpaceRight && <button onClick={onSpaceRight} title="Resize space on the right (Arrow Right)" style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u2192"} Space</button>}
        </div>

        {(onMergeLeft || onMergeRight || onAddGap || onAddCab) && <span style={dividerStyle} />}

        <div style={actionGroupStyle}>
          {onMergeLeft && <button onClick={onMergeLeft}
            title={`Merge with ${leftNeighbor.id} (left neighbor) — widths add, face sections combine`}
            style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>
            &#8592; Merge {leftNeighbor.id}
          </button>}
          {onMergeRight && <button onClick={onMergeRight}
            title={`Merge with ${rightNeighbor.id} (right neighbor) — widths add, face sections combine`}
            style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>
            Merge {rightNeighbor.id} &#8594;
          </button>}
          {onAddGap && <button onClick={onAddGap} style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>Filler</button>}
          <button onClick={onAddCab} style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: selColor, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>+ Cab</button>
        </div>

        <span style={dividerStyle} />

        <div style={actionGroupStyle}>
          <button
            onClick={() => dispatch({ type: "SET_EXCLUDE_FROM_CUTLIST", id: cab.id, value: !cab.exclude_from_cutlist })}
            title={cab.exclude_from_cutlist
              ? "Currently EXCLUDED from cut list (duplicate of another photo). Click to include again."
              : "Mark as duplicate — keep in layout view but skip in project cut list"}
            style={{
              height: 32, padding: "0 8px", borderRadius: 6,
              background: cab.exclude_from_cutlist ? "#eab30822" : "#1a1a2a",
              border: `1px solid ${cab.exclude_from_cutlist ? "#eab308" : "#2a2a3a"}`,
              color: cab.exclude_from_cutlist ? "#eab308" : "#888",
              fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS
            }}
          >{cab.exclude_from_cutlist ? "Dup \u2713" : "Dup?"}</button>
          <button onClick={onDelete} style={{ height: 32, padding: "0 8px", borderRadius: 6, background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#e04040", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: SANS }}>Del</button>
        </div>
      </div>

      {cab.row === "wall" && isAligningOver && (
        <div style={{ padding: "5px 10px", borderBottom: "1px solid #111118", color: "#1a6fbf", fontSize: 10, fontFamily: MONO }}>
          Tap a front base cabinet in 3D to align {cab.id} over it.
        </div>
      )}

      {/* Width quick-pick chips — 1-click for standard sizes. Free input stays above. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderBottom: "1px solid #111118" }}>
        <span style={{ color: "#444", fontSize: 9, fontWeight: 700, fontFamily: MONO, letterSpacing: "0.06em", marginRight: 4 }}>STD W</span>
        {STANDARD_WIDTHS.map(sw => {
          const active = Math.abs(cab.width - sw) < 0.01;
          return (
            <button key={sw}
              onClick={() => {
                if (cab.width !== sw) dispatch({ type: "SET_DIMENSION", id: cab.id, field: "width", value: sw });
                if (widthInputRef?.current) widthInputRef.current.value = sw;
              }}
              title={`Set width to ${sw}"`}
              style={{
                height: 20, minWidth: 24, padding: "0 5px", borderRadius: 3,
                background: active ? selColor : "transparent",
                border: active ? `1px solid ${selColor}` : "1px solid #222230",
                color: active ? "#fff" : "#555",
                fontWeight: active ? 700 : 500, fontSize: 10, cursor: "pointer",
                fontFamily: MONO,
              }}
              onMouseEnter={e => { if (!active) { e.target.style.color = "#bbb"; e.target.style.borderColor = "#3a3a4a"; } }}
              onMouseLeave={e => { if (!active) { e.target.style.color = "#555"; e.target.style.borderColor = "#222230"; } }}
            >{sw}</button>
          );
        })}
        <span style={{ color: "#333", fontSize: 9, fontFamily: MONO, marginLeft: 8 }}>or type any width above</span>
      </div>

      {/* Row 2: Face Sections */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", flexWrap: "wrap" }}>
        <span style={{ color: "#444", fontSize: 10, fontWeight: 700, fontFamily: MONO, letterSpacing: "0.06em" }}>FACE</span>

        {sections.map((sec, i) => {
          const c = SEC_COLORS[sec.type] || SEC_COLORS.open;
          const isEditing = editingSec === i;
          return (
            <button key={i}
              onClick={() => setEditingSec(isEditing ? null : i)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 8px", borderRadius: 4,
                background: isEditing ? c.fg + "33" : c.bg,
                border: isEditing ? `1px solid ${c.fg}` : "1px solid transparent",
                color: c.fg, fontSize: 11, fontFamily: MONO, fontWeight: 600,
                cursor: "pointer", whiteSpace: "nowrap",
              }}>
              {sectionSummary(sec)}
              <span onClick={(e) => { e.stopPropagation(); dispatch({ type: "REMOVE_SECTION", cabId: cab.id, sectionIndex: i }); if (editingSec === i) setEditingSec(null); }}
                style={{ marginLeft: 4, color: "#666", fontSize: 12, cursor: "pointer", lineHeight: 1, padding: "0 2px", borderRadius: 2 }}
                onMouseEnter={e => { e.target.style.color = "#e04040"; e.target.style.background = "rgba(224,64,64,0.15)"; }}
                onMouseLeave={e => { e.target.style.color = "#666"; e.target.style.background = "transparent"; }}
                title="Remove this section">×</span>
            </button>
          );
        })}

        <span style={{ position: "relative", display: "inline-block" }}>
          <button onClick={() => setShowSecPicker(!showSecPicker)} style={{
            padding: "3px 8px", borderRadius: 4, background: showSecPicker ? "#1a1a2a" : "transparent",
            border: "1px dashed #333", color: "#555", fontSize: 11, fontFamily: MONO,
            cursor: "pointer", fontWeight: 600,
          }}>+ Section</button>
          {showSecPicker && (
            <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 4, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 6, padding: 4, display: "flex", gap: 3, zIndex: 10 }}>
              {["door", "drawer", "false_front", "glass_door", "open"].map(t => (
                <button key={t} onClick={() => {
                  const sec = t === "drawer" ? { type: "drawer", count: 1, height: 6 } : t === "false_front" ? { type: "false_front", height: 6 } : { type: t, count: 1 };
                  dispatch({ type: "ADD_SECTION", cabId: cab.id, section: sec });
                  setShowSecPicker(false);
                  setEditingSec(sections.length);
                }} style={{
                  padding: "4px 8px", borderRadius: 4, background: "#1a1a2a", border: "1px solid #2a2a3a",
                  color: "#ccc", fontSize: 10, fontFamily: MONO, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap",
                }}>{SEC_LABELS[t] || t}</button>
              ))}
            </div>
          )}
        </span>

        {/* Inline section editor */}
        {editSec && (
          <>
            <span style={{ width: 1, height: 20, background: "#1a1a2a", flexShrink: 0, margin: "0 4px" }} />

            {/* Type */}
            <select
              value={editSec.type}
              onChange={e => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingSec, updates: { type: e.target.value } })}
              style={{
                height: 28, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 4,
                color: "#ddd", fontSize: 11, fontFamily: MONO, padding: "0 4px", cursor: "pointer",
              }}>
              {SECTION_TYPES.map(t => <option key={t} value={t}>{SEC_LABELS[t]}</option>)}
            </select>

            {/* Count — pill buttons instead of dropdown */}
            {(editSec.type === "door" || editSec.type === "glass_door" || editSec.type === "drawer") && (
              <>
                <span style={{ color: "#444", fontSize: 10, fontFamily: MONO }}>qty</span>
                <div style={{ display: "flex", gap: 2 }}>
                  {[1, 2, 3, 4].map(n => (
                    <button key={n} onClick={() => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingSec, updates: { count: n } })}
                      style={{
                        width: 26, height: 26, borderRadius: 4, fontSize: 11, fontWeight: 600,
                        cursor: "pointer", border: "none", fontFamily: MONO,
                        background: (editSec.count || 1) === n ? "rgba(34,197,94,0.2)" : "#14141e",
                        color: (editSec.count || 1) === n ? "#22c55e" : "#555",
                      }}>{n}</button>
                  ))}
                </div>
              </>
            )}

            {/* Height (for drawers and false fronts) */}
            {(editSec.type === "drawer" || editSec.type === "false_front") && (
              <>
                <span style={{ color: "#444", fontSize: 10, fontFamily: MONO }}>ht</span>
                <input
                  type="number"
                  defaultValue={editSec.height || ""}
                  placeholder="auto"
                  key={`${cab.id}-sec-${editingSec}-h`}
                  onBlur={e => {
                    const v = parseFloat(e.target.value);
                    dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingSec, updates: { height: isNaN(v) ? undefined : v } });
                  }}
                  onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                  style={{
                    height: 28, width: 44, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 4,
                    color: "#ddd", fontSize: 11, fontFamily: MONO, textAlign: "center",
                  }}
                />
              </>
            )}

            {/* Hinge side (for single doors) */}
            {(editSec.type === "door" || editSec.type === "glass_door") && (editSec.count || 1) === 1 && (
              <>
                <span style={{ color: "#444", fontSize: 10, fontFamily: MONO }}>hinge</span>
                <select
                  value={editSec.hinge_side || "left"}
                  onChange={e => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingSec, updates: { hinge_side: e.target.value } })}
                  style={{
                    height: 28, background: "#14141e", border: "1px solid #2a2a3a", borderRadius: 4,
                    color: "#ddd", fontSize: 11, fontFamily: MONO, padding: "0 4px", cursor: "pointer",
                  }}>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </>
            )}
          </>
        )}
      </div>

      {/* Row 3: Scribe + Door Sizes */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", flexWrap: "wrap" }}>
        <span style={{ color: "#444", fontSize: 10, fontWeight: 700, fontFamily: MONO, letterSpacing: "0.06em" }}>SCRIBE</span>
        {["left", "right", "top"].map(side => {
          const active = cab.scribe?.[side];
          const label = side === "left" ? "Left" : side === "right" ? "Right" : "Top";
          return (
            <button key={side} onClick={() => dispatch({ type: "SET_SCRIBE", id: cab.id, updates: { [side]: !active } })}
              title={`${label} scribe — trim edge to fit against wall`}
              style={{
                padding: "2px 8px", borderRadius: 6, fontSize: 9, fontWeight: 600, cursor: "pointer",
                border: active ? "1px solid rgba(234,179,8,0.3)" : "1px solid transparent", fontFamily: MONO,
                background: active ? "rgba(234,179,8,0.2)" : "transparent",
                color: active ? "#eab308" : "#555",
              }}>
              {label}
            </button>
          );
        })}
        {(cab.scribe?.left || cab.scribe?.right || cab.scribe?.top) && (
          <span
            title='Scribed cabinets require 1/2" overlay hinges so the door still covers the opening after the scribe is trimmed.'
            style={{
              fontSize: 9, fontWeight: 700, fontFamily: MONO, padding: "2px 6px",
              borderRadius: 4, background: "rgba(234,179,8,0.1)",
              border: "1px solid rgba(234,179,8,0.3)", color: "#eab308",
              cursor: "help", whiteSpace: "nowrap",
            }}>
            ⚠ 1/2" overlay
          </span>
        )}
        <span style={{ color: "#222", margin: "0 4px" }}>|</span>
        <span style={{ color: "#444", fontSize: 10, fontWeight: 700, fontFamily: MONO, letterSpacing: "0.06em" }}>SIZES</span>
        <span style={{ color: "#333", fontSize: 8 }}>click to edit →</span>
        {calcDoorSizes(cab, spec.frame_style || "framed", resolveShopProfile(spec)).map((ds, i) => {
          const colors = { door: "#22c55e", glass_door: "#06b6d4", drawer: "#f97216", false_front: "#8b5cf6" };
          // Overflow (negative/zero computed dim) slams the chip into red so the
          // cabinet maker never ships a "−6-1/2 in" door to CNC.
          const c = ds.overflows ? "#ef4444" : (colors[ds.type] || "#888");
          return (
            <span key={i} onClick={() => onSectionClick?.(ds.sectionIndex)}
              title={ds.overflows ? "Face sections overflow this cabinet — rebuild face (total drawer/FF heights exceed cabinet height)" : undefined}
              style={{
              fontSize: 10, fontFamily: MONO, padding: "3px 8px", borderRadius: 4,
              background: `${c}1a`, color: c, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${c}${ds.overflows ? "" : "33"}`,
            }}
            onMouseEnter={e => e.target.style.borderColor = c}
            onMouseLeave={e => e.target.style.borderColor = c + (ds.overflows ? "" : "33")}>
              {ds.label}
              {ds.overflows && <span style={{ marginLeft: 4 }}>⚠</span>}
              {ds.needsVerify && !ds.overflows && <span style={{ color: "#eab308", marginLeft: 4 }}>!</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
