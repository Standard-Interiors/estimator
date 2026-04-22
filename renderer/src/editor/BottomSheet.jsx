import { useState } from "react";
import WidthGrid from "./WidthGrid";
import ActionRow from "./ActionRow";
import {
  BASE_TYPES, WALL_TYPES, TALL_TYPES, WALL_HEIGHTS, TALL_HEIGHTS, BASE_HEIGHT,
  BASE_DEPTH, WALL_DEPTH, SECTION_TYPES, calcDoorSizes, resolveShopProfile
} from "../state/specHelpers";

const SEC_LABELS = {
  drawer: "Drawer",
  door: "Door",
  false_front: "False",
  glass_door: "Glass",
  open: "Open",
};

const SEC_COLORS = {
  drawer: { bg: "#f972161a", fg: "#f97216" },
  false_front: { bg: "#8b5cf61a", fg: "#8b5cf6" },
  door: { bg: "#22c55e1a", fg: "#22c55e" },
  glass_door: { bg: "#3b82f61a", fg: "#3b82f6" },
  open: { bg: "#eab3081a", fg: "#eab308" },
};

function sectionSummary(sec) {
  let s = SEC_LABELS[sec.type] || sec.type;
  if (sec.count && sec.count > 1) s += ` x${sec.count}`;
  if (sec.height) s += ` ${sec.height}"`;
  if (sec.hinge_side) s += ` ${sec.hinge_side}`;
  return s;
}

