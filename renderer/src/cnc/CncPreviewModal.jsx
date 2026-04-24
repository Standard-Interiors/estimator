import React, { useState } from "react";

const MONO = "'JetBrains Mono',monospace";
const SANS = "'DM Sans',sans-serif";

const COLORS = {
  panel: "#0c0c14",
  panel2: "#11111d",
  border: "#2a2a3a",
  faint: "#555",
  text: "#eee",
  muted: "#888",
  orange: "#D94420",
  rapid: "#38bdf8",
  cut: "#f97316",
};

const partColor = (part) => {
  if (part.category === "front") return "rgba(34,197,94,0.2)";
  if (part.category === "drawer_box") return "rgba(249,115,22,0.18)";
  return "rgba(26,111,191,0.18)";
};

const partStroke = (part) => {
  if (part.category === "front") return "#22c55e";
  if (part.category === "drawer_box") return "#f97316";
  return "#1a6fbf";
};

const fmt = (value, digits = 2) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(digits).replace(/\.?0+$/, "");
};

const safeLabel = (value, fallback = "") => String(value ?? fallback);

function getPathBox(part, profile) {
  const radius = Number(profile.tool_diameter || 0) / 2;
  return {
    x0: part.x - radius,
    y0: part.y - radius,
    x1: part.x + part.width + radius,
    y1: part.y + part.height + radius,
  };
}

function svgY(sheet, y) {
  return sheet.sheet_height - y;
}

function cutPathD(sheet, part, profile) {
  const box = getPathBox(part, profile);
  return [
    `M ${fmt(box.x0, 4)} ${fmt(svgY(sheet, box.y0), 4)}`,
    `L ${fmt(box.x1, 4)} ${fmt(svgY(sheet, box.y0), 4)}`,
    `L ${fmt(box.x1, 4)} ${fmt(svgY(sheet, box.y1), 4)}`,
    `L ${fmt(box.x0, 4)} ${fmt(svgY(sheet, box.y1), 4)}`,
    "Z",
  ].join(" ");
}

function startPoint(part, profile) {
  const box = getPathBox(part, profile);
  return { x: box.x0, y: box.y0 };
}

function passCount(part, profile) {
  const thickness = Number(part.thickness || 0) || 0.75;
  const cutExtra = Number(profile.cut_extra_depth || 0);
  const passDepth = Math.max(0.05, Number(profile.pass_depth || 0.25));
  return Math.max(1, Math.ceil((thickness + cutExtra) / passDepth));
}

function machineSummary(profile) {
  return [
    safeLabel(profile.machine_make),
    safeLabel(profile.machine_model),
    safeLabel(profile.controller),
  ].filter(Boolean).join(" / ");
}

