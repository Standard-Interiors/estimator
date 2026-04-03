import { useState, useRef, useEffect } from "react";
import { imageUrl } from "../api";

/**
 * Room card for the project detail grid.
 * Shows thumbnail, name, cabinet count, extraction status.
 */
export default function RoomCard({ room, onClick, onRename, onDuplicate, onDelete }) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(room.name);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.focus();
  }, [renaming]);

  const thumbSrc = imageUrl(room.thumb_url);
  const cabCount = room.cabinet_count || 0;
  const hasSpec = room.has_spec;

  const handleRename = () => {
    const val = renameVal.trim();
    if (val && val !== room.name) onRename?.(val);
    setRenaming(false);
  };

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
      onClick={() => !renaming && !menuOpen && onClick?.()}
      style={{
        background: "#0c0c14",
        border: hover ? "1px solid #2a2a3a" : "1px solid #1a1a2a",
        borderRadius: 12,
        cursor: renaming ? "default" : "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hover ? "0 4px 16px rgba(0,0,0,0.3)" : "none",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Thumbnail */}
      <div style={{
        width: "100%",
        paddingBottom: "62.5%",
        background: "#08080e",
        position: "relative",
        overflow: "hidden",
      }}>
        {thumbSrc ? (
          <img src={thumbSrc} style={{
            position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
            objectFit: "cover",
          }} />
        ) : (
          <div style={{
            position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" opacity={0.25}>
              <rect x="3" y="3" width="18" height="18" rx="3" stroke="#666" strokeWidth="1.5"/>
              <circle cx="8.5" cy="8.5" r="2" stroke="#666" strokeWidth="1.5"/>
              <path d="M3 16l5-5 4 4 3-3 6 6" stroke="#666" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
        )}
        {/* Cabinet count badge */}
        {cabCount > 0 && (
          <span style={{
            position: "absolute", bottom: 8, right: 8,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
            padding: "2px 8px", borderRadius: 6,
            fontSize: 10, fontWeight: 600, color: "#ccc",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            {cabCount} cabinet{cabCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "10px 12px 10px" }}>
        {renaming ? (
          <input
            ref={inputRef}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setRenaming(false); }}
            onBlur={handleRename}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", background: "#0a0a14", border: "1px solid #D94420",
              borderRadius: 4, color: "#eee", padding: "2px 6px", fontSize: 14,
              fontWeight: 600, fontFamily: "inherit", outline: "none",
            }}
          />
        ) : (
          <div
            onClick={(e) => { e.stopPropagation(); setRenaming(true); setRenameVal(room.name); }}
            style={{
              fontSize: 14, fontWeight: 600, color: "#eee",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              cursor: "text", borderBottom: "1px dashed transparent",
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderBottomColor = "#333"}
            onMouseLeave={(e) => e.currentTarget.style.borderBottomColor = "transparent"}
            title="Tap to rename"
          >
            {room.name}
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 12px 10px",
      }}>
        {hasSpec ? (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
            fontFamily: "'JetBrains Mono', monospace",
            color: "#22c55e", background: "rgba(34,197,94,0.15)",
            display: "flex", alignItems: "center", gap: 4,
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Extracted
          </span>
        ) : (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
            fontFamily: "'JetBrains Mono', monospace",
            color: "#666", background: "rgba(255,255,255,0.04)",
          }}>
            No extraction
          </span>
        )}
        <span style={{ fontSize: 10, color: "#444", fontFamily: "'JetBrains Mono', monospace" }}>
          {cabCount > 0 ? `${cabCount} cab${cabCount !== 1 ? "s" : ""}` : ""}
        </span>
      </div>

      {/* Overflow menu trigger */}
      {hover && !renaming && (
        <div
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          style={{
            position: "absolute", top: 8, right: 8,
            width: 28, height: 28, borderRadius: 6,
            background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "#888", fontSize: 16,
          }}
        >
          ···
        </div>
      )}

      {/* Context menu */}
      {menuOpen && (
        <div ref={menuRef} onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", top: 40, right: 8,
          background: "#1a1a2a", border: "1px solid #2a2a3a", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)", minWidth: 140, zIndex: 10,
          padding: "4px 0",
        }}>
          <div onClick={() => { setMenuOpen(false); onDuplicate?.(); }}
            style={{ padding: "8px 14px", fontSize: 12, color: "#ddd", cursor: "pointer" }}
            onMouseEnter={(e) => e.target.style.background = "#2a2a3a"}
            onMouseLeave={(e) => e.target.style.background = "transparent"}>
            Duplicate
          </div>
          <div onClick={() => { setMenuOpen(false); setRenaming(true); setRenameVal(room.name); }}
            style={{ padding: "8px 14px", fontSize: 12, color: "#ddd", cursor: "pointer" }}
            onMouseEnter={(e) => e.target.style.background = "#2a2a3a"}
            onMouseLeave={(e) => e.target.style.background = "transparent"}>
            Rename
          </div>
          <div style={{ borderTop: "1px solid #2a2a3a", margin: "4px 0" }} />
          <div onClick={() => { setMenuOpen(false); onDelete?.(); }}
            style={{ padding: "8px 14px", fontSize: 12, color: "#e04040", cursor: "pointer" }}
            onMouseEnter={(e) => e.target.style.background = "#2a2a3a"}
            onMouseLeave={(e) => e.target.style.background = "transparent"}>
            Delete
          </div>
        </div>
      )}
    </div>
  );
}
