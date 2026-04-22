import { useState } from "react";
import { generateId, defaultCabinet, layoutKeyForCabinetRow } from "../state/specHelpers";

export default function ActionRow({ cabId, spec, dispatch, onSelect, isAlignedWall = false }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitLeft, setSplitLeft] = useState("");
  const [splitRight, setSplitRight] = useState("");
  const [splitError, setSplitError] = useState("");

  const cab = spec.cabinets.find(c => c.id === cabId);
  if (!cab) return null;

  const row = cab.row;
  const layoutKey = layoutKeyForCabinetRow(row);
  const layout = spec[layoutKey] || [];
  const refIdx = layout.findIndex(item => item.ref === cabId);
  const placementSeed = row === "wall"
    ? { yOffset: cab.yOffset }
    : { lane: cab.lane, yOffset: row === "tall" ? cab.yOffset : undefined };

  const handleAddBefore = () => {
    const newId = generateId(row, spec);
    const newCab = defaultCabinet(row, undefined, placementSeed);
    newCab.id = newId;
    dispatch({ type: "ADD_CABINET", row, position: Math.max(refIdx, 0), cabinet: newCab });
    if (onSelect) onSelect(newId);
  };

  const handleAddAfter = () => {
    const newId = generateId(row, spec);
    const newCab = defaultCabinet(row, undefined, placementSeed);
    newCab.id = newId;
    dispatch({ type: "ADD_CABINET", row, position: refIdx + 1, cabinet: newCab });
    if (onSelect) onSelect(newId);
  };

  const handleAddSpaceBefore = () => {
    dispatch({
      type: "ADD_GAP",
      row,
      position: Math.max(refIdx, 0),
      gap: { type: "filler", label: "Filler", width: 3 },
    });
  };

  const handleAddSpaceAfter = () => {
    dispatch({
      type: "ADD_GAP",
      row,
      position: refIdx + 1,
      gap: { type: "filler", label: "Filler", width: 3 },
    });
  };

  const handleSplitStart = () => {
    const half = Math.floor(cab.width / 2);
    setSplitLeft(String(half));
    setSplitRight(String(cab.width - half));
    setSplitError("");
    setSplitting(true);
  };

  const leftWidth = parseFloat(splitLeft);
  const rightWidth = parseFloat(splitRight);
  const splitTotal = (Number.isFinite(leftWidth) ? leftWidth : 0) + (Number.isFinite(rightWidth) ? rightWidth : 0);
  const splitValid =
    Number.isFinite(leftWidth) &&
    Number.isFinite(rightWidth) &&
    leftWidth > 0 &&
    rightWidth > 0 &&
    Math.abs(splitTotal - cab.width) < 0.01;

  const handleSplitConfirm = () => {
    if (!splitValid) {
      setSplitError(`Split widths must total ${cab.width}"`);
      return;
    }
    const lw = leftWidth;
    const rw = rightWidth;
    const leftId = generateId(row, spec);
    // Generate right ID from a spec that already includes the left ID
    const tempSpec = { ...spec, cabinets: [...spec.cabinets, { id: leftId, row }] };
    const rightId = generateId(row, tempSpec);
    dispatch({
      type: "SPLIT_CABINET", id: cabId,
      leftId, rightId, leftWidth: lw, rightWidth: rw
    });
    setSplitting(false);
    setSplitError("");
    if (onSelect) onSelect(leftId);
  };

  const handleDelete = () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    dispatch({ type: "DELETE_CABINET", id: cabId });
    setConfirmDelete(false);
    if (onSelect) onSelect(null);
  };

  const rowColor = row === "wall" ? "#1a6fbf" : "#D94420";
  const canSplit = cab.width >= 12;
  const canMoveLeft = !isAlignedWall && refIdx > 0;
  const canMoveRight = !isAlignedWall && refIdx < layout.length - 1;
  const canMoveVertical = row === "wall" || row === "tall";

  // Merge — only available when there's an adjacent neighbor in the same row
  const leftNeighborRef = refIdx > 0 ? layout[refIdx - 1] : null;
  const rightNeighborRef = refIdx >= 0 && refIdx < layout.length - 1 ? layout[refIdx + 1] : null;
  const leftNeighbor = leftNeighborRef?.ref
    ? spec.cabinets.find(c => c.id === leftNeighborRef.ref)
    : null;
  const rightNeighbor = rightNeighborRef?.ref
    ? spec.cabinets.find(c => c.id === rightNeighborRef.ref)
    : null;
  const canMergeLeft = !!leftNeighbor;
  const canMergeRight = !!rightNeighbor;

  const handleMoveLeft = () => {
    if (canMoveLeft) dispatch({ type: "MOVE_CABINET", id: cabId, direction: "left" });
  };
  const handleMoveRight = () => {
    if (canMoveRight) dispatch({ type: "MOVE_CABINET", id: cabId, direction: "right" });
  };
  const handleMoveUp = () => {
    if (canMoveVertical) dispatch({ type: "NUDGE_VERTICAL", id: cabId, amount: -3 });
  };
  const handleMoveDown = () => {
    if (canMoveVertical) dispatch({ type: "NUDGE_VERTICAL", id: cabId, amount: 3 });
  };

  const handleMergeLeft = () => {
    // Merge left neighbor INTO this cabinet so this id is preserved, and the
    // result appears where the left neighbor used to be.
    if (!canMergeLeft) return;
    // Shape: target (left) is absorbed into source (this); layout slot of left
    // neighbor is removed. To keep visual order, we actually make the LEFT
    // neighbor be the "source" so the merged cabinet stays in the left position.
    dispatch({ type: "MERGE_CABINETS", sourceId: leftNeighbor.id, targetId: cabId });
    // After merge, the merged cabinet keeps leftNeighbor.id — select it
    if (onSelect) onSelect(leftNeighbor.id);
  };
  const handleMergeRight = () => {
    if (!canMergeRight) return;
    // Merge this cabinet's right neighbor INTO this one — this id is preserved
    dispatch({ type: "MERGE_CABINETS", sourceId: cabId, targetId: rightNeighbor.id });
  };

  const pillBtn = (label, onClick, bg, color, extra) => (
    <button onClick={onClick} style={{
      flex: 1, minHeight: 40, borderRadius: 8,
      background: bg, border: "1px solid #2a2a3a",
      color, fontWeight: 600, fontSize: 12,
      fontFamily: "'DM Sans',sans-serif",
      cursor: onClick ? "pointer" : "default", ...extra
    }}>{label}</button>
  );

  if (splitting) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontSize: 11, color: "#888", fontFamily: "'DM Sans',sans-serif" }}>
          Split {cabId} ({cab.width}") into two cabinets:
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="number" value={splitLeft} onChange={e => {
            setSplitError("");
            setSplitLeft(e.target.value);
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) setSplitRight(String(Math.max(0, cab.width - v)));
          }} style={{
            flex: 1, minHeight: 44, background: "#14141e", border: `2px solid ${rowColor}`,
            borderRadius: 8, color: "#fff", fontSize: 16, textAlign: "center",
            fontFamily: "'JetBrains Mono',monospace"
          }} />
          <span style={{ color: "#555", fontSize: 16 }}>+</span>
          <input type="number" value={splitRight} onChange={e => {
            setSplitError("");
            setSplitRight(e.target.value);
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) setSplitLeft(String(Math.max(0, cab.width - v)));
          }} style={{
            flex: 1, minHeight: 44, background: "#14141e", border: `2px solid ${rowColor}`,
            borderRadius: 8, color: "#fff", fontSize: 16, textAlign: "center",
            fontFamily: "'JetBrains Mono',monospace"
          }} />
          <span style={{ color: "#666", fontSize: 11, fontFamily: "'JetBrains Mono',monospace" }}>
            = {splitTotal}"
          </span>
        </div>
        {(splitError || !splitValid) && (
          <div style={{ fontSize: 11, color: splitError ? "#e04040" : "#888", fontFamily: "'DM Sans',sans-serif" }}>
            {splitError || `Split widths must total ${cab.width}"`}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          {pillBtn("Split", splitValid ? handleSplitConfirm : undefined, splitValid ? rowColor : "#1a1a2a", splitValid ? "#fff" : "#555", splitValid ? {} : { opacity: 0.5 })}
          {pillBtn("Cancel", () => setSplitting(false), "#1a1a2a", "#888")}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {pillBtn("\u25C0 Slot", canMoveLeft ? handleMoveLeft : undefined, "#1a1a2a",
          canMoveLeft ? "#ccc" : "#444", canMoveLeft ? {} : { opacity: 0.4 })}
        {pillBtn("Slot \u25B6", canMoveRight ? handleMoveRight : undefined, "#1a1a2a",
          canMoveRight ? "#ccc" : "#444", canMoveRight ? {} : { opacity: 0.4 })}
        {pillBtn("Split", canSplit ? handleSplitStart : undefined, "#1a1a2a",
          canSplit ? "#ccc" : "#444", canSplit ? {} : { opacity: 0.4 })}
      </div>
      {canMoveVertical && (
        <div style={{ display: "flex", gap: 6 }}>
          {pillBtn("\u25B2 Up", handleMoveUp, "#1a1a2a", rowColor)}
          {pillBtn("Down \u25BC", handleMoveDown, "#1a1a2a", rowColor)}
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        {pillBtn(canMergeLeft ? `\u2190 Merge ${leftNeighbor.id}` : "\u2190 Merge",
          canMergeLeft ? handleMergeLeft : undefined, "#1a1a2a",
          canMergeLeft ? rowColor : "#444",
          canMergeLeft ? {} : { opacity: 0.4 })}
        {pillBtn(canMergeRight ? `Merge ${rightNeighbor.id} \u2192` : "Merge \u2192",
          canMergeRight ? handleMergeRight : undefined, "#1a1a2a",
          canMergeRight ? rowColor : "#444",
          canMergeRight ? {} : { opacity: 0.4 })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {pillBtn("+ Space \u2190", isAlignedWall ? undefined : handleAddSpaceBefore, "#1a1a2a",
          isAlignedWall ? "#444" : rowColor, isAlignedWall ? { opacity: 0.4 } : undefined)}
        {pillBtn("Space \u2192 +", isAlignedWall ? undefined : handleAddSpaceAfter, "#1a1a2a",
          isAlignedWall ? "#444" : rowColor, isAlignedWall ? { opacity: 0.4 } : undefined)}
      </div>
      {isAlignedWall && (
        <div style={{
          fontSize: 11,
          color: "#1a6fbf",
          fontFamily: "'DM Sans',sans-serif",
          lineHeight: 1.4,
        }}>
          Clear Align Over to edit this wall cabinet's slot, spacing, or insert position.
        </div>
      )}
      <div style={{ display: "flex", gap: 6 }}>
        {pillBtn("+ Before", isAlignedWall ? undefined : handleAddBefore, "#1a1a2a",
          isAlignedWall ? "#444" : rowColor, isAlignedWall ? { opacity: 0.4 } : undefined)}
        {pillBtn("+ After", isAlignedWall ? undefined : handleAddAfter, "#1a1a2a",
          isAlignedWall ? "#444" : rowColor, isAlignedWall ? { opacity: 0.4 } : undefined)}
        {pillBtn(confirmDelete ? "Confirm?" : "Delete", handleDelete,
          confirmDelete ? "#e04040" : "#1a1a2a",
          confirmDelete ? "#fff" : "#e04040")}
      </div>
    </div>
  );
}