function WarningList({ warnings }) {
  if (!warnings.length) {
    return (
      <div style={{ fontSize: 11, color: "#22c55e", fontFamily: SANS }}>
        No package warnings.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {warnings.map((item, index) => (
        <div key={`${item.code}-${index}`} style={{
          padding: "8px 10px",
          border: "1px solid rgba(245,158,11,0.35)",
          background: "rgba(245,158,11,0.08)",
          borderRadius: 8,
        }}>
          <div style={{ fontSize: 10, color: "#fbbf24", fontFamily: MONO, fontWeight: 700 }}>
            {item.code || "review"}
          </div>
          <div style={{ fontSize: 11, color: "#ddd", fontFamily: SANS, lineHeight: 1.4 }}>
            {item.message}
          </div>
        </div>
      ))}
    </div>
  );
}

function SheetMap({ sheet, profile, selectedPartId, onSelectPart }) {
  const sheetW = Number(sheet.sheet_width || profile.sheet_width || 48);
  const sheetH = Number(sheet.sheet_height || profile.sheet_height || 96);
  const parts = sheet.parts || [];

  return (
    <div style={{
      background: "#f8fafc",
      borderRadius: 10,
      border: "1px solid #cbd5e1",
      padding: 10,
    }}>
      <svg
        data-testid="cnc-sheet-svg"
        viewBox={`0 0 ${sheetW} ${sheetH}`}
        role="img"
        aria-label={`CNC preview sheet ${sheet.id}`}
        style={{
          width: "100%",
          maxHeight: "68vh",
          display: "block",
          background: "#fff",
          borderRadius: 6,
          boxShadow: "inset 0 0 0 0.05px rgba(15,23,42,0.35)",
        }}
      >
        <defs>
          <pattern id="cnc-grid" width="6" height="6" patternUnits="userSpaceOnUse">
            <path d="M 6 0 L 0 0 0 6" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="0.06" />
          </pattern>
          <marker id="rapid-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
            <path d="M 0 0 L 5 2.5 L 0 5 z" fill={COLORS.rapid} />
          </marker>
        </defs>
        <rect x="0" y="0" width={sheetW} height={sheetH} fill="url(#cnc-grid)" />
        <rect
          x={profile.margin}
          y={profile.margin}
          width={sheetW - (profile.margin * 2)}
          height={sheetH - (profile.margin * 2)}
          fill="none"
          stroke="rgba(217,68,32,0.5)"
          strokeDasharray="0.8 0.45"
          strokeWidth="0.08"
        />

        {parts.map((part, index) => {
          const current = selectedPartId === part.instanceId;
          const previous = index === 0 ? { x: 0, y: 0 } : startPoint(parts[index - 1], profile);
          const start = startPoint(part, profile);
          return (
            <React.Fragment key={part.instanceId}>
              <line
                x1={fmt(previous.x, 4)}
                y1={fmt(svgY(sheet, previous.y), 4)}
                x2={fmt(start.x, 4)}
                y2={fmt(svgY(sheet, start.y), 4)}
                stroke={COLORS.rapid}
                strokeWidth={current ? "0.18" : "0.1"}
                strokeDasharray="0.55 0.35"
                markerEnd="url(#rapid-arrow)"
                opacity={current ? 0.95 : 0.42}
              />
              <path
                d={cutPathD(sheet, part, profile)}
                fill="none"
                stroke={COLORS.cut}
                strokeWidth={current ? "0.2" : "0.11"}
                opacity={current ? 0.95 : 0.38}
              />
              <rect
                x={fmt(part.x, 4)}
                y={fmt(sheetH - part.y - part.height, 4)}
                width={fmt(part.width, 4)}
                height={fmt(part.height, 4)}
                fill={partColor(part)}
                stroke={current ? COLORS.orange : partStroke(part)}
                strokeWidth={current ? "0.22" : "0.11"}
                rx="0.08"
                onClick={() => onSelectPart(part.instanceId)}
                style={{ cursor: "pointer" }}
              />
              <text
                x={fmt(part.x + Math.min(1.2, part.width / 2), 4)}
                y={fmt(sheetH - part.y - part.height + Math.min(1.35, part.height / 2), 4)}
                fontSize="1.1"
                fontFamily="monospace"
                fontWeight="700"
                fill="#111827"
                pointerEvents="none"
              >
                {index + 1}
              </text>
            </React.Fragment>
          );
        })}
      </svg>
    </div>
  );
}

function PartTable({ sheet, profile, selectedPartId, onSelectPart }) {
  const parts = sheet.parts || [];
  if (!parts.length) {
    return <div style={{ fontSize: 11, color: COLORS.faint }}>No programmed parts on this sheet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {parts.map((part, index) => {
        const active = selectedPartId === part.instanceId;
        return (
          <button
            key={part.instanceId}
            type="button"
            onClick={() => onSelectPart(part.instanceId)}
            style={{
              textAlign: "left",
              padding: "8px 9px",
              borderRadius: 8,
              border: active ? `1px solid ${COLORS.orange}` : `1px solid ${COLORS.border}`,
              background: active ? "rgba(217,68,32,0.12)" : COLORS.panel2,
              color: COLORS.text,
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: COLORS.orange, fontFamily: MONO, fontWeight: 800, minWidth: 22 }}>
                {index + 1}
              </span>
              <span style={{ fontSize: 11, color: COLORS.text, flex: 1, fontFamily: SANS }}>
                {part.part}
              </span>
              <span style={{ fontSize: 10, color: COLORS.muted, fontFamily: MONO }}>
                {fmt(part.width)} x {fmt(part.height)}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 9, color: COLORS.faint, fontFamily: MONO }}>
              <span>{part.cabId || "cab?"}</span>
              <span>X {fmt(part.x)}</span>
              <span>Y {fmt(part.y)}</span>
              <span>{passCount(part, profile)} Z passes</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SelectedPartDetails({ sheet, profile, selectedPartId }) {
  const selected = (sheet.parts || []).find(part => part.instanceId === selectedPartId) || (sheet.parts || [])[0];
  if (!selected) return null;

  const box = getPathBox(selected, profile);
  const passes = passCount(selected, profile);
  const finalDepth = (Number(selected.thickness || 0) || 0.75) + Number(profile.cut_extra_depth || 0);

  return (
    <div style={{
      padding: 12,
      borderRadius: 10,
      background: COLORS.panel2,
      border: `1px solid ${COLORS.border}`,
    }}>
      <div style={{ fontSize: 11, color: COLORS.orange, fontFamily: MONO, fontWeight: 800, marginBottom: 6 }}>
        Selected Cut
      </div>
      <div style={{ fontSize: 13, color: COLORS.text, fontFamily: SANS, fontWeight: 700, marginBottom: 8 }}>
        {selected.part}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontFamily: MONO, fontSize: 10, color: COLORS.muted }}>
        <span>Part: {fmt(selected.width)} x {fmt(selected.height)} x {fmt(selected.thickness)}</span>
        <span>Cabinet: {selected.cabId || "unknown"}</span>
        <span>Origin: X{fmt(selected.x)} Y{fmt(selected.y)}</span>
        <span>Tool start: X{fmt(box.x0)} Y{fmt(box.y0)}</span>
        <span>Cut box: {fmt(box.x1 - box.x0)} x {fmt(box.y1 - box.y0)}</span>
        <span>Z: {passes} pass{passes === 1 ? "" : "es"} to -{fmt(finalDepth)}</span>
      </div>
    </div>
  );
}

export default function CncPreviewModal({ packageData, onClose, onExportGcode, onExportPackage }) {
  const [sheetIndex, setSheetIndex] = useState(0);
  const [selectedPartId, setSelectedPartId] = useState(
    packageData?.sheets?.[0]?.parts?.[0]?.instanceId || null
  );

  if (!packageData) return null;

  const profile = packageData.machine_profile || {};
  const sheets = packageData.sheets || [];
  const sheet = sheets[Math.min(sheetIndex, Math.max(0, sheets.length - 1))] || null;
  const warnings = packageData.warnings || [];
  const gcodeLines = safeLabel(packageData.gcode?.content).split("\n").slice(0, 90).join("\n");

  const chooseSheet = (nextIndex) => {
    const nextSheet = sheets[nextIndex];
    setSheetIndex(nextIndex);
    setSelectedPartId(nextSheet?.parts?.[0]?.instanceId || null);
  };

  return (
    <div
      data-testid="cnc-preview-modal"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.78)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(1240px, 96vw)",
        maxHeight: "92vh",
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          borderBottom: `1px solid ${COLORS.border}`,
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ fontSize: 17, color: COLORS.text, fontFamily: SANS, fontWeight: 800 }}>
              CNC Preview
            </div>
            <div style={{ fontSize: 10, color: COLORS.muted, fontFamily: MONO, marginTop: 2 }}>
              {machineSummary(profile)} - {packageData.totals?.programmed_parts || 0} programmed parts - {sheets.length} sheet{sheets.length === 1 ? "" : "s"}
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <button
            data-testid="preview-export-gcode"
            onClick={() => onExportGcode(packageData)}
            style={{
              padding: "7px 11px",
              borderRadius: 8,
              border: `1px solid ${COLORS.orange}`,
              background: "rgba(217,68,32,0.16)",
              color: COLORS.orange,
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Download G-Code
          </button>
          <button
            onClick={() => onExportPackage(packageData)}
            style={{
              padding: "7px 11px",
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: COLORS.panel2,
              color: COLORS.muted,
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            CNC JSON
          </button>
          <button onClick={onClose} style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: `1px solid ${COLORS.border}`,
            background: "transparent",
            color: COLORS.muted,
            cursor: "pointer",
            fontSize: 16,
          }}>
            x
          </button>
        </div>

        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", gap: 8, overflowX: "auto" }}>
          {sheets.map((item, index) => {
            const active = index === sheetIndex;
            return (
              <button
                key={item.id}
                data-testid={`cnc-sheet-tab-${index}`}
                onClick={() => chooseSheet(index)}
                style={{
                  flex: "0 0 auto",
                  padding: "7px 10px",
                  borderRadius: 8,
                  border: active ? `1px solid ${COLORS.orange}` : `1px solid ${COLORS.border}`,
                  background: active ? "rgba(217,68,32,0.14)" : COLORS.panel2,
                  color: active ? COLORS.text : COLORS.muted,
                  cursor: "pointer",
                  fontFamily: MONO,
                  fontSize: 10,
                  textAlign: "left",
                }}
              >
                <strong>{item.id}</strong> - {item.parts?.length || 0} parts - {item.material} {item.thickness}"
              </button>
            );
          })}
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
          gap: 14,
          padding: 16,
          overflow: "auto",
        }}>
          <div style={{ minWidth: 0 }}>
            {sheet ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: COLORS.text, fontFamily: SANS, fontWeight: 800 }}>
                    4x8 Sheet Layout - {sheet.id}
                  </div>
                  <span style={{ fontSize: 10, color: COLORS.faint, fontFamily: MONO }}>
                    Origin lower-left - rapid paths blue dashed - cut paths orange
                  </span>
                </div>
                <SheetMap
                  sheet={sheet}
                  profile={profile}
                  selectedPartId={selectedPartId}
                  onSelectPart={setSelectedPartId}
                />
              </>
            ) : (
              <div style={{ padding: 30, color: COLORS.muted, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
                No sheets were programmed. Review warnings before export.
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
            <div style={{
              padding: 12,
              borderRadius: 10,
              background: COLORS.panel2,
              border: `1px solid ${COLORS.border}`,
            }}>
              <div style={{ fontSize: 11, color: COLORS.orange, fontFamily: MONO, fontWeight: 800, marginBottom: 8 }}>
                Warnings Before Export
              </div>
              <WarningList warnings={warnings} />
            </div>

            {sheet && (
              <>
                <SelectedPartDetails sheet={sheet} profile={profile} selectedPartId={selectedPartId} />
                <div style={{
                  padding: 12,
                  borderRadius: 10,
                  background: COLORS.panel2,
                  border: `1px solid ${COLORS.border}`,
                  maxHeight: 320,
                  overflow: "auto",
                }}>
                  <div style={{ fontSize: 11, color: COLORS.orange, fontFamily: MONO, fontWeight: 800, marginBottom: 8 }}>
                    Toolpath Order
                  </div>
                  <PartTable sheet={sheet} profile={profile} selectedPartId={selectedPartId} onSelectPart={setSelectedPartId} />
                </div>
              </>
            )}

            <div style={{
              padding: 12,
              borderRadius: 10,
              background: "#07070d",
              border: `1px solid ${COLORS.border}`,
              maxHeight: 260,
              overflow: "auto",
            }}>
              <div style={{ fontSize: 11, color: COLORS.orange, fontFamily: MONO, fontWeight: 800, marginBottom: 8 }}>
                G-Code Preview
              </div>
              <pre
                data-testid="cnc-gcode-preview"
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  color: "#aaa",
                  fontSize: 9,
                  lineHeight: 1.45,
                  fontFamily: MONO,
                }}
              >
                {gcodeLines}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
