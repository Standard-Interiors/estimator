import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useIsMobile from "../hooks/useIsMobile";
import * as api from "../api";
import ProjectCard from "../components/ProjectCard";

export default function ProjectList() {
  const navigate = useNavigate();
  const { isMobile } = useIsMobile();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [duplicatePendingId, setDuplicatePendingId] = useState(null);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const inputRef = useRef(null);

  const fetchProjects = async () => {
    try {
      const data = await api.listProjects();
      setProjects(data);
    } catch (e) {
      console.error("Failed to load projects:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);
  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || createPending) return;
    setCreatePending(true);
    try {
      const p = await api.createProject(name);
      setCreating(false);
      setNewName("");
      navigate(`/project/${p.id}`);
    } catch (e) {
      console.error("Failed to create project:", e);
    } finally {
      setCreatePending(false);
    }
  };

  const handleDelete = async (project) => {
    if (!project) return;
    const roomCount = project.room_count || 0;
    const prompt = roomCount > 0
      ? `Delete "${project.name}"?`
      : `Delete empty project "${project.name}"?`;
    if (!window.confirm(prompt)) return;
    try {
      await api.deleteProject(project.id);
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const handleDuplicate = async (id) => {
    if (duplicatePendingId) return;
    setDuplicatePendingId(id);
    try {
      const p = await api.duplicateProject(id);
      setProjects((prev) => [p, ...prev]);
    } catch (e) {
      console.error("Failed to duplicate:", e);
    } finally {
      setDuplicatePendingId(null);
    }
  };

  const handleRename = async (id, name) => {
    try {
      await api.updateProject(id, { name });
      setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    } catch (e) {
      console.error("Failed to rename:", e);
    }
  };

  // Filter + search
  let filtered = projects;
  if (statusFilter !== "all") {
    filtered = filtered.filter((p) => p.status === statusFilter);
  }
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
  }

  const showSearchBar = projects.length >= 4;

  // Empty state
  if (!loading && projects.length === 0 && !creating) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", paddingTop: 80, textAlign: "center" }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.25, marginBottom: 16 }}>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="#666" strokeWidth="1.5"/>
          <line x1="3" y1="12" x2="21" y2="12" stroke="#666" strokeWidth="1"/>
          <line x1="9" y1="12" x2="9" y2="21" stroke="#666" strokeWidth="1"/>
          <line x1="15" y1="12" x2="15" y2="21" stroke="#666" strokeWidth="1"/>
        </svg>
        <div style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>No projects yet</div>
        <div style={{ fontSize: 12, color: "#444", marginBottom: 20, maxWidth: 320, margin: "0 auto 20px" }}>
          Create a project, add rooms, and extract cabinet specs from photos.
        </div>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: "#D94420", color: "#fff", border: "none",
            padding: "10px 24px", borderRadius: 18, fontSize: 12,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + New Project
        </button>
        {creating && (
          <div style={{ marginTop: 20 }}>
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape" && !createPending) setCreating(false);
              }}
              placeholder="e.g. Smith Cabinet Project"
              style={{
                background: "#0a0a14", border: "1px solid #D94420", borderRadius: 8,
                color: "#eee", padding: "10px 14px", fontSize: 13, width: 300,
                fontFamily: "inherit", outline: "none",
              }}
            />
            <div style={{ marginTop: 8, display: "flex", gap: 8, justifyContent: "center" }}>
              <button onClick={handleCreate} disabled={!newName.trim() || createPending} style={{
                background: (!newName.trim() || createPending) ? "#1a1a2a" : "#D94420", color: "#fff", border: "none",
                padding: "6px 16px", borderRadius: 6, fontSize: 12,
                fontWeight: 600, cursor: (!newName.trim() || createPending) ? "default" : "pointer", fontFamily: "inherit",
              }}>
                {createPending ? "Creating..." : "Create"}
              </button>
              <button onClick={() => { if (createPending) return; setCreating(false); }} style={{
                background: "transparent", color: "#555", border: "none",
                padding: "6px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: isMobile ? "0 10px" : "0 20px" }}>
      {/* Search/filter bar */}
      {showSearchBar && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 0", flexWrap: isMobile ? "wrap" : "nowrap",
        }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            style={{
              background: "#0c0c14", border: "1px solid #1a1a2a", borderRadius: 6,
              color: "#ddd", padding: "8px 12px", fontSize: 12,
              flex: isMobile ? "1 1 100%" : "0 1 300px",
              fontFamily: "inherit", outline: "none",
            }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              background: "#0c0c14", border: "1px solid #1a1a2a", borderRadius: 6,
              color: "#888", padding: "8px 10px", fontSize: 11, cursor: "pointer",
              fontFamily: "inherit", outline: "none",
            }}
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In Progress</option>
            <option value="finalized">Finalized</option>
          </select>
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setCreating(true)}
            style={{
              background: "#D94420", color: "#fff", border: "none",
              padding: "8px 18px", borderRadius: 18, fontSize: 12,
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            + New Project
          </button>
        </div>
      )}

      {/* No search bar — just the create button */}
      {!showSearchBar && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 0" }}>
          <button
            onClick={() => setCreating(true)}
            style={{
              background: "#D94420", color: "#fff", border: "none",
              padding: "8px 18px", borderRadius: 18, fontSize: 12,
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            + New Project
          </button>
        </div>
      )}

      {/* Inline create form */}
      {creating && (
        <div style={{
          background: "#0c0c14", border: "1px solid #D94420", borderRadius: 12,
          padding: 20, marginBottom: 14, textAlign: "center",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#eee", marginBottom: 10 }}>
            New Project
          </div>
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape" && !createPending) setCreating(false);
            }}
            placeholder="e.g. Smith Cabinet Project"
            style={{
              background: "#0a0a14", border: "1px solid #2a2a3a", borderRadius: 6,
              color: "#eee", padding: "10px 14px", fontSize: 13, width: "100%",
              maxWidth: 360, fontFamily: "inherit", outline: "none",
            }}
          />
          <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={handleCreate} disabled={!newName.trim() || createPending} style={{
              background: newName.trim() && !createPending ? "#D94420" : "#1a1a2a",
              color: "#fff", border: "none",
              padding: "8px 20px", borderRadius: 6, fontSize: 12,
              fontWeight: 600, cursor: newName.trim() && !createPending ? "pointer" : "default",
              fontFamily: "inherit",
            }}>
              {createPending ? "Creating..." : "Create"}
            </button>
            <button onClick={() => { if (createPending) return; setCreating(false); setNewName(""); }} style={{
              background: "transparent", color: "#555", border: "none",
              padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
            }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
        gap: 14,
        paddingBottom: 40,
      }}>
        {filtered.map((p) => (
          <ProjectCard
            key={p.id}
            project={p}
            onClick={() => navigate(`/project/${p.id}`)}
            onRename={(name) => handleRename(p.id, name)}
            onDuplicate={() => handleDuplicate(p.id)}
            onDelete={() => handleDelete(p)}
            duplicateDisabled={!p.room_count || duplicatePendingId === p.id}
          />
        ))}
      </div>

      {/* No results */}
      {filtered.length === 0 && !loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#444", fontSize: 13 }}>
          No projects match your search.
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#555", fontSize: 13 }}>
          Loading...
        </div>
      )}
    </div>
  );
}