export default function BottomSheet({
  spec,
  selectedId,
  dispatch,
  onSelect,
  currentAlignmentBaseId,
  isAligningOver,
  onStartAlign,
  onCancelAlign,
  onClearAlign,
  onSectionClick,
}) {
  const [showMore, setShowMore] = useState(false);
  const [editingFaceSectionIdx, setEditingFaceSectionIdx] = useState(null);
  const [showSectionPicker, setShowSectionPicker] = useState(false);

  const cab = selectedId ? spec.cabinets.find(c => c.id === selectedId) : null;
  const sections = cab?.face?.sections || [];
  const editingSection = editingFaceSectionIdx !== null ? sections[editingFaceSectionIdx] : null;

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
  const rowColor = row === "wall" ? "#1a6fbf" : "#D94420";
  const types = row === "base" ? BASE_TYPES : row === "tall" ? TALL_TYPES : WALL_TYPES;
  const heightPresets = row === "base" ? [BASE_HEIGHT] : row === "tall" ? TALL_HEIGHTS : WALL_HEIGHTS;
  const depthPresets = row === "wall" ? [WALL_DEPTH] : [BASE_DEPTH];

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
    const label = t.replace(/^(base|wall|tall)_/, "").replace(/_/g, " ");
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

  const rowPill = (nextRow) => {
    const active = row === nextRow;
    return (
      <button
        key={nextRow}
        onClick={() => {
          if (!active) dispatch({ type: "MOVE_ROW", id: cab.id, targetRow: nextRow });
        }}
        style={{
          minHeight: 34,
          borderRadius: 18,
          padding: "0 12px",
          background: active ? rowColor : "#14141e",
          border: active ? `2px solid ${rowColor}` : "1px solid #2a2a3a",
          color: active ? "#fff" : "#999",
          fontWeight: active ? 700 : 500,
          fontSize: 10,
          fontFamily: "'DM Sans',sans-serif",
          cursor: "pointer",
          textTransform: "capitalize",
        }}
      >
        {nextRow}
      </button>
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

      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 10, color: "#666", fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em"
        }}>ROW</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["base", "wall", "tall"].map(rowPill)}
        </div>
      </div>

      {row === "wall" && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 10, color: "#666", fontWeight: 600,
            fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em"
          }}>ALIGN OVER</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              onClick={isAligningOver ? onCancelAlign : onStartAlign}
              style={{
                minHeight: 34,
                borderRadius: 18,
                padding: "0 12px",
                background: isAligningOver ? rowColor : "#14141e",
                border: isAligningOver ? `2px solid ${rowColor}` : "1px solid #2a2a3a",
                color: isAligningOver ? "#fff" : "#999",
                fontWeight: isAligningOver ? 700 : 500,
                fontSize: 10,
                fontFamily: "'DM Sans',sans-serif",
                cursor: "pointer",
              }}
            >
              {isAligningOver ? "Cancel Align" : "Align Over"}
            </button>
            {currentAlignmentBaseId && (
              <button
                onClick={onClearAlign}
                style={{
                  minHeight: 34,
                  borderRadius: 18,
                  padding: "0 12px",
                  background: `${rowColor}22`,
                  border: `2px solid ${rowColor}`,
                  color: rowColor,
                  fontWeight: 700,
                  fontSize: 10,
                  fontFamily: "'DM Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                Over {currentAlignmentBaseId}
              </button>
            )}
          </div>
          {isAligningOver && (
            <div style={{
              marginTop: 6,
              color: rowColor,
              fontSize: 10,
              fontFamily: "'DM Sans',sans-serif",
            }}>
              Tap a front base cabinet in 3D to align {cab.id} over it.
            </div>
          )}
        </div>
      )}

      {row !== "wall" && (
        <div style={{ marginBottom: 12 }}>
          <div style={{
            fontSize: 10, color: "#666", fontWeight: 600,
            fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em"
          }}>LANE</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["front", "back"].map((lane) => {
              const active = (cab.lane || "front") === lane;
              return (
                <button
                  key={lane}
                  onClick={() => {
                    if (!active) dispatch({ type: "SET_LANE", id: cab.id, lane });
                  }}
                  style={{
                    minHeight: 34,
                    borderRadius: 18,
                    padding: "0 12px",
                    background: active ? rowColor : "#14141e",
                    border: active ? `2px solid ${rowColor}` : "1px solid #2a2a3a",
                    color: active ? "#fff" : "#999",
                    fontWeight: active ? 700 : 500,
                    fontSize: 10,
                    fontFamily: "'DM Sans',sans-serif",
                    cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {lane}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Width grid */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 10, color: "#666", fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em"
        }}>WIDTH</div>
        <WidthGrid currentWidth={cab.width} rowColor={rowColor} onWidthChange={handleWidthChange} />
      </div>

      {/* Scribe toggles — desktop/mobile parity with CabinetEditBar.
          Per Neil's spec: 0.5" per scribed side (reduces door width), 0.75" on top
          (reduces door height). Scribed cabinets require 0.5" overlay hinges. */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize: 10, color: "#666", fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          SCRIBE
          <span style={{ fontWeight: 400, color: "#555", fontSize: 9, letterSpacing: 0 }}>
            trims edge to fit wall
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[["left", "Left"], ["right", "Right"], ["top", "Top"]].map(([key, label]) => {
            const active = cab.scribe?.[key];
            return (
              <button key={key}
                onClick={() => dispatch({ type: "SET_SCRIBE", id: cab.id, updates: { [key]: !active } })}
                style={{
                  flex: 1, minHeight: 40, borderRadius: 8,
                  background: active ? "rgba(234,179,8,0.2)" : "#14141e",
                  border: active ? "1px solid rgba(234,179,8,0.3)" : "1px solid #2a2a3a",
                  color: active ? "#eab308" : "#666",
                  fontWeight: 600, fontSize: 11,
                  fontFamily: "'DM Sans',sans-serif",
                  cursor: "pointer",
                }}>{label}</button>
            );
          })}
        </div>
        {(cab.scribe?.left || cab.scribe?.right || cab.scribe?.top) && (
          <div style={{
            marginTop: 6, padding: "5px 8px", borderRadius: 6,
            background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)",
            color: "#eab308", fontSize: 10, lineHeight: 1.4,
            fontFamily: "'DM Sans',sans-serif",
          }}>
            ⚠ Use 1/2" overlay hinges on this cabinet
          </div>
        )}
      </div>

      {/* Face sections + front sizes — ALWAYS visible (critical for tweaking) */}
      <div style={{ marginBottom: 10 }}>
        <div style={{
          fontSize: 10, color: "#666", fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}>
          <span>FACE SECTIONS</span>
          <span style={{ fontWeight: 400, color: "#555", fontSize: 9, letterSpacing: 0 }}>
            tap a section to edit
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {sections.map((sec, i) => {
            const colors = SEC_COLORS[sec.type] || SEC_COLORS.door;
            const active = editingFaceSectionIdx === i;
            return (
              <button
                key={i}
                onClick={() => setEditingFaceSectionIdx(active ? null : i)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 8px",
                  borderRadius: 6,
                  border: active ? `1px solid ${colors.fg}` : "1px solid transparent",
                  background: active ? `${colors.fg}22` : colors.bg,
                  color: colors.fg,
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono',monospace",
                  cursor: "pointer",
                }}
              >
                <span>{sectionSummary(sec)}</span>
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatch({ type: "REMOVE_SECTION", cabId: cab.id, sectionIndex: i });
                    setEditingFaceSectionIdx(null);
                  }}
                  style={{
                    color: "#666",
                    fontSize: 12,
                    lineHeight: 1,
                    padding: "0 2px",
                  }}
                  title="Remove section"
                >
                  ×
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setShowSectionPicker((open) => !open)}
            style={{
              padding: "5px 8px",
              borderRadius: 6,
              border: "1px dashed #333",
              background: showSectionPicker ? "#1a1a2a" : "transparent",
              color: "#777",
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "'JetBrains Mono',monospace",
              cursor: "pointer",
            }}
          >
            + Section
          </button>
        </div>

        {showSectionPicker && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {SECTION_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => {
                  const section =
                    type === "drawer"
                      ? { type: "drawer", count: 1, height: 6 }
                      : type === "false_front"
                        ? { type: "false_front", height: 6 }
                        : { type, count: 1 };
                  dispatch({ type: "ADD_SECTION", cabId: cab.id, section });
                  setShowSectionPicker(false);
                  setEditingFaceSectionIdx(sections.length);
                }}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "#14141e",
                  border: "1px solid #2a2a3a",
                  color: "#ccc",
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono',monospace",
                  cursor: "pointer",
                }}
              >
                {SEC_LABELS[type] || type}
              </button>
            ))}
          </div>
        )}

        {editingSection && (
          <div style={{
            background: "#14141e",
            border: "1px solid #2a2a3a",
            borderRadius: 8,
            padding: "10px",
            marginBottom: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ color: "#ddd", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
                Edit section {editingFaceSectionIdx + 1}
              </span>
              <button
                onClick={() => {
                  dispatch({ type: "REMOVE_SECTION", cabId: cab.id, sectionIndex: editingFaceSectionIdx });
                  setEditingFaceSectionIdx(null);
                }}
                style={{
                  border: "1px solid rgba(224,64,64,0.35)",
                  background: "rgba(224,64,64,0.12)",
                  color: "#e04040",
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  fontFamily: "'DM Sans',sans-serif",
                  cursor: "pointer",
                }}
              >
                Remove
              </button>
            </div>

            <div>
              <div style={{ fontSize: 10, color: "#666", fontWeight: 600, fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em" }}>
                TYPE
              </div>
              <select
                value={editingSection.type}
                onChange={(e) => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingFaceSectionIdx, updates: { type: e.target.value } })}
                style={{
                  width: "100%",
                  minHeight: 38,
                  background: "#0c0c14",
                  border: "1px solid #2a2a3a",
                  borderRadius: 8,
                  color: "#ddd",
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {SECTION_TYPES.map((type) => (
                  <option key={type} value={type}>{SEC_LABELS[type]}</option>
                ))}
              </select>
            </div>

            {(editingSection.type === "door" || editingSection.type === "glass_door" || editingSection.type === "drawer") && (
              <div>
                <div style={{ fontSize: 10, color: "#666", fontWeight: 600, fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em" }}>
                  COUNT
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1, 2, 3, 4].map((count) => {
                    const active = (editingSection.count || 1) === count;
                    return (
                      <button
                        key={count}
                        onClick={() => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingFaceSectionIdx, updates: { count } })}
                        style={{
                          flex: 1,
                          minHeight: 36,
                          borderRadius: 8,
                          border: "none",
                          background: active ? "rgba(34,197,94,0.2)" : "#0c0c14",
                          color: active ? "#22c55e" : "#666",
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "'JetBrains Mono',monospace",
                          cursor: "pointer",
                        }}
                      >
                        {count}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(editingSection.type === "drawer" || editingSection.type === "false_front") && (
              <div>
                <div style={{ fontSize: 10, color: "#666", fontWeight: 600, fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em" }}>
                  HEIGHT
                </div>
                <input
                  type="number"
                  key={`${cab.id}-section-${editingFaceSectionIdx}-height`}
                  defaultValue={editingSection.height || ""}
                  placeholder="auto"
                  onBlur={(e) => {
                    const value = parseFloat(e.target.value);
                    dispatch({
                      type: "UPDATE_SECTION",
                      cabId: cab.id,
                      sectionIndex: editingFaceSectionIdx,
                      updates: { height: Number.isNaN(value) ? undefined : value },
                    });
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  style={{
                    width: "100%",
                    minHeight: 38,
                    background: "#0c0c14",
                    border: "1px solid #2a2a3a",
                    borderRadius: 8,
                    color: "#fff",
                    fontSize: 13,
                    textAlign: "center",
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                />
              </div>
            )}

            {(editingSection.type === "door" || editingSection.type === "glass_door") && (editingSection.count || 1) === 1 && (
              <div>
                <div style={{ fontSize: 10, color: "#666", fontWeight: 600, fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em" }}>
                  HINGE SIDE
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["left", "right"].map((side) => {
                    const active = (editingSection.hinge_side || "left") === side;
                    return (
                      <button
                        key={side}
                        onClick={() => dispatch({ type: "UPDATE_SECTION", cabId: cab.id, sectionIndex: editingFaceSectionIdx, updates: { hinge_side: side } })}
                        style={{
                          flex: 1,
                          minHeight: 36,
                          borderRadius: 8,
                          border: "1px solid #2a2a3a",
                          background: active ? `${rowColor}22` : "#0c0c14",
                          color: active ? rowColor : "#777",
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "'DM Sans',sans-serif",
                          textTransform: "capitalize",
                          cursor: "pointer",
                        }}
                      >
                        {side}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {sections.length > 0 && (
          <>
            <div style={{
              fontSize: 10, color: "#666", fontWeight: 600,
              fontFamily: "'DM Sans',sans-serif", marginBottom: 6, letterSpacing: "0.05em",
              display: "flex", alignItems: "center", gap: 6,
            }}>FRONT SIZES <span style={{ fontWeight: 400, color: "#D94420", fontSize: 9, letterSpacing: 0 }}>tap to edit →</span></div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {calcDoorSizes(cab, spec.frame_style || "framed", resolveShopProfile(spec)).map((ds, i) => {
                const colors = { door: "#22c55e", glass_door: "#06b6d4", drawer: "#f97216", false_front: "#8b5cf6" };
                // Overflow: computed width/height <= 0 — slam chip red.
                const c = ds.overflows ? "#ef4444" : (colors[ds.type] || "#888");
                return (
                  <span key={i} onClick={() => onSectionClick?.(ds.sectionIndex)}
                    title={ds.overflows ? "Face overflows cabinet — rebuild" : undefined}
                    style={{
                    fontSize: 11, fontFamily: "'JetBrains Mono',monospace", padding: "6px 10px", borderRadius: 6,
                    background: `${c}1a`, color: c, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${c}${ds.overflows ? "" : "33"}`,
                  }}>
                    {ds.label}
                    {ds.overflows && <span style={{ marginLeft: 4 }}>⚠</span>}
                    {ds.needsVerify && !ds.overflows && <span style={{ color: "#eab308", marginLeft: 4 }}>!</span>}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Action row */}
      <div style={{ marginBottom: 10 }}>
        <ActionRow
          cabId={cab.id}
          spec={spec}
          dispatch={dispatch}
          onSelect={onSelect}
          isAlignedWall={cab.row === "wall" && !!currentAlignmentBaseId}
        />
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
                key={`${cab.id}-h-${cab.height}`}
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
                key={`${cab.id}-d-${cab.depth}`}
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
