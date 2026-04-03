import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../api";
import RoomCard from "../components/RoomCard";

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  // Two-step create: first room name, then wall name
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [addingWallTo, setAddingWallTo] = useState(null); // room_name string
  const [newWallName, setNewWallName] = useState("");
  const [renamingRoom, setRenamingRoom] = useState(null); // room_name being edited
  const [renameRoomVal, setRenameRoomVal] = useState("");
  const roomRenameRef = useRef(null);
  const roomInputRef = useRef(null);
  const wallInputRef = useRef(null);

  const fetchProject = async () => {
    try {
      const data = await api.getProject(projectId);
      setProject(data);
    } catch (e) {
      console.error("Failed to load project:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProject(); }, [projectId]);
  useEffect(() => {
    if (creatingRoom && roomInputRef.current) roomInputRef.current.focus();
  }, [creatingRoom]);
  useEffect(() => {
    if (addingWallTo !== null && wallInputRef.current) wallInputRef.current.focus();
  }, [addingWallTo]);

  // Create a new room with its first wall
  const handleCreateRoom = async () => {
    const roomName = newRoomName.trim();
    if (!roomName) return;
    try {
      // Create first wall with auto-name "Wall 1"
      const r = await api.createRoom(projectId, null, roomName);
      setCreatingRoom(false);
      setNewRoomName("");
      navigate(`/project/${projectId}/room/${r.id}`);
    } catch (e) {
      console.error("Failed to create room:", e);
    }
  };

  // Add a wall to an existing room group
  const handleAddWall = async (roomName) => {
    const wallName = newWallName.trim() || null; // null = auto-name
    try {
      const r = await api.createRoom(projectId, wallName, roomName);
      setAddingWallTo(null);
      setNewWallName("");
      navigate(`/project/${projectId}/room/${r.id}`);
    } catch (e) {
      console.error("Failed to add wall:", e);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.deleteRoom(id);
      setProject((prev) => ({
        ...prev,
        rooms: prev.rooms.filter((r) => r.id !== id),
      }));
    } catch (e) {
      console.error("Failed to delete wall:", e);
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const r = await api.duplicateRoom(id);
      setProject((prev) => ({
        ...prev,
        rooms: [...prev.rooms, r],
      }));
    } catch (e) {
      console.error("Failed to duplicate wall:", e);
    }
  };

  const handleRename = async (id, name) => {
    try {
      await api.updateRoom(id, { name });
      setProject((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) => (r.id === id ? { ...r, name } : r)),
      }));
    } catch (e) {
      console.error("Failed to rename wall:", e);
    }
  };

  const handleRenameRoom = async (oldRoomName, newRoomName) => {
    if (!newRoomName || newRoomName === oldRoomName) return;
    try {
      // Update room_name on all walls in this group
      const wallsInGroup = (project?.rooms || []).filter(
        (r) => (r.room_name || "") === oldRoomName
      );
      await Promise.all(
        wallsInGroup.map((w) => api.updateRoom(w.id, { room_name: newRoomName }))
      );
      setProject((prev) => ({
        ...prev,
        rooms: prev.rooms.map((r) =>
          (r.room_name || "") === oldRoomName ? { ...r, room_name: newRoomName } : r
        ),
      }));
    } catch (e) {
      console.error("Failed to rename room:", e);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#555", fontSize: 13 }}>
        Loading...
      </div>
    );
  }

  if (!project) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#555", fontSize: 13 }}>
        Project not found.
      </div>
    );
  }

  const walls = project.rooms || [];

  // Group walls by room_name
  const roomGroups = [];
  const seenRooms = new Set();
  for (const w of walls) {
    const rn = w.room_name || "";
    if (!seenRooms.has(rn)) {
      seenRooms.add(rn);
      roomGroups.push({ roomName: rn, walls: walls.filter(x => (x.room_name || "") === rn) });
    }
  }

  // Count unique rooms
  const roomCount = roomGroups.length;
  const wallCount = walls.length;

  // Empty state
  if (walls.length === 0 && !creatingRoom) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "0 20px" }}>
        {renderHeader()}
        <div style={{ paddingTop: 60, textAlign: "center" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.25, marginBottom: 16 }}>
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="#666" strokeWidth="1.5"/>
            <circle cx="8.5" cy="8.5" r="2" stroke="#666" strokeWidth="1.5"/>
            <path d="M3 16l5-5 4 4 3-3 6 6" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ fontSize: 14, color: "#555", marginBottom: 4 }}>No rooms yet</div>
          <div style={{ fontSize: 12, color: "#444", marginBottom: 20, maxWidth: 320, margin: "0 auto 20px" }}>
            Add a room to start uploading photos and extracting cabinet specs.
          </div>
          <button
            onClick={() => setCreatingRoom(true)}
            style={{
              background: "#D94420", color: "#fff", border: "none",
              padding: "10px 24px", borderRadius: 18, fontSize: 12,
              fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            + Add Room
          </button>
          {creatingRoom && renderRoomCreateForm()}
        </div>
      </div>
    );
  }

  function renderHeader() {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 0",
      }}>
        <span
          onClick={() => navigate("/")}
          style={{ fontSize: 12, color: "#555", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace" }}
        >
          &larr; Projects
        </span>
        <span style={{ color: "#333" }}>|</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#eee" }}>{project.name}</span>
        <span style={{
          fontSize: 10, color: "#555", padding: "2px 6px", borderRadius: 4,
          border: "1px solid #2a2a3a", fontFamily: "'JetBrains Mono', monospace",
        }}>
          {roomCount} room{roomCount !== 1 ? "s" : ""} · {wallCount} wall{wallCount !== 1 ? "s" : ""}
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={() => setCreatingRoom(true)}
          style={{
            background: "#D94420", color: "#fff", border: "none",
            padding: "8px 18px", borderRadius: 18, fontSize: 12,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          + Add Room
        </button>
      </div>
    );
  }

  function renderRoomCreateForm() {
    return (
      <div style={{
        background: "#0c0c14", border: "1px solid #D94420", borderRadius: 12,
        padding: 20, marginBottom: 14, textAlign: "center", marginTop: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#eee", marginBottom: 10 }}>
          New Room
        </div>
        <input
          ref={roomInputRef}
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreateRoom(); if (e.key === "Escape") { setCreatingRoom(false); setNewRoomName(""); } }}
          placeholder="e.g. Kitchen, Master Bath, Laundry"
          style={{
            background: "#0a0a14", border: "1px solid #2a2a3a", borderRadius: 6,
            color: "#eee", padding: "10px 14px", fontSize: 13, width: "100%",
            maxWidth: 360, fontFamily: "inherit", outline: "none",
          }}
        />
        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center" }}>
          <button onClick={handleCreateRoom} disabled={!newRoomName.trim()} style={{
            background: newRoomName.trim() ? "#D94420" : "#1a1a2a",
            color: "#fff", border: "none",
            padding: "8px 20px", borderRadius: 6, fontSize: 12,
            fontWeight: 600, cursor: newRoomName.trim() ? "pointer" : "default",
            fontFamily: "inherit",
          }}>
            Create
          </button>
          <button onClick={() => { setCreatingRoom(false); setNewRoomName(""); }} style={{
            background: "transparent", color: "#555", border: "none",
            padding: "8px 16px", fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  function renderWallAddForm(roomName) {
    return (
      <div style={{
        background: "#0c0c14", border: "1px dashed #2a2a3a", borderRadius: 12,
        padding: 16, textAlign: "center",
        minHeight: 120, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <input
          ref={wallInputRef}
          value={newWallName}
          onChange={(e) => setNewWallName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddWall(roomName); if (e.key === "Escape") { setAddingWallTo(null); setNewWallName(""); } }}
          placeholder="e.g. Sink Wall, Range Wall (optional)"
          style={{
            background: "#0a0a14", border: "1px solid #2a2a3a", borderRadius: 6,
            color: "#eee", padding: "8px 12px", fontSize: 12, width: "100%",
            maxWidth: 260, fontFamily: "inherit", outline: "none", textAlign: "center",
          }}
        />
        <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "center" }}>
          <button onClick={() => handleAddWall(roomName)} style={{
            background: "#D94420", color: "#fff", border: "none",
            padding: "6px 14px", borderRadius: 6, fontSize: 11,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            Add
          </button>
          <button onClick={() => { setAddingWallTo(null); setNewWallName(""); }} style={{
            background: "transparent", color: "#555", border: "none",
            padding: "6px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "0 20px" }}>
      {renderHeader()}

      {/* Inline room create form */}
      {creatingRoom && renderRoomCreateForm()}

      {/* Room groups */}
      {roomGroups.map(({ roomName, walls: groupWalls }) => (
        <div key={roomName} style={{ marginBottom: 28 }}>
          {/* Room header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 0 10px",
            borderBottom: "1px solid #1a1a2a",
            marginBottom: 12,
          }}>
            {renamingRoom === roomName ? (
              <input
                ref={roomRenameRef}
                autoFocus
                value={renameRoomVal}
                onChange={(e) => setRenameRoomVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { handleRenameRoom(roomName, renameRoomVal.trim()); setRenamingRoom(null); }
                  if (e.key === "Escape") setRenamingRoom(null);
                }}
                onBlur={() => { handleRenameRoom(roomName, renameRoomVal.trim()); setRenamingRoom(null); }}
                style={{
                  fontSize: 15, fontWeight: 700, color: "#eee", margin: 0,
                  background: "#0a0a14", border: "1px solid #D94420", borderRadius: 4,
                  padding: "2px 8px", fontFamily: "inherit", outline: "none",
                }}
              />
            ) : (
              <h2
                onClick={roomName ? () => { setRenamingRoom(roomName); setRenameRoomVal(roomName); } : undefined}
                style={{
                  fontSize: 15, fontWeight: 700, color: "#ddd", margin: 0,
                  cursor: roomName ? "text" : "default",
                  borderBottom: "1px dashed transparent",
                }}
                onMouseEnter={(e) => { if (roomName) e.currentTarget.style.borderBottomColor = "#333"; }}
                onMouseLeave={(e) => e.currentTarget.style.borderBottomColor = "transparent"}
                title={roomName ? "Tap to rename" : undefined}
              >
                {roomName || "Ungrouped"}
              </h2>
            )}
            <span style={{
              fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace",
            }}>
              {groupWalls.length} wall{groupWalls.length !== 1 ? "s" : ""}
            </span>
            <span style={{ flex: 1 }} />
            <button
              onClick={() => { setAddingWallTo(roomName); setNewWallName(""); }}
              style={{
                background: "transparent", color: "#888", border: "1px solid #2a2a3a",
                padding: "4px 12px", borderRadius: 12, fontSize: 11,
                fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { e.target.style.borderColor = "#D94420"; e.target.style.color = "#D94420"; }}
              onMouseLeave={(e) => { e.target.style.borderColor = "#2a2a3a"; e.target.style.color = "#888"; }}
            >
              + Wall
            </button>
          </div>

          {/* Wall grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
          }}>
            {groupWalls.map((w) => (
              <RoomCard
                key={w.id}
                room={w}
                onClick={() => navigate(`/project/${projectId}/room/${w.id}`)}
                onRename={(name) => handleRename(w.id, name)}
                onDuplicate={() => handleDuplicate(w.id)}
                onDelete={() => handleDelete(w.id)}
              />
            ))}
            {addingWallTo === roomName && renderWallAddForm(roomName)}
          </div>
        </div>
      ))}
    </div>
  );
}
