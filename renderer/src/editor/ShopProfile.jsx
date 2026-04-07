import { useState } from "react";
import { DEFAULT_SHOP_PROFILE } from "../state/specHelpers";

const MONO = "'JetBrains Mono',monospace";
const SANS = "'DM Sans',sans-serif";

const SLIDE_TYPES = [
  { value: "side_mount", label: "Side Mount" },
  { value: "undermount", label: "Undermount" },
];

const JOINT_TYPES = [
  { value: "dado", label: "Dado" },
  { value: "rabbet", label: "Rabbet" },
  { value: "butt", label: "Butt" },
  { value: "confirmat", label: "Confirmat" },
];

/**
 * Shop Profile settings panel — set-once defaults for CNC cut list generation.
 * Changes auto-save on every field edit.
 */
export default function ShopProfile({ profile, onChange, onClose }) {
  const [expandedSection, setExpandedSection] = useState("box");
  const [confirmReset, setConfirmReset] = useState(false);

  const p = { ...DEFAULT_SHOP_PROFILE, ...profile };

  const update = (key, value) => {
    onChange({ ...p, [key]: value });
  };

  const helpText = (text) => (
    <div style={{ fontSize: 9, color: "#444", fontFamily: SANS, marginBottom: 8, marginTop: -4, lineHeight: 1.4 }}>{text}</div>
  );

  const numField = (key, label, unit = '"', step = 0.0625) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <label style={{ flex: 1, fontSize: 12, color: "#aaa", fontFamily: SANS }}>{label}</label>
      <input
        type="number"
        step={step}
        value={p[key]}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) update(key, v); }}
        style={{
          width: 72, height: 30, background: "#0a0a14", border: "1px solid #2a2a3a",
          borderRadius: 4, color: "#eee", textAlign: "center", fontSize: 12,
          fontFamily: MONO, fontWeight: 600,
        }}
      />
      <span style={{ fontSize: 10, color: "#555", width: 16 }}>{unit}</span>
    </div>
  );

  const textField = (key, label) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <label style={{ flex: 1, fontSize: 12, color: "#aaa", fontFamily: SANS }}>{label}</label>
      <input
        type="text"
        value={p[key]}
        onChange={e => update(key, e.target.value)}
        style={{
          width: 160, height: 30, background: "#0a0a14", border: "1px solid #2a2a3a",
          borderRadius: 4, color: "#eee", fontSize: 11, fontFamily: MONO,
          padding: "0 8px",
        }}
      />
    </div>
  );

  const selectField = (key, label, options) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <label style={{ flex: 1, fontSize: 12, color: "#aaa", fontFamily: SANS }}>{label}</label>
      <div style={{ display: "flex", gap: 4 }}>
        {options.map(opt => {
          const active = String(p[key]) === String(opt.value);
          return (
            <button
              key={String(opt.value)}
              onClick={() => update(key, opt.value)}
              style={{
                padding: "4px 10px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                cursor: "pointer", border: active ? "1px solid rgba(217,68,32,0.3)" : "1px solid transparent",
                fontFamily: MONO,
                background: active ? "rgba(217,68,32,0.2)" : "#14141e",
                color: active ? "#D94420" : "#555",
              }}
            >{opt.label}</button>
          );
        })}
      </div>
    </div>
  );

  const shelfCountField = (row, label) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <label style={{ flex: 1, fontSize: 12, color: "#aaa", fontFamily: SANS }}>{label}</label>
      <input
        type="number"
        step={1}
        min={0}
        max={10}
        value={(p.default_shelf_count || {})[row] || 0}
        onChange={e => {
          const v = parseInt(e.target.value);
          if (!isNaN(v) && v >= 0) {
            update("default_shelf_count", { ...p.default_shelf_count, [row]: v });
          }
        }}
        style={{
          width: 50, height: 30, background: "#0a0a14", border: "1px solid #2a2a3a",
          borderRadius: 4, color: "#eee", textAlign: "center", fontSize: 12,
          fontFamily: MONO, fontWeight: 600,
        }}
      />
      <span style={{ fontSize: 10, color: "#555", width: 16 }}></span>
    </div>
  );

  const Section = ({ id, title, children }) => {
    const open = expandedSection === id;
    return (
      <div style={{ borderBottom: "1px solid #1a1a2a" }}>
        <div
          onClick={() => setExpandedSection(open ? null : id)}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "10px 0",
            cursor: "pointer",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: open ? "#eee" : "#888", fontFamily: SANS, flex: 1 }}>{title}</span>
          <span style={{ fontSize: 10, color: "#555", transform: open ? "rotate(180deg)" : "none", transition: "0.15s" }}>▼</span>
        </div>
        {open && (
          <div style={{ padding: "0 0 14px 4px" }}>
            {children}
          </div>
        )}
      </div>
    );
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    onChange({ ...DEFAULT_SHOP_PROFILE });
    setConfirmReset(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#0c0c14", border: "1px solid #2a2a3a", borderRadius: 12,
        width: "90%", maxWidth: 480, maxHeight: "85vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", padding: "16px 20px",
          borderBottom: "1px solid #1a1a2a", flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#eee", fontFamily: SANS }}>Shop Profile</div>
            <div style={{ fontSize: 10, color: "#555", fontFamily: MONO, marginTop: 2 }}>Material &amp; construction defaults — changes auto-save</div>
          </div>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: 6, fontSize: 16,
            background: "transparent", border: "1px solid #2a2a3a",
            color: "#555", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>×</button>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 20px" }}>

          <Section id="box" title="Cabinet Box">
            {textField("box_material", "Material")}
            {numField("box_thickness", "Panel Thickness")}
            {selectField("box_joint", "Joint Type", JOINT_TYPES)}
            {numField("dado_depth", "Dado Depth")}
          </Section>

          <Section id="back" title="Back Panel">
            {textField("back_material", "Material")}
            {numField("back_thickness", "Thickness")}
            {numField("back_dado_depth", "Dado Slot Depth")}
            {helpText("Depth of the slot cut into sides for the back panel")}
            {numField("back_inset", "Inset from Rear Edge")}
            {helpText("Distance from rear edge of sides to the face of the back panel")}
          </Section>

          <Section id="drawer" title="Drawer Box &amp; Fronts">
            {textField("front_material", "Door/Drawer Front Material")}
            {numField("door_thickness", "Front Thickness")}
            {helpText("Material and thickness for all door and drawer fronts")}
            {textField("drawer_box_material", "Box Material")}
            {numField("drawer_box_thickness", "Box Thickness")}
            {textField("drawer_bottom_material", "Bottom Material")}
            {numField("drawer_bottom_thickness", "Bottom Thickness")}
            {numField("drawer_bottom_dado_depth", "Bottom Dado Depth")}
            {numField("drawer_box_rear_gap", "Rear Gap")}
            {helpText("Clearance behind drawer box for hardware and wiring")}
            {numField("drawer_reveal", "Front Overlay (total)")}
            {helpText("Total height the drawer front overlaps the box — typically 0.75\" top + 0.75\" bottom")}
          </Section>

          <Section id="slides" title="Drawer Slides">
            {selectField("slide_type", "Slide Type", SLIDE_TYPES)}
            {numField("slide_clearance", "Total Side Clearance")}
            {helpText("Combined clearance for both sides — e.g. 0.5\" = 0.25\" per side. For undermount slides, this is ignored.")}
          </Section>

          <Section id="toe" title="Toe Kick">
            {numField("toe_kick_height", "Height")}
            {numField("toe_kick_depth", "Depth")}
            {numField("base_bottom_clearance", "Leveler Clearance")}
            {helpText("Gap below the bottom panel for levelers and shims")}
            {selectField("include_toe_kick", "Include Toe Kick Part", [
              { value: true, label: "Yes" }, { value: false, label: "No" }])}
          </Section>

          <Section id="shelves" title="Shelving">
            {textField("shelf_material", "Material")}
            {numField("shelf_thickness", "Thickness")}
            {numField("shelf_setback", "Front Setback")}
            {helpText("How far the shelf sits back from the front edge")}
            {numField("shelf_clearance", "Pin Clearance (per side)")}
            {helpText("Clearance between shelf edge and cabinet side for adjustment")}
            <div style={{ fontSize: 10, color: "#666", fontFamily: SANS, marginBottom: 6, marginTop: 8, fontWeight: 600 }}>Default Shelf Count</div>
            {helpText("Applied to all cabinets of this type. Override per cabinet in the editor.")}
            {shelfCountField("base", "Base cabinets")}
            {shelfCountField("wall", "Wall cabinets")}
            {shelfCountField("tall", "Tall cabinets")}
          </Section>

          <Section id="structure" title="Structural Parts">
            {selectField("include_nailer", "Wall Cabinet Nailers", [
              { value: true, label: "Include" }, { value: false, label: "Skip" }])}
            {helpText("3\" mounting cleat at top of wall cabinets")}
            {selectField("include_face_frame", "Face Frame Parts", [
              { value: true, label: "Include" }, { value: false, label: "Skip" }])}
            {p.include_face_frame && helpText("Generates stiles and rails for each cabinet. Enable for framed construction.")}
            {p.include_face_frame && numField("face_frame_stile_width", "Stile Width")}
            {p.include_face_frame && numField("face_frame_rail_width", "Rail Width")}
          </Section>
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", gap: 8, padding: "12px 20px",
          borderTop: "1px solid #1a1a2a", flexShrink: 0, alignItems: "center",
        }}>
          {confirmReset ? (
            <>
              <span style={{ fontSize: 11, color: "#e04040", fontFamily: SANS }}>Reset all settings?</span>
              <button onClick={handleReset} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: "pointer", background: "#e04040", border: "none",
                color: "#fff", fontFamily: MONO,
              }}>Confirm</button>
              <button onClick={() => setConfirmReset(false)} style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                cursor: "pointer", background: "transparent", border: "1px solid #2a2a3a",
                color: "#666", fontFamily: MONO,
              }}>Cancel</button>
            </>
          ) : (
            <button onClick={handleReset} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: "pointer", background: "transparent", border: "1px solid #2a2a3a",
              color: "#666", fontFamily: MONO,
            }}>Reset Defaults</button>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            padding: "8px 20px", borderRadius: 6, fontSize: 11, fontWeight: 600,
            cursor: "pointer", background: "#D94420", border: "none",
            color: "#fff", fontFamily: SANS,
          }}>Close</button>
        </div>
      </div>
    </div>
  );
}
