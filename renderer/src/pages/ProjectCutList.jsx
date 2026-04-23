import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../api";
import ShopProfile from "../editor/ShopProfile";
import {
  loadShopProfile, saveShopProfile, resolveShopProfile,
  isShopProfileConfigured, markShopProfileConfigured,
  calcProjectCutList, formatFraction,
} from "../state/specHelpers";

const MONO = "'JetBrains Mono',monospace";

export default function ProjectCutList() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [projectMissing, setProjectMissing] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState(false);
  const [shopProfile, setShopProfileState] = useState(loadShopProfile);
  const [showShopProfile, setShowShopProfile] = useState(false);
  const [expandedWalls, setExpandedWalls] = useState(new Set());
  const [showFirstRun, setShowFirstRun] = useState(!isShopProfileConfigured());

  useEffect(() => {
    (async () => {
      setLoading(true);
      setProjectMissing(false);
      setProjectLoadError(false);
      setProject(null);
      try {
        const p = await api.getProject(projectId);
        setProject(p);
        // Auto-expand all walls
        const ids = new Set((p.rooms || []).filter(r => r.spec_json).map(r => r.id));
        setExpandedWalls(ids);
      } catch (e) {
        console.error("Failed to load project:", e);
        if (e?.status === 404) setProjectMissing(true);
        else setProjectLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const handleProfileChange = (p) => { setShopProfileState(p); saveShopProfile(p); };

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#555", fontSize: 13 }}>Loading...</div>;
  if (projectLoadError) return <div style={{ textAlign: "center", padding: 60, color: "#555", fontSize: 13 }}>Failed to load project.</div>;
  if (projectMissing || !project) return <div style={{ textAlign: "center", padding: 60, color: "#555", fontSize: 13 }}>Project not found.</div>;

  // Parse all wall specs
  const wallData = (project.rooms || [])
    .filter(r => r.spec_json)
    .map(r => {
      try {
        const spec = JSON.parse(r.spec_json);
        const profile = resolveShopProfile(spec) || shopProfile;
        const parts = calcProjectCutList(spec, profile);
        return {
          room: r,
          spec,
          parts: parts.map(p => ({ ...p, roomName: r.room_name || "", wallName: r.name || "Wall" })),
        };
      } catch { return null; }
    })
    .filter(Boolean);

  const allParts = wallData.flatMap(w => w.parts);
  const totalParts = allParts.reduce((s, p) => s + p.qty, 0);
  const totalCabinets = wallData.reduce((s, w) => s + (w.spec.cabinets?.length || 0), 0);

  // Material summary
  const byMaterial = {};
  allParts.forEach(p => {
    const key = p.material || "Unknown";
    if (!byMaterial[key]) byMaterial[key] = [];
    byMaterial[key].push(p);
  });

  const catColor = (c) => c === "front" ? "#22c55e" : c === "drawer_box" ? "#f97216" : "#1a6fbf";

  const toggleWall = (id) => {
    setExpandedWalls(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exportCSV = () => {
    const csv = ["Room,Wall,Part_ID,Cabinet,Part,Qty,Length,Width,Thickness,Material,Grain,Edge_Band"];
    allParts.forEach(p => {
      const l = Math.max(p.width, p.height), w = Math.min(p.width, p.height);
      csv.push(`"${p.roomName}","${p.wallName}",${p.partId || ""},${p.cabId},${p.part},${p.qty},${l},${w},${p.thickness || ""},${p.material},${p.grain || ""},${p.edgeBand}`);
    });
    const blob = new Blob([csv.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(project.name || "project").replace(/\s+/g, "_")}_cutlist_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 20px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", flexWrap: "wrap" }}>
        <span onClick={() => navigate(`/project/${projectId}`)}
          style={{ fontSize: 12, color: "#555", cursor: "pointer", fontFamily: MONO }}>← {project.name}</span>
        <span style={{ color: "#333" }}>|</span>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#eee" }}>Project Cut List</h1>
        <span style={{ fontSize: 10, color: "#555", fontFamily: MONO }}>
          {totalParts} parts · {totalCabinets} cabinet{totalCabinets !== 1 ? "s" : ""} · {wallData.length} wall{wallData.length !== 1 ? "s" : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setShowShopProfile(true)} style={{
          padding: "5px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
          cursor: "pointer", background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888",
        }}>⚙ Shop Profile</button>
        <button onClick={exportCSV} style={{
          padding: "5px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
          cursor: "pointer", background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888",
        }}>Export CSV</button>
        <button onClick={() => window.print()} style={{
          padding: "5px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
          cursor: "pointer", background: "#1a1a2a", border: "1px solid #2a2a3a", color: "#888",
        }}>Print</button>
      </div>

      {/* First-run banner */}
      {showFirstRun && (
        <div style={{ padding: 16, marginBottom: 14, background: "#14141e", border: "1px solid #D94420", borderRadius: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#eee", marginBottom: 4 }}>Set up your shop defaults</div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>
            These control how every cut list is calculated. Set them to match your shop.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setShowFirstRun(false); setShowShopProfile(true); markShopProfileConfigured(); }}
              style={{ padding: "6px 16px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "#D94420", border: "none", color: "#fff" }}>
              Configure Shop Profile
            </button>
            <button onClick={() => { setShowFirstRun(false); markShopProfileConfigured(); }}
              style={{ padding: "6px 16px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "transparent", border: "1px solid #2a2a3a", color: "#666" }}>
              Use Defaults
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginBottom: 14, fontSize: 10, color: "#555", fontFamily: MONO }}>
        {[["#1a6fbf", "Box"], ["#22c55e", "Fronts"], ["#f97216", "Drawer Box"]].map(([c, l]) => (
          <span key={l}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: c, marginRight: 4, verticalAlign: "middle" }} />{l}</span>
        ))}
      </div>

      {/* Empty state */}
      {wallData.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#555" }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>No cabinet specs found</div>
          <div style={{ fontSize: 12, color: "#444" }}>Extract cabinets from photos in your rooms first.</div>
        </div>
      )}

      {/* Per-wall breakdown */}
      {wallData.map(({ room, spec, parts }) => {
        const expanded = expandedWalls.has(room.id);
        const wallParts = parts;
        const wallPartCount = wallParts.reduce((s, p) => s + p.qty, 0);
        const cabCount = spec.cabinets?.length || 0;
        return (
          <div key={room.id} style={{ marginBottom: 16 }}>
            {/* Wall header — collapsible */}
            <div onClick={() => toggleWall(room.id)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 0",
              borderBottom: "1px solid #1a1a2a", cursor: "pointer",
            }}>
              <span style={{ fontSize: 10, color: "#555", transform: expanded ? "rotate(180deg)" : "none", transition: "0.15s" }}>▼</span>
              {room.room_name && <span style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>{room.room_name}</span>}
              {room.room_name && <span style={{ color: "#333", fontSize: 11 }}>›</span>}
              <span style={{ fontSize: 13, fontWeight: 700, color: "#ddd" }}>{room.name || "Wall"}</span>
              <span style={{ fontSize: 10, color: "#555", fontFamily: MONO }}>{cabCount} cabs · {wallPartCount} parts</span>
              <span style={{ flex: 1 }} />
              <span onClick={e => { e.stopPropagation(); navigate(`/project/${projectId}/room/${room.id}`); }}
                style={{ fontSize: 10, color: "#555", cursor: "pointer" }}>edit →</span>
            </div>

            {/* Expanded: per-cabinet parts table */}
            {expanded && (spec.cabinets || []).map(cab => {
              const cabParts = wallParts.filter(p => p.cabId === cab.id);
              if (!cabParts.length) return null;
              return (
                <div key={cab.id} style={{ marginLeft: 12, marginTop: 8, marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 11 }}>
                    <span style={{ color: cab.row === "base" ? "#D94420" : "#1a6fbf", fontWeight: 700, fontFamily: MONO }}>{cab.id}</span>
                    <span style={{ color: "#555" }}>{cab.type}</span>
                    <span style={{ color: "#444", fontFamily: MONO }}>{cab.width}" × {cab.height}" × {cab.depth}"</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ color: "#444", fontSize: 10 }}>{cabParts.reduce((s, p) => s + p.qty, 0)} parts</span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: MONO }}>
                      <tbody>
                        {cabParts.map((p, i) => {
                          const prevCat = i > 0 ? cabParts[i - 1].category : null;
                          const showSep = prevCat && prevCat !== p.category;
                          return (
                            <React.Fragment key={i}>
                              {showSep && <tr><td colSpan={8} style={{ padding: 0, height: 1, background: "#2a2a3a" }} /></tr>}
                              <tr style={{ borderBottom: "1px solid #0a0a14", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)" }}>
                                <td style={{ padding: "3px 4px", width: 6 }}>
                                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 2, background: catColor(p.category) }} />
                                </td>
                                <td style={{ padding: "3px 4px", color: "#555", fontSize: 9, whiteSpace: "nowrap" }}>{p.partId || ""}</td>
                                <td style={{ padding: "3px 4px", color: "#ccc", whiteSpace: "nowrap" }}>{p.part}</td>
                                <td style={{ padding: "3px 4px", color: "#888" }}>{p.qty}</td>
                                <td style={{ padding: "3px 4px", color: "#eee", fontWeight: 600, whiteSpace: "nowrap" }}>{p.width}"</td>
                                <td style={{ padding: "3px 4px", color: "#eee", fontWeight: 600, whiteSpace: "nowrap" }}>{p.height}"</td>
                                <td style={{ padding: "3px 4px", color: "#888", fontSize: 9 }}>{p.thickness || ""}</td>
                                <td style={{ padding: "3px 4px", color: "#666", fontSize: 9, whiteSpace: "nowrap" }}>{p.material}</td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Combined material summary */}
      {allParts.length > 0 && (
        <div data-printable style={{ marginTop: 24, padding: "14px 16px", background: "#0a0a14", borderRadius: 8, border: "1px solid #1a1a2a", marginBottom: 40 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#888", marginBottom: 10, letterSpacing: "0.05em" }}>COMBINED MATERIAL SUMMARY</div>
          {Object.entries(byMaterial).map(([mat, parts]) => {
            const totalQty = parts.reduce((s, p) => s + p.qty, 0);
            const totalSqIn = parts.reduce((s, p) => s + (p.qty * p.width * p.height), 0);
            const sheets = Math.ceil((totalSqIn / (48 * 96 * 0.65)) * 10) / 10;
            return (
              <div key={mat} style={{ display: "flex", gap: 10, padding: "5px 0", fontSize: 12, fontFamily: MONO, alignItems: "center" }}>
                <span style={{ color: "#D94420", fontWeight: 700, minWidth: 36 }}>{totalQty}x</span>
                <span style={{ color: "#eee", fontWeight: 600, flex: 1 }}>{mat}</span>
                {sheets > 0.1 && <span style={{ color: "#888", fontSize: 10, background: "#14141e", padding: "2px 8px", borderRadius: 4 }}>~{sheets} sheets (4×8)</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Print-only header */}
      <div data-printonly style={{ display: "none" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: "20px 0 4px" }}>{project.name} — Complete Cut List</h1>
        <p style={{ fontSize: 11, color: "#666", margin: "0 0 20px" }}>
          Generated {new Date().toLocaleDateString()} · {totalParts} parts · {totalCabinets} cabinets · {wallData.length} walls
        </p>
      </div>

      {/* Shop Profile Modal */}
      {showShopProfile && (
        <ShopProfile
          profile={shopProfile}
          onChange={handleProfileChange}
          onClose={() => setShowShopProfile(false)}
        />
      )}
    </div>
  );
}
