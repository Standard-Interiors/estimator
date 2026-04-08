import React, { useState, useRef, useEffect, useCallback } from "react";
import { Routes, Route, useParams, useNavigate } from "react-router-dom";
import useSpecState from "./state/useSpecState";
import useIsMobile from "./hooks/useIsMobile";
import InteractiveRender from "./editor/InteractiveRender";
import CabinetEditBar from "./editor/CabinetEditBar";
import DoorDetailView from "./editor/DoorDetailView";
import BottomSheet from "./editor/BottomSheet";
import { defaultCabinet, generateId, calcDoorSizes, formatFraction, calcScribeNotes, loadShopProfile, saveShopProfile, resolveShopProfile, isShopProfileConfigured, markShopProfileConfigured, calcFullCutList, calcProjectCutList } from "./state/specHelpers";
import ProjectList from "./pages/ProjectList";
import ProjectDetail from "./pages/ProjectDetail";
import ProjectCutList from "./pages/ProjectCutList";
import JsonEditor from "./components/JsonEditor";
import ShopProfile from "./editor/ShopProfile";
import * as api from "./api";

// ═══════════════════════════════════════════════════════════
// PRE-EXTRACTED SPEC — from the uploaded wireframe image
// ═══════════════════════════════════════════════════════════
const WIREFRAME_SPEC = {
  base_layout: [
    { ref: "B1" },
    { ref: "B2" },
    { type: "appliance", id: "range", label: "Range", width: 30 },
    { ref: "B3" },
    { ref: "B4" },
    { ref: "B5" }
  ],
  wall_layout: [
    { ref: "W1" },
    { ref: "W2" },
    { ref: "W3" },
    { ref: "W4" },
    { ref: "W5" },
    { ref: "W6" },
    { ref: "W7" }
  ],
  alignment: [
    { wall: "W1", base: "B1" },
    { wall: "W4", base: "B3" }
  ],
  cabinets: [
    { id: "B1", type: "base", label: "Drawer over single door", row: "base", width: 18, height: 34.5, depth: 24,
      face: { sections: [{ type: "drawer", count: 1, height: 6 }, { type: "door", count: 1, hinge_side: "left" }] } },
    { id: "B2", type: "base", label: "Single door tall", row: "base", width: 21, height: 34.5, depth: 24,
      face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "B3", type: "base_sink", label: "Sink base", row: "base", width: 36, height: 34.5, depth: 24,
      face: { sections: [{ type: "false_front", count: 1, height: 6 }, { type: "door", count: 2 }] } },
    { id: "B4", type: "base", label: "Drawer over double door", row: "base", width: 24, height: 34.5, depth: 24,
      face: { sections: [{ type: "drawer", count: 1, height: 6 }, { type: "door", count: 2 }] } },
    { id: "B5", type: "base_pullout", label: "Spice/wine pullout", row: "base", width: 9, height: 34.5, depth: 24,
      face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W1", type: "wall", label: "Tall single left", row: "wall", width: 15, height: 42, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W2", type: "wall", label: "Tall single right", row: "wall", width: 15, height: 42, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } },
    { id: "W3", type: "wall", label: "Double door wide", row: "wall", width: 33, height: 30, depth: 12,
      face: { sections: [{ type: "door", count: 2 }] } },
    { id: "W4", type: "wall", label: "Double door over sink", row: "wall", width: 33, height: 30, depth: 12,
      face: { sections: [{ type: "door", count: 2 }] } },
    { id: "W5", type: "wall", label: "Single door", row: "wall", width: 18, height: 30, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } },
    { id: "W6", type: "wall", label: "Short square left", row: "wall", width: 15, height: 18, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "right" }] } },
    { id: "W7", type: "wall", label: "Short square right", row: "wall", width: 15, height: 18, depth: 12,
      face: { sections: [{ type: "door", count: 1, hinge_side: "left" }] } }
  ]
};

// ═══════════════════════════════════════════════════════════
// RENDERER
// ═══════════════════════════════════════════════════════════
const SC = 2.5;
const IDX = 0.42;
const IDY = -0.32;
function dp(depth) { const v = depth||0; return { x:v*SC*IDX, y:v*SC*IDY }; }

function Box3D({ cx, cy, w, h, depth, front, top, side, stroke, sw, dash }) {
  const cw = Math.max((w||1)*SC, 1), ch = Math.max((h||1)*SC, 1);
  const dd = dp(depth);
  return (
    <g>
      <polygon points={`${cx},${cy} ${cx+dd.x},${cy+dd.y} ${cx+cw+dd.x},${cy+dd.y} ${cx+cw},${cy}`}
        fill={top||"#f2f2f2"} stroke={stroke||"#333"} strokeWidth={(sw||1.2)*0.6} strokeDasharray={dash||""} />
      <polygon points={`${cx+cw},${cy} ${cx+cw+dd.x},${cy+dd.y} ${cx+cw+dd.x},${cy+ch+dd.y} ${cx+cw},${cy+ch}`}
        fill={side||"#e4e4e4"} stroke={stroke||"#333"} strokeWidth={(sw||1.2)*0.6} strokeDasharray={dash||""} />
      <polygon points={`${cx},${cy} ${cx+cw},${cy} ${cx+cw},${cy+ch} ${cx},${cy+ch}`}
        fill={front||"#fff"} stroke={stroke||"#333"} strokeWidth={sw||1.2} strokeDasharray={dash||""} />
    </g>
  );
}

function Face({ cab, cx, cy, w, h }) {
  const secs = Array.isArray(cab?.face?.sections) ? cab.face.sections : [];
  if (!secs.length) return null;
  const cw = w*SC, ch = h*SC, m = 3;
  const fixH = secs.reduce((s, sec) => s + (sec.height||0)*SC, 0);
  const flexN = secs.filter(s => !s.height).length;
  const flexH = flexN > 0 ? Math.max(0, (ch - fixH) / flexN) : 0;
  const els = [];
  let sy = cy, si = 0;
  secs.forEach(sec => {
    const sh = Math.max(sec.height ? sec.height*SC : flexH, 2);
    if (sec.type === "drawer" || sec.type === "false_front") {
      els.push(<rect key={si+"r"} x={cx+m} y={sy+m} width={Math.max(cw-m*2,1)} height={Math.max(sh-m*2,1)} fill="none" stroke="#666" strokeWidth={0.8} rx={1}/>);
      els.push(<line key={si+"p"} x1={cx+cw/2-7} y1={sy+sh/2} x2={cx+cw/2+7} y2={sy+sh/2} stroke="#999" strokeWidth={1.3} strokeLinecap="round"/>);
    } else if (sec.type === "door" || sec.type === "glass_door") {
      const n = Math.max(sec.count||1, 1), dw = (cw-m*2)/n;
      if (dw >= 4) for (let di = 0; di < n; di++) {
        const dx = cx+m+di*dw;
        els.push(<rect key={`${si}d${di}`} x={dx+1} y={sy+m} width={Math.max(dw-2,1)} height={Math.max(sh-m*2,1)} fill="none" stroke="#666" strokeWidth={0.8} rx={1}/>);
        if (dw > 14) els.push(<rect key={`${si}d${di}i`} x={dx+5} y={sy+m+4} width={Math.max(dw-10,1)} height={Math.max(sh-m*2-8,1)} fill="none" stroke="#ccc" strokeWidth={0.4} rx={1}/>);
        let px = n===1 ? (sec.hinge_side==="left" ? dx+dw-9 : dx+9) : (di===0 ? dx+dw-9 : dx+9);
        const pl = Math.min(10, sh*0.15);
        const py = cab.row==="wall" ? sy+sh-m-8-pl : sy+m+6;
        els.push(<line key={`${si}d${di}h`} x1={px} y1={py} x2={px} y2={py+pl} stroke="#999" strokeWidth={1.3} strokeLinecap="round"/>);
      }
    }
    sy += sh; si++;
  });
  return <>{els}</>;
}

function Render({ spec }) {
  if (!spec?.cabinets?.length) return <div style={{color:"#555",padding:20,textAlign:"center"}}>No cabinets loaded</div>;
  const cabMap = {}; spec.cabinets.forEach(c => { cabMap[c.id] = c; });
  const PAD=45, FLOOR=450, TOE=4.5*SC, CTH=1.5*SC, GAP=18*SC;
  const CTTOP = FLOOR-TOE-34.5*SC-CTH, WBOT = CTTOP-GAP;

  const baseItems = []; let bx = PAD;
  (spec.base_layout||[]).forEach(item => {
    const id = item.ref||item.id, cab = cabMap[id], w = cab?cab.width:(item.width||30);
    baseItems.push({ id, x:bx, w, cab, item }); bx += w*SC;
  });
  const bMap = {}; baseItems.forEach(b => { bMap[b.id] = b; });

  const aMap = {}; (spec.alignment||[]).forEach(a => { aMap[a.wall] = a.base; });
  const wallItems = []; let wx = PAD; let prevWasGap = false;
  (spec.wall_layout||[]).forEach(item => {
    const id = item.ref||item.id, cab = cabMap[id], w = cab?cab.width:(item.width||30);
    // Only apply alignment if no explicit filler/gap precedes this cabinet
    // Never move backwards — alignment can only push right, not overlap previous items
    if (!prevWasGap && aMap[id] && bMap[aMap[id]]) {
      const alignX = bMap[aMap[id]].x;
      if (alignX >= wx) wx = alignX;
    }
    wallItems.push({ id, x:wx, w, cab, item }); wx += w*SC;
    prevWasGap = !item.ref;
  });

  const maxWH = Math.max(...wallItems.filter(w=>w.cab).map(w=>(w.cab.height||30)), 30)*SC;
  const WTOP = WBOT - maxWH;
  const ddMax = dp(24);
  const svgW = Math.max(bx,wx) + PAD + ddMax.x + 20;
  const svgH = 530;

  const lastCabItem = (spec.base_layout||[]).filter(i=>i.ref).slice(-1)[0];
  const lastB = lastCabItem ? bMap[lastCabItem.ref] : null;
  const ctR = lastB ? lastB.x + lastB.w*SC : bx;
  const ctW = (ctR-PAD)/SC;

  return (
    <div style={{background:"#fff",borderRadius:10,overflow:"auto",border:"1px solid rgba(26,26,46,0.12)",padding:10}}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} style={{display:"block",maxWidth:"100%",minWidth:svgW}}>
        <Box3D cx={PAD} cy={CTTOP} w={ctW} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#888" sw={0.8}/>

        {(() => {
          const baseEls = [];
          const baseLabelPos = [];
          baseItems.forEach(bi => {
            if (!bi.cab) {
              const isFiller = bi.item?.type === "filler";
              if (isFiller) {
                const cy = FLOOR-TOE-34.5*SC;
                baseEls.push(<g key={`f-${bi.id}-${bi.x}`}>
                  <line x1={bi.x+bi.w*SC/2} y1={cy} x2={bi.x+bi.w*SC/2} y2={FLOOR} stroke="#ccc" strokeWidth={0.5} strokeDasharray="3,3"/>
                  <text x={bi.x+bi.w*SC/2} y={FLOOR+13} textAnchor="middle" fontSize={6} fill="#bbb" fontFamily="monospace">{bi.w}"</text>
                </g>);
              } else {
                const isFridge = bi.id==="fridge"||bi.item?.label?.toLowerCase()?.includes("fridge");
                const h = isFridge?70:34.5, cy = isFridge?(FLOOR-h*SC):(FLOOR-TOE-34.5*SC);
                baseEls.push(<g key={`a-${bi.id}`}>
                  <Box3D cx={bi.x} cy={cy} w={bi.w} h={h} depth={isFridge?28:24} front="#f8f8f8" top="#eee" side="#e0e0e0" stroke="#aaa" sw={0.7} dash="5,3"/>
                  <text x={bi.x+bi.w*SC/2} y={cy+(h*SC)/2+3} textAnchor="middle" fontSize={8} fill="#aaa" fontFamily="monospace">{(bi.item?.label||bi.id).toUpperCase()}</text>
                  <text x={bi.x+bi.w*SC/2} y={FLOOR+13} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">{bi.w}"</text>
                </g>);
              }
              return;
            }
            const c = bi.cab, ch = c.height||34.5, d = c.depth||24, cy = FLOOR-TOE-ch*SC;
            const labelX = bi.x + c.width*SC/2;
            const tooClose = baseLabelPos.some(px => Math.abs(labelX - px) < 45);
            const labelYOff = tooClose ? 33 : 23;
            baseLabelPos.push(labelX);
            baseEls.push(<g key={`b-${bi.id}`}>
              <Box3D cx={bi.x} cy={cy} w={c.width} h={ch} depth={d}/>
              <rect x={bi.x+2*SC} y={FLOOR-TOE} width={Math.max(0,c.width*SC-4*SC)} height={TOE} fill="none" stroke="#ccc" strokeWidth={0.4}/>
              <Face cab={c} cx={bi.x} cy={cy} w={c.width} h={ch}/>
              <text x={labelX} y={FLOOR+13} textAnchor="middle" fontSize={9} fill="#D94420" fontWeight={700} fontFamily="monospace">{bi.id}</text>
              <text x={labelX} y={FLOOR+labelYOff} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width}w {ch}h {d}d</text>
            </g>);
          });
          return baseEls;
        })()}

        <Box3D cx={PAD} cy={CTTOP} w={ctW} h={1.5} depth={25.5} front="none" top="none" side="none" stroke="#444" sw={1.3}/>

        {(() => {
          // Render wall items with collision-free labels
          const wallEls = [];
          const labelPositions = []; // track label x positions for staggering
          wallItems.forEach((wi, idx) => {
            if (!wi.cab) {
              const isFiller = wi.item?.type === "filler";
              if (isFiller) {
                wallEls.push(<g key={`wf-${wi.id}-${wi.x}`}>
                  <line x1={wi.x+wi.w*SC/2} y1={WTOP} x2={wi.x+wi.w*SC/2} y2={WBOT} stroke="#ccc" strokeWidth={0.5} strokeDasharray="3,3"/>
                  <text x={wi.x+wi.w*SC/2} y={WTOP-5} textAnchor="middle" fontSize={6} fill="#bbb" fontFamily="monospace">{wi.w}"</text>
                </g>);
              } else {
                const hh=16, hy=WBOT+8;
                wallEls.push(<g key={`h-${wi.id}`}>
                  <rect x={wi.x+6} y={hy} width={Math.max(wi.w*SC-12,1)} height={hh} fill="#f4f4f4" stroke="#aaa" strokeWidth={0.7} rx={3}/>
                  <text x={wi.x+wi.w*SC/2} y={hy+11} textAnchor="middle" fontSize={7} fill="#aaa" fontFamily="monospace">HOOD</text>
                </g>);
              }
              return;
            }
            const c = wi.cab, ch = c.height||30, d = c.depth||12;
            const labelX = wi.x + c.width*SC/2;
            // Check if this label overlaps with a previous one (within 40px)
            const tooClose = labelPositions.some(px => Math.abs(labelX - px) < 40);
            const labelYOff = tooClose ? -25 : -15;
            labelPositions.push(labelX);
            const wcy = WTOP + (c.yOffset || 0) * SC;
            wallEls.push(<g key={`w-${wi.id}`}>
              <Box3D cx={wi.x} cy={wcy} w={c.width} h={ch} depth={d} front="#fff" top="#eee" side="#ddd"/>
              <Face cab={c} cx={wi.x} cy={wcy} w={c.width} h={ch}/>
              <text x={labelX} y={wcy-5} textAnchor="middle" fontSize={9} fill="#1a6fbf" fontWeight={700} fontFamily="monospace">{wi.id}</text>
              <text x={labelX} y={wcy+labelYOff} textAnchor="middle" fontSize={6.5} fill="#888" fontFamily="monospace">{c.width}x{ch}x{d}</text>
            </g>);
          });
          return wallEls;
        })()}

        {wallItems.length > 0 && (() => {
          const mn = Math.min(...wallItems.map(p=>p.x)), mx = Math.max(...wallItems.map(p=>p.x+p.w*SC)), dd = dp(12);
          return <g><line x1={mn} y1={WTOP} x2={mx} y2={WTOP} stroke="#444" strokeWidth={1}/><line x1={mx} y1={WTOP} x2={mx+dd.x} y2={WTOP+dd.y} stroke="#666" strokeWidth={0.5}/></g>;
        })()}
        <line x1={0} y1={FLOOR} x2={svgW} y2={FLOOR} stroke="#e0e0e0" strokeWidth={0.5}/>
      </svg>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════
const EMPTY_SPEC = { base_layout: [], wall_layout: [], alignment: [], cabinets: [] };

function EditorApp({ roomId, projectId, projectName, roomName, wallName, onBack }) {
  const { spec, dispatch, undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useSpecState(EMPTY_SPEC);
  const { isMobile, isLandscape } = useIsMobile();
  const [tab, setTab] = useState("render");
  const [showPhotoSidebar, setShowPhotoSidebar] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [jsonInput, setJsonInput] = useState("");
  const [jsonError, setJsonError] = useState(null);
  const [mode, setMode] = useState("home"); // home | loaded
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [extractionError, setExtractionError] = useState(null);
  const [wireframePreview, setWireframePreview] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [dragTarget, setDragTarget] = useState(null); // "photo" | null
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  const [selectedId, setSelectedId] = useState(null);
  const [editingSectionIdx, setEditingSectionIdx] = useState(null); // drill-down into door/drawer
  const [selectedGapItem, setSelectedGapItem] = useState(null);
  const [renderCtxMenu, setRenderCtxMenu] = useState(null); // { x, y, id, row }
  const [pendingDelete, setPendingDelete] = useState(null); // cabinet id to confirm delete
  const [isDragging, setIsDragging] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [exampleHover, setExampleHover] = useState(false);
  const [shopProfile, setShopProfileState] = useState(loadShopProfile);
  const [showShopProfile, setShowShopProfile] = useState(false);
  const [showFirstRunBanner, setShowFirstRunBanner] = useState(false);
  const [projectOverride, setProjectOverride] = useState(false); // per-project override toggle
  const handleShopProfileChange = (p) => {
    if (projectOverride) {
      // Save override to spec
      dispatch({ type: "SET_SHOP_OVERRIDE", override: p });
    } else {
      setShopProfileState(p); saveShopProfile(p);
    }
  };
  // Effective profile: per-project override > global shop profile
  const effectiveProfile = spec?.shop_profile_override
    ? { ...shopProfile, ...spec.shop_profile_override }
    : shopProfile;
  // Detect first-run when switching to cutlist tab
  useEffect(() => {
    if (tab === "cutlist" && !isShopProfileConfigured()) setShowFirstRunBanner(true);
  }, [tab]);
  // Sync projectOverride flag from spec
  useEffect(() => { setProjectOverride(!!spec?.shop_profile_override); }, [spec?.shop_profile_override]);
  const wallLengthKey = `wallLength_${projectId}_${roomId}`;
  const [wallLength, setWallLengthState] = useState(() => { const s = localStorage.getItem(wallLengthKey); return s ? parseFloat(s) : null; });
  const setWallLength = (v) => { setWallLengthState(v); if (v) localStorage.setItem(wallLengthKey, v); else localStorage.removeItem(wallLengthKey); };

  // Ref to the width input in the bottom bar — passed to GridEditor for double-click focus
  const widthInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Auto-save (when inside a project/room context) ──
  // ── Auto-save — uses refs to avoid re-render cascades ──
  const specVersionRef = useRef(0);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const saveTimer = useRef(null);
  const pendingSave = useRef(false);
  const lastSaveTime = useRef(Date.now());
  const specRef = useRef(spec);
  const modeRef = useRef(mode);
  specRef.current = spec;
  modeRef.current = mode;

  // Load spec from DB when a roomId is provided
  useEffect(() => {
    if (!roomId) return;
    (async () => {
      try {
        const r = await api.getRoom(roomId);
        if (r.spec) {
          r.spec.cabinets?.forEach(c => {
            if (!c.depth) c.depth = c.row === "wall" ? 12 : 24;
            if (!c.height) c.height = c.row === "wall" ? 30 : 34.5;
            if (!c.width) c.width = 24;
          });
          dispatch({ type: "LOAD_SPEC", spec: r.spec });
          setMode("loaded"); setTab("render");
        }
        specVersionRef.current = r.spec_version || 0;
        if (r.photo_url) setPhotoPreview(api.imageUrl(r.photo_url));
        if (r.wireframe_url) setWireframePreview(api.imageUrl(r.wireframe_url));
      } catch (e) { console.error("Failed to load room:", e); }
    })();
  }, [roomId]);

  // Coalesced save — prevents save storms during rapid edits.
  // If no save in-flight: debounce 1s then fire.
  // If save in-flight: stash latest state, fire trailing save on completion.
  const saveInFlight = useRef(false);
  const stashedSave = useRef(false);

  const doSave = useCallback(async () => {
    if (!roomId || modeRef.current !== "loaded") return;
    if (saveInFlight.current) {
      // A save is already running — stash this request for a trailing save
      stashedSave.current = true;
      return;
    }
    pendingSave.current = false;
    saveInFlight.current = true;
    setSaveState("saving");
    try {
      const result = await api.saveRoomSpec(roomId, specRef.current, specVersionRef.current);
      specVersionRef.current = result.version;
      setSaveState("saved");
      lastSaveTime.current = Date.now();
      try { localStorage.setItem(`room_spec_${roomId}`, JSON.stringify({ spec: specRef.current, version: result.version, ts: Date.now() })); } catch {}
      setTimeout(() => setSaveState("idle"), 3000);
    } catch (e) {
      setSaveState("error");
      console.error("Auto-save failed:", e);
    } finally {
      saveInFlight.current = false;
      // If edits arrived while saving, fire one trailing save with the latest state
      if (stashedSave.current) {
        stashedSave.current = false;
        doSave();
      }
    }
  }, [roomId]); // only depends on roomId — stable across spec changes

  // Watch spec changes — just set a debounce timer, no re-render
  useEffect(() => {
    if (!roomId || mode !== "loaded") return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => doSave(), 1000);
    pendingSave.current = true;
    return () => clearTimeout(saveTimer.current);
  }, [spec, roomId, mode, doSave]);

  // Flush save on unmount (room switch / navigate away)
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      if (pendingSave.current && roomId) {
        api.beaconSaveSpec(roomId, specRef.current, specVersionRef.current);
      }
    };
  }, [roomId]);

  // Ctrl+S force save
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (roomId && modeRef.current === "loaded") doSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [doSave, roomId]);

  // Global keyboard handler for Render tab — arrow keys to nudge/reorder cabinets
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (tab !== "render") return;
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "SELECT" || document.activeElement?.tagName === "TEXTAREA") return;
      if ((e.metaKey||e.ctrlKey) && e.key === "z") { e.preventDefault(); if(e.shiftKey) redo(); else undo(); return; }
      if (!selectedId) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) dispatch({ type: "MOVE_CABINET", id: selectedId, direction: "left" });
        else dispatch({ type: "NUDGE_CABINET", id: selectedId, amount: e.shiftKey ? -0.5 : -1 });
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) dispatch({ type: "MOVE_CABINET", id: selectedId, direction: "right" });
        else dispatch({ type: "NUDGE_CABINET", id: selectedId, amount: e.shiftKey ? 0.5 : 1 });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const cabMap2 = {}; (spec.cabinets || []).forEach(c => { cabMap2[c.id] = c; });
        if (cabMap2[selectedId]?.row === "wall") {
          dispatch({ type: "NUDGE_VERTICAL", id: selectedId, amount: e.shiftKey ? -0.5 : -1 });
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const cabMap2 = {}; (spec.cabinets || []).forEach(c => { cabMap2[c.id] = c; });
        if (cabMap2[selectedId]?.row === "wall") {
          dispatch({ type: "NUDGE_VERTICAL", id: selectedId, amount: e.shiftKey ? 0.5 : 1 });
        }
        return;
      }
      if (e.key === "Escape") { setSelectedId(null); setSelectedGapItem(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        setPendingDelete(selectedId); return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const allItems = [...(spec.base_layout || []), ...(spec.wall_layout || [])].filter(i => i.ref);
        const idx = allItems.findIndex(i => i.ref === selectedId);
        if (idx !== -1) {
          const next = e.shiftKey
            ? allItems[(idx - 1 + allItems.length) % allItems.length]
            : allItems[(idx + 1) % allItems.length];
          if (next) {
            setSelectedId(next.ref);
            setTimeout(() => { if (widthInputRef.current) { widthInputRef.current.focus(); widthInputRef.current.select(); } }, 50);
          }
        }
        return;
      }
      if ((e.key === "d" || e.key === "D") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const cabMap2 = {}; (spec.cabinets || []).forEach(c => { cabMap2[c.id] = c; });
        const sel2 = cabMap2[selectedId]; if (!sel2) return;
        const newId = generateId(sel2.row, spec);
        dispatch({ type: "DUPLICATE_CABINET", id: selectedId, newId });
        setSelectedId(newId);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [tab, selectedId, spec, dispatch, undo, redo]);

  const loadWireframe = () => { dispatch({ type: "LOAD_SPEC", spec: JSON.parse(JSON.stringify(WIREFRAME_SPEC)) }); setMode("loaded"); setTab("render"); };

  const loadJSON = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (!parsed.cabinets?.length) throw new Error("No cabinets array found");
      parsed.cabinets.forEach(c => { if(!c.depth) c.depth = c.row==="wall"?12:24; if(!c.height) c.height = c.row==="wall"?30:34.5; if(!c.width) c.width=24; });
      dispatch({ type: "LOAD_SPEC", spec: parsed });
      setMode("loaded");
      setTab("render");
      setJsonError(null);
    } catch(e) { setJsonError(String(e.message)); }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target?.files?.[0] || e;
    if (!file || !(file instanceof File)) return;
    setPhotoFile(file);
    setUploadStatus(""); // Clear any previous error

    // HEIC files can't be previewed natively in most browsers.
    // Detect by extension or MIME and use server-converted JPEG for preview.
    const isHeic = /\.hei[cf]$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";

    if (!isHeic) {
      setPhotoPreview(URL.createObjectURL(file));
    }

    if (roomId) {
      try {
        const result = await api.uploadImage(roomId, file, "photo");
        // Use the server-converted image for HEIC preview
        if (isHeic && result?.file_path) {
          const apiBase = window.location.hostname === "localhost" ? "http://localhost:8001" : "";
          setPhotoPreview(`${apiBase}/images/${result.file_path}`);
        }
      } catch (err) {
        console.error("Photo upload:", err);
      }
    } else if (isHeic) {
      // No room yet — show a placeholder; extraction will still work with the raw file
      setPhotoPreview(null);
      setUploadStatus("HEIC photo selected — preview available after extraction");
    }
  };

  const openCamera = async () => {
    // On mobile, use the native camera input directly — getUserMedia
    // often triggers video recording UI instead of photo capture
    if (isMobile) {
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }
      });
      setCameraStream(stream);
      setCameraOpen(true);
      // Attach stream to video element after render
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 50);
    } catch (err) {
      console.error("Camera access denied:", err);
      if (err.name === "NotAllowedError") {
        alert("Camera access blocked. Click the camera icon in your browser's address bar to allow access, then try again.");
      } else if (err.name === "NotFoundError") {
        alert("No camera found on this device. Use 'Choose File' instead.");
      } else {
        // Fallback to file picker with capture (works on mobile)
        cameraInputRef.current?.click();
      }
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `capture-${Date.now()}.jpg`, { type: "image/jpeg" });
      handlePhotoUpload(file);
      closeCamera();
    }, "image/jpeg", 0.92);
  };

  const closeCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => t.stop());
      setCameraStream(null);
    }
    setCameraOpen(false);
  };

  const handleExtract = () => {
    if (photoFile) {
      runExtraction(photoFile);
    } else if (roomId && photoPreview) {
      // Photo already on server — run server-side extraction directly
      runExtraction(null);
    }
  };

  const handleCardDrop = (which) => (e) => {
    e.preventDefault(); e.stopPropagation(); setDragTarget(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Accept image/* types and also HEIC files (which may report empty type on some browsers)
    const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|hei[cf])$/i.test(file.name);
    if (!isImage) return;
    if (which === "photo") handlePhotoUpload(file);
  };

  const handleCardDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleCardDragEnter = (which) => (e) => { e.preventDefault(); e.stopPropagation(); setDragTarget(which); };
  const handleCardDragLeave = (which) => (e) => { e.preventDefault(); e.stopPropagation(); if (dragTarget === which) setDragTarget(null); };

  const runExtraction = async (photo) => {
    if (!photo && !roomId) return;
    setUploading(true);
    setUploadStatus("Starting extraction...");
    setJsonError(null);
    setExtractionError(null);
    try {
      let extracted;
      if (roomId) {
        // Upload photo if needed
        if (photo && (!photoPreview || photoPreview.startsWith("blob:"))) {
          setUploadStatus("Uploading photo...");
          await api.uploadImage(roomId, photo, "photo");
        }
        // Start background extraction — returns task_id immediately
        const { task_id } = await api.startExtraction(roomId);
        // Poll for progress
        extracted = await _pollTask(task_id);
      } else {
        // Legacy: no room context (blocking call)
        setUploadStatus("Generating wireframe & extracting cabinets...");
        const formData = new FormData();
        formData.append("photo", photo);
        const apiBase = window.location.hostname === "localhost" ? "http://localhost:8001" : "";
        const resp = await fetch(`${apiBase}/api/extract`, { method: "POST", body: formData });
        if (!resp.ok) {
          let detail = "";
          try { const j = await resp.json(); detail = j.detail || JSON.stringify(j); } catch { detail = await resp.text(); }
          throw new Error(detail || `Server error ${resp.status}`);
        }
        extracted = await resp.json();
      }
      setUploadStatus(`Extracted ${extracted.cabinets?.length || 0} cabinets`);
      if (extracted._spec_version != null) {
        specVersionRef.current = extracted._spec_version;
        delete extracted._spec_version;
      }
      delete extracted._pipeline;
      extracted.cabinets?.forEach(c => { if(!c.depth) c.depth = c.row==="wall"?12:24; if(!c.height) c.height = c.row==="wall"?30:34.5; if(!c.width) c.width=24; });
      dispatch({ type: "LOAD_SPEC", spec: extracted });
      setMode("loaded"); setTab("render");
    } catch(err) { setExtractionError(err.message); setUploadStatus(""); }
    finally { setUploading(false); }
  };

  const _pollTask = async (taskId) => {
    const POLL_MS = 1500;
    const MAX_POLLS = 300; // 7.5 min max
    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise(r => setTimeout(r, POLL_MS));
      const task = await api.getTaskStatus(taskId);
      // Update progress message for the user
      setUploadStatus(task.progress || "Processing...");
      if (task.status === "done") return task.result;
      if (task.status === "failed") throw new Error(task.error || "Extraction failed");
    }
    throw new Error("Extraction timed out");
  };

  const reset = () => {
    dispatch({ type: "LOAD_SPEC", spec: { base_layout: [], wall_layout: [], alignment: [], cabinets: [] } });
    setMode("home"); setJsonInput(""); setJsonError(null); setWireframePreview(null); setPhotoFile(null); setPhotoPreview(null); setUploadStatus(""); setDragTarget(null);
    setSelectedId(null); setSelectedGapItem(null);
  };

  const handleSelect = (id) => {
    setSelectedId(id);
    setEditingSectionIdx(null);
    if (id) setSelectedGapItem(null);
  };

  const handleGapSelect = (item) => {
    setSelectedGapItem(item);
    if (item) setSelectedId(null);
  };

  const hasSpec = mode === "loaded" && spec;

  // Count cabinets (refs in layouts, not appliances)
  const cabCount = hasSpec
    ? [...(spec.base_layout||[]), ...(spec.wall_layout||[])].filter(i => i.ref).length
    : 0;

  return (
    <div style={{minHeight:"100vh",background:"#06060c",color:"#ddd",fontFamily:"'DM Sans',-apple-system,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        textarea{font-family:'JetBrains Mono',monospace}
        @media print {
          body{background:#fff !important;color:#000 !important}
          *{background:transparent !important;color:#000 !important;box-shadow:none !important}
          [data-noprint]{display:none !important}
          [data-printable]{overflow:visible !important;height:auto !important;position:static !important;max-height:none !important}
          [data-printonly]{display:block !important}
          table{border-collapse:collapse !important}
          td,th{border-bottom:1px solid #ccc !important;padding:4px 6px !important;color:#000 !important}
          th{border-bottom:2px solid #999 !important}
          svg{max-width:100% !important}
          .cat-dot{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        }
      `}</style>

      <div data-noprint style={{padding:"16px 20px 12px",borderBottom:"1px solid #1a1a2a",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span onClick={onBack} style={{color:"#666",fontSize:12,cursor:"pointer"}}
            onMouseEnter={e=>e.target.style.color="#ddd"} onMouseLeave={e=>e.target.style.color="#666"}>← {projectName || "Project"}</span>
          <span style={{width:1,height:16,background:"#1a1a2a"}}/>
          {roomName && <span style={{fontSize:13,color:"#888",fontWeight:500}}>{roomName}</span>}
          {roomName && <span style={{color:"#333",fontSize:11}}>›</span>}
          <h1 style={{fontSize:16,fontWeight:700,margin:0,letterSpacing:"-0.02em",color:"#eee"}}>{wallName || "Wall"}</h1>
          {saveState === "saving" && <span style={{fontSize:10,color:"#888",fontFamily:"'JetBrains Mono',monospace"}}>Saving...</span>}
          {saveState === "saved" && <span style={{fontSize:10,color:"#22c55e",opacity:0.6,fontFamily:"'JetBrains Mono',monospace"}}>✓ Saved</span>}
          {saveState === "error" && <span style={{fontSize:10,color:"#e04040",fontFamily:"'JetBrains Mono',monospace"}}>Save failed</span>}
        </div>
        {hasSpec && (
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            {[["render","3D View"],["doors","Door Schedule"],["cutlist","Cut List"]].map(([key,label])=>(
              <button key={key} onClick={()=>{setTab(key);setShowMoreMenu(false);}} style={{
                background:tab===key?"#1a1a2a":"transparent",color:tab===key?"#fff":"#555",
                border:`1px solid ${tab===key?"#2a2a3a":"transparent"}`,
                padding:"4px 10px",borderRadius:5,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"
              }}>{label}</button>
            ))}
            {/* Photo toggle — only on render tab */}
            {tab === "render" && photoPreview && (
              <button onClick={()=>setShowPhotoSidebar(!showPhotoSidebar)} style={{
                background:showPhotoSidebar?"#1a1a2a":"transparent",color:showPhotoSidebar?"#fff":"#555",
                border:`1px solid ${showPhotoSidebar?"#2a2a3a":"transparent"}`,
                padding:"4px 10px",borderRadius:5,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"
              }}>Photo</button>
            )}
            {/* Shop Profile — visually distinct from tabs */}
            <span style={{width:1,height:16,background:"#1a1a2a",margin:"0 2px"}}/>
            <button onClick={()=>setShowShopProfile(true)} title="Shop Profile — material & construction defaults" style={{
              background:"#14141e",color:"#666",
              border:"1px solid #1a1a2a",
              padding:"4px 10px",borderRadius:5,fontSize:10,cursor:"pointer",fontFamily:"inherit",
              display:"flex",alignItems:"center",gap:4,
            }}
            onMouseEnter={e=>{e.currentTarget.style.color="#D94420";e.currentTarget.style.borderColor="#D94420";}}
            onMouseLeave={e=>{e.currentTarget.style.color="#666";e.currentTarget.style.borderColor="#1a1a2a";}}>⚙ Shop</button>
            {/* More menu */}
            <div style={{position:"relative"}}>
              <button onClick={()=>setShowMoreMenu(!showMoreMenu)} style={{
                background:showMoreMenu||tab!=="render"?"#1a1a2a":"transparent",
                color:showMoreMenu||tab!=="render"?"#fff":"#555",
                border:`1px solid ${showMoreMenu?"#2a2a3a":"transparent"}`,
                padding:"4px 8px",borderRadius:5,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",letterSpacing:1,
              }}>···</button>
              {showMoreMenu && (
                <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:"#14141e",border:"1px solid #2a2a3a",borderRadius:6,boxShadow:"0 4px 16px rgba(0,0,0,0.5)",zIndex:20,minWidth:120,overflow:"hidden"}}>
                  {[
                    ["json","JSON"],
                    ...(photoPreview?[["photo","Photo"]]:[]),
                    ...(wireframePreview?[["wireframe","Wireframe"]]:[]),
                  ].map(([key,label])=>(
                    <div key={key} onClick={()=>{setTab(key);setShowMoreMenu(false);}}
                      style={{padding:"8px 14px",fontSize:12,color:tab===key?"#fff":"#aaa",cursor:"pointer",background:tab===key?"#1a1a2a":"transparent"}}
                      onMouseEnter={e=>e.target.style.background="#1a1a2a"}
                      onMouseLeave={e=>{if(tab!==key)e.target.style.background="transparent";}}>
                      {label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div style={{padding:"14px 20px"}}>
        {mode === "home" && (
          <div style={{maxWidth:640,margin:"0 auto"}}>
            {/* Hero */}
            <div style={{textAlign:"center",paddingTop:40,paddingBottom:24}}>
              <div style={{fontSize:22,fontWeight:700,color:"#eee",letterSpacing:"-0.03em",marginBottom:6}}>New Extraction</div>
              <div style={{fontSize:13,color:"#555"}}>Upload a photo to extract cabinet specs</div>
            </div>

            {/* Step indicators */}
            <div style={{display:"flex",justifyContent:"center",gap:0,marginBottom:24,fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:22,height:22,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                  background:(photoPreview||photoFile)?"#22c55e":"#1a1a2a",color:(photoPreview||photoFile)?"#000":"#555",border:!(photoPreview||photoFile)?"1px solid #2a2a3a":"none"}}>
                  {(photoPreview||photoFile)?"✓":"1"}
                </span>
                <span style={{color:(photoPreview||photoFile)?"#22c55e":"#888",fontWeight:600}}>Photo</span>
              </div>
              <span style={{color:"#333",margin:"0 12px",alignSelf:"center"}}>→</span>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:22,height:22,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,
                  background:uploading?"#D94420":"#1a1a2a",color:uploading?"#fff":"#555",border:!uploading?"1px solid #2a2a3a":"none"}}>
                  2
                </span>
                <span style={{color:uploading?"#D94420":"#888",fontWeight:600}}>Extract</span>
              </div>
            </div>

            {/* Photo upload card */}
            <div style={{maxWidth:480,margin:"0 auto",marginBottom:16}}>
              <div
                onDragOver={handleCardDragOver} onDragEnter={handleCardDragEnter("photo")} onDragLeave={handleCardDragLeave("photo")} onDrop={handleCardDrop("photo")}
                style={{
                  minHeight:220,background:"#0c0c14",cursor:"pointer",
                  border:(photoPreview||photoFile)?"2px solid #22c55e":dragTarget==="photo"?"2px dashed #D94420":"2px dashed #2a2a3a",
                  borderRadius:12,padding:"20px 16px",textAlign:"center",
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  transition:"border-color 0.15s"
                }}
              >
                <input ref={cameraInputRef} type="file" accept="image/*,.heic,.heif" capture="environment" onChange={handlePhotoUpload} disabled={uploading} style={{display:"none"}} />
                <input ref={photoInputRef} type="file" accept="image/*,.heic,.heif" onChange={handlePhotoUpload} disabled={uploading} style={{display:"none"}} />

                {/* Live camera overlay */}
                {cameraOpen && (
                  <div style={{position:"fixed",inset:0,zIndex:9999,background:"#000",display:"flex",flexDirection:"column"}}>
                    <video ref={videoRef} autoPlay playsInline muted style={{flex:1,objectFit:"cover",width:"100%"}} />
                    <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"24px",display:"flex",justifyContent:"center",alignItems:"center",gap:24,background:"linear-gradient(transparent, rgba(0,0,0,0.8))"}}>
                      <button onClick={closeCamera}
                        style={{width:48,height:48,borderRadius:"50%",border:"2px solid #fff",background:"rgba(255,255,255,0.15)",color:"#fff",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                      </button>
                      <button onClick={capturePhoto}
                        style={{width:72,height:72,borderRadius:"50%",border:"4px solid #fff",background:"#D94420",cursor:"pointer",boxShadow:"0 4px 20px rgba(217,68,32,0.5)"}}>
                      </button>
                      <div style={{width:48,height:48}} /> {/* spacer for centering */}
                    </div>
                  </div>
                )}

                {(photoPreview || photoFile) ? (
                  <>
                    {photoPreview && <img src={photoPreview} style={{maxWidth:"100%",maxHeight:180,borderRadius:8,border:"1px solid #2a2a3a",objectFit:"cover",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}} />}
                    {!photoPreview && photoFile && <div style={{fontSize:24,marginBottom:8}}>📷</div>}
                    <div style={{marginTop:8,fontSize:11,color:"#22c55e",fontWeight:600}}>✓ Photo ready</div>
                    <div onClick={(e)=>{e.stopPropagation();setPhotoFile(null);setPhotoPreview(null);}} style={{marginTop:4,fontSize:10,color:"#666",textDecoration:"underline",cursor:"pointer"}}>Change</div>
                  </>
                ) : (
                  <>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{marginBottom:10,opacity:0.5}}>
                      <rect x="3" y="3" width="18" height="18" rx="3" stroke={dragTarget==="photo"?"#D94420":"#666"} strokeWidth="1.5"/>
                      <circle cx="8.5" cy="8.5" r="2" stroke={dragTarget==="photo"?"#D94420":"#666"} strokeWidth="1.5"/>
                      <path d="M3 16l5-5 4 4 3-3 6 6" stroke={dragTarget==="photo"?"#D94420":"#666"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div style={{display:"flex",gap:12,marginTop:4}}>
                      <button onClick={(e)=>{e.stopPropagation();openCamera();}} disabled={uploading}
                        style={{padding:"10px 20px",borderRadius:8,border:"none",background:"#D94420",color:"#fff",fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/></svg>
                        Take Photo
                      </button>
                      <button onClick={(e)=>{e.stopPropagation();photoInputRef.current?.click();}} disabled={uploading}
                        style={{padding:"10px 20px",borderRadius:8,border:"1px solid #333",background:"transparent",color:"#bbb",fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Choose File
                      </button>
                    </div>
                    <div style={{fontSize:10,color:"#444",marginTop:10}}>or drag &amp; drop a photo</div>
                  </>
                )}
              </div>
            </div>

            {/* Extract Button */}
            {uploading ? (
              <div style={{textAlign:"center",padding:"14px 0",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:"#D94420",animation:"pulse 1.5s infinite"}}>{uploadStatus}</div>
              </div>
            ) : (
              <button onClick={handleExtract} disabled={(!photoFile && !photoPreview) || uploading}
                style={{
                  width:"100%",padding:"14px 0",borderRadius:10,fontSize:14,fontWeight:700,cursor:(photoFile||photoPreview)?"pointer":"default",
                  fontFamily:"inherit",border:"none",marginBottom:16,transition:"all 0.15s",letterSpacing:"-0.01em",
                  background:(photoFile||photoPreview)?"#D94420":"#1a1a2a",
                  color:(photoFile||photoPreview)?"#fff":"#444",
                  opacity:(photoFile||photoPreview)?1:0.6
                }}>
                {(photoFile||photoPreview) ? "Extract Cabinets with AI" : "Upload a photo to continue"}
              </button>
            )}

            {/* Extraction Error Modal */}
            {extractionError && (
              <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}
                onClick={(e) => { if(e.target === e.currentTarget) setExtractionError(null); }}>
                <div style={{background:"#1a1a2a",border:"1px solid #333",borderRadius:12,padding:"28px 32px",maxWidth:420,width:"90%",textAlign:"center"}}>
                  <div style={{fontSize:28,marginBottom:12}}>!</div>
                  <div style={{fontSize:15,fontWeight:700,color:"#e04040",marginBottom:8}}>Extraction Failed</div>
                  <div style={{fontSize:13,color:"#aaa",marginBottom:20,lineHeight:1.5}}>{extractionError}</div>
                  <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                    <button onClick={() => setExtractionError(null)}
                      style={{padding:"10px 24px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
                        background:"transparent",color:"#888",border:"1px solid #333",fontFamily:"inherit"}}>
                      Close
                    </button>
                    <button onClick={() => { setExtractionError(null); handleExtract(); }}
                      style={{padding:"10px 24px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
                        background:"#D94420",color:"#fff",border:"none",fontFamily:"inherit"}}>
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Divider + secondary options */}
            <div style={{borderTop:"1px solid #1a1a2a",paddingTop:16,display:"flex",gap:10,alignItems:"center",marginBottom:16}}>
              <button onClick={loadWireframe} onMouseEnter={()=>setExampleHover(true)} onMouseLeave={()=>setExampleHover(false)} style={{
                background:"transparent",color:"#888",border:exampleHover?"1px solid #D94420":"1px solid #2a2a3a",
                padding:"8px 16px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"border-color 0.15s"
              }}>
                Try the Example
              </button>
              <span style={{fontSize:10,color:"#444",fontFamily:"'JetBrains Mono',monospace"}}>12 cabs · 2 rows · range opening</span>
              <span style={{flex:1}}/>
              <span onClick={()=>setJsonOpen(!jsonOpen)} style={{fontSize:11,color:"#555",cursor:"pointer",textDecoration:"underline"}}>
                {jsonOpen ? "Hide" : "Import"} JSON
              </span>
            </div>

            {/* JSON Accordion */}
            {jsonOpen && (
              <div style={{paddingBottom:16}}>
                <textarea
                  value={jsonInput}
                  onChange={e=>setJsonInput(e.target.value)}
                  placeholder='{"base_layout":[...],"wall_layout":[...],"alignment":[...],"cabinets":[...]}'
                  style={{width:"100%",height:100,background:"#0a0a14",border:"1px solid #1a1a2a",borderRadius:8,
                    color:"#aaa",padding:10,fontSize:11,resize:"vertical",fontFamily:"'JetBrains Mono',monospace"}}
                />
                <button onClick={loadJSON} disabled={!jsonInput.trim()} style={{
                  marginTop:8,background:jsonInput.trim()?"#1a6fbf":"#1a1a2a",color:"#fff",border:"none",
                  padding:"8px 16px",borderRadius:6,fontSize:12,fontWeight:600,cursor:jsonInput.trim()?"pointer":"default",fontFamily:"inherit"
                }}>
                  Load JSON
                </button>
                {jsonError && <div style={{marginTop:6,fontSize:11,color:"#e04040"}}>{jsonError}</div>}
              </div>
            )}
          </div>
        )}

        {hasSpec && tab === "render" && (() => {
          const cabMap = {};
          (spec.cabinets || []).forEach(c => { cabMap[c.id] = c; });
          const sel = selectedId ? cabMap[selectedId] : null;
          const selColor = sel?.row === "wall" ? "#1a6fbf" : "#D94420";
          const baseRun = (spec.base_layout||[]).reduce((s,i)=>s+(i.ref?cabMap[i.ref]?.width||0:i.width||0),0);
          const wallRun = (spec.wall_layout||[]).reduce((s,i)=>s+(i.ref?cabMap[i.ref]?.width||0:i.width||0),0);

          return (
            <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 50px)",margin:"-14px -20px 0",padding:0}}>
              {/* Toolbar */}
              <div data-noprint style={{display:"flex",alignItems:"center",gap:isMobile?4:6,padding:isMobile?"4px 6px":"5px 10px",background:"#06060c",borderBottom:"1px solid #1a1a2a",flexShrink:0,fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
                <button onClick={undo} disabled={!canUndo} title={undoLabel ? `Undo: ${undoLabel}` : undefined} style={{background:canUndo?"#1a1a2a":"transparent",border:"1px solid #2a2a3a",color:canUndo?"#e0e0e0":"#333",padding:isMobile?"6px 8px":"4px 10px",borderRadius:4,fontSize:isMobile?14:11,cursor:canUndo?"pointer":"default",fontWeight:600,minHeight:isMobile?36:undefined}}>{isMobile?"↩":"Undo"}</button>
                <button onClick={redo} disabled={!canRedo} title={redoLabel ? `Redo: ${redoLabel}` : undefined} style={{background:canRedo?"#1a1a2a":"transparent",border:"1px solid #2a2a3a",color:canRedo?"#e0e0e0":"#333",padding:isMobile?"6px 8px":"4px 10px",borderRadius:4,fontSize:isMobile?14:11,cursor:canRedo?"pointer":"default",fontWeight:600,minHeight:isMobile?36:undefined}}>{isMobile?"↪":"Redo"}</button>
                {/* Frame style toggle */}
                {(()=>{const fs=spec.frame_style||"framed";const pill=(val,label)=>(<button key={val} onClick={()=>dispatch({type:"SET_FRAME_STYLE",value:val})} style={{padding:isMobile?"4px 8px":"3px 8px",borderRadius:10,fontSize:isMobile?10:9,fontWeight:600,cursor:"pointer",border:"none",background:fs===val?"rgba(34,197,94,0.2)":"transparent",color:fs===val?"#22c55e":"#555",fontFamily:"'JetBrains Mono',monospace",minHeight:isMobile?32:undefined}}>{label}</button>);return <div style={{display:"flex",gap:2,background:"#0a0a14",borderRadius:12,padding:"1px 2px",border:"1px solid #1a1a2a"}}>{pill("framed","Framed")}{pill("frameless","Frameless")}</div>;})()}
                <span style={{flex:1}}/>
                <span style={{color:"#555"}}>{cabCount}c</span>
                <span style={{color:"#D94420",fontWeight:600}}>B:{baseRun}"</span>
                <span style={{color:"#1a6fbf",fontWeight:600}}>W:{wallRun}"</span>
                {!isMobile && <>
                  <span style={{color:"#222"}}>|</span>
                  <span style={{color:"#666",fontSize:10}}>wall</span>
                  <input type="number" defaultValue={wallLength||""} placeholder="—"
                    onBlur={e=>{const v=parseFloat(e.target.value);setWallLength(isNaN(v)||v<=0?null:v);}}
                    onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}}
                    style={{width:42,height:24,background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:4,color:"#ccc",textAlign:"center",fontSize:12,fontFamily:"'JetBrains Mono',monospace",fontWeight:600}}
                  />
                  {wallLength && (()=>{const maxRun=Math.max(baseRun,wallRun);const filler=wallLength-maxRun;return <span style={{color:filler<0?"#e04040":filler>6?"#e0a020":"#22c55e",fontWeight:700,fontSize:11,padding:"2px 6px",background:filler<0?"rgba(224,64,64,0.1)":"rgba(34,197,94,0.1)",borderRadius:3}}>{filler>=0?`+${filler}" filler`:`${filler}" over!`}</span>;})()}
                  <span style={{color:"#222"}}>|</span>
                  <button onClick={()=>window.print()} style={{height:24,padding:"0 10px",borderRadius:4,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#888",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Print</button>
                </>}
              </div>

              {/* Render + optional Photo sidebar */}
              <div style={{display:"flex",flex:"1 1 auto",overflow:"hidden"}}>
              {/* Interactive 3D Render */}
              <div data-printable style={{flex:"1 1 auto",overflow:"auto",background:"#fff",position:"relative",display:"flex",flexDirection:"column",justifyContent:"center",minHeight:0}} onClick={()=>{setRenderCtxMenu(null);setShowMoreMenu(false);}}>
                {/* Print-only header — hidden on screen, visible when printing */}
                <div data-printonly style={{display:"none",padding:"12px 16px 8px",borderBottom:"2px solid #333",marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                    <span style={{fontSize:18,fontWeight:700,fontFamily:"monospace",color:"#111"}}>{projectName}</span>
                    <span style={{fontSize:11,fontFamily:"monospace",color:"#555"}}>{new Date().toLocaleDateString()}</span>
                  </div>
                  <div style={{fontSize:11,fontFamily:"monospace",color:"#444",marginTop:2}}>
                    {cabCount} cabinets · Base: {baseRun}" · Wall: {wallRun}"
                  </div>
                </div>
                {/* No overlapping thumbnails — photo is in sidebar, plan is a tab */}
                <InteractiveRender spec={spec} selectedId={selectedId} isMobile={isMobile} onSelect={(id)=>{handleSelect(id);setRenderCtxMenu(null);}}
                  onDoubleClick={(id)=>{setSelectedId(id);setTimeout(()=>{if(widthInputRef.current){widthInputRef.current.focus();widthInputRef.current.select();}},50);}}
                  onContextMenu={(ctx)=>setRenderCtxMenu(ctx)}
                  onGapSelect={(item)=>{
                    setSelectedId(null);setRenderCtxMenu(null);
                    // Enrich with rowName/idx like Plan tab does
                    const bIdx=(spec.base_layout||[]).indexOf(item);
                    const wIdx=bIdx===-1?(spec.wall_layout||[]).indexOf(item):-1;
                    const rowName=bIdx!==-1?"base":"wall";
                    const idx=bIdx!==-1?bIdx:wIdx;
                    setSelectedGapItem({...item, entry:item, rowName, idx, w:item.width||0});
                  }}
                  onNudge={(id,amount)=>dispatch({type:"NUDGE_CABINET",id,amount})}
                  onNudgeVertical={(id,amount)=>dispatch({type:"NUDGE_VERTICAL",id,amount})}
                />
                {/* Context menu */}
                {renderCtxMenu && (()=>{
                  const cabMap2={}; (spec.cabinets||[]).forEach(c=>{cabMap2[c.id]=c;});
                  const ctxCab=cabMap2[renderCtxMenu.id];
                  if(!ctxCab) return null;
                  const items=[
                    {label:"Duplicate (⌘D)",action:()=>{const newId=generateId(ctxCab.row,spec);dispatch({type:"DUPLICATE_CABINET",id:renderCtxMenu.id,newId});setSelectedId(newId);setRenderCtxMenu(null);}},
                    {label:"Set Width…",action:()=>{setSelectedId(renderCtxMenu.id);setRenderCtxMenu(null);setTimeout(()=>{if(widthInputRef.current){widthInputRef.current.focus();widthInputRef.current.select();}},50);}},
                    {label:"+ Space Left",action:()=>{const layout=spec[ctxCab.row==="base"?"base_layout":"wall_layout"]||[];const pos=layout.findIndex(i=>i.ref===renderCtxMenu.id);dispatch({type:"ADD_GAP",row:ctxCab.row,position:Math.max(pos,0),gap:{type:"filler",label:"Filler",width:3}});setRenderCtxMenu(null);}},
                    {label:"+ Space Right",action:()=>{const layout=spec[ctxCab.row==="base"?"base_layout":"wall_layout"]||[];const pos=layout.findIndex(i=>i.ref===renderCtxMenu.id);dispatch({type:"ADD_GAP",row:ctxCab.row,position:pos+1,gap:{type:"filler",label:"Filler",width:3}});setRenderCtxMenu(null);}},
                    {label:"Delete",action:()=>{setPendingDelete(renderCtxMenu.id);setRenderCtxMenu(null);},color:"#e04040"},
                  ];
                  return <div style={{position:"fixed",left:renderCtxMenu.x,top:renderCtxMenu.y,background:"#1a1a2a",border:"1px solid #2a2a3a",borderRadius:8,padding:4,zIndex:9999,minWidth:160,boxShadow:"0 8px 24px rgba(0,0,0,0.5)"}}
                    onClick={e=>e.stopPropagation()}>
                    {items.map((it,i)=><div key={i} onClick={it.action}
                      style={{padding:"6px 12px",fontSize:12,color:it.color||"#ddd",cursor:"pointer",borderRadius:4,fontFamily:"'DM Sans',sans-serif"}}
                      onMouseEnter={e=>e.target.style.background="#2a2a3a"} onMouseLeave={e=>e.target.style.background="transparent"}>
                      {it.label}
                    </div>)}
                  </div>;
                })()}
              </div>

              {/* Photo reference sidebar */}
              {showPhotoSidebar && photoPreview && !isMobile && (
                <div style={{
                  flex:"0 0 280px",background:"#08080e",borderLeft:"1px solid #1a1a2a",
                  display:"flex",flexDirection:"column",overflow:"hidden",
                }}>
                  <div style={{display:"flex",alignItems:"center",padding:"8px 12px",borderBottom:"1px solid #1a1a2a",flexShrink:0}}>
                    <span style={{fontSize:11,fontWeight:600,color:"#888"}}>Reference Photo</span>
                    <span style={{flex:1}}/>
                    <button onClick={()=>setShowPhotoSidebar(false)} style={{
                      width:22,height:22,borderRadius:4,fontSize:14,
                      background:"transparent",border:"1px solid #2a2a3a",
                      color:"#555",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                    }}>×</button>
                  </div>
                  <div style={{flex:1,overflow:"auto",padding:8}}>
                    <img src={photoPreview} alt="Reference" style={{width:"100%",borderRadius:6,display:"block"}}/>
                  </div>
                </div>
              )}
              </div>{/* end split wrapper */}

              {/* Bottom bar — cabinet selected */}
              {sel && !selectedGapItem && editingSectionIdx !== null && (
                <DoorDetailView
                  cab={sel} spec={spec} sectionIndex={editingSectionIdx} dispatch={dispatch}
                  onBack={() => setEditingSectionIdx(null)}
                  onPrev={() => setEditingSectionIdx(Math.max(0, editingSectionIdx - 1))}
                  onNext={() => setEditingSectionIdx(Math.min((sel.face?.sections?.length || 1) - 1, editingSectionIdx + 1))}
                  totalSections={sel.face?.sections?.length || 0}
                />
              )}
              {sel && !selectedGapItem && editingSectionIdx === null && (
                isMobile ? (
                  <div style={{maxHeight:isLandscape?"40vh":"50vh",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
                    <BottomSheet spec={spec} selectedId={selectedId} dispatch={dispatch} onSelect={handleSelect} onSectionClick={(idx) => setEditingSectionIdx(idx)} />
                  </div>
                ) : (
                  <CabinetEditBar
                    cab={sel} spec={spec} dispatch={dispatch} selColor={selColor}
                    widthInputRef={widthInputRef}
                    onSelectNext={() => {
                      const allRefs=[...(spec.base_layout||[]),...(spec.wall_layout||[])].filter(i=>i.ref);
                      const idx=allRefs.findIndex(i=>i.ref===sel.id);
                      if(idx!==-1&&idx<allRefs.length-1){setSelectedId(allRefs[idx+1].ref);setTimeout(()=>{if(widthInputRef.current){widthInputRef.current.focus();widthInputRef.current.select();}},50);}
                    }}
                    onSelectId={setSelectedId}
                    onMoveLeft={() => dispatch({ type: "NUDGE_CABINET", id: sel.id, amount: -3 })}
                    onMoveRight={() => dispatch({ type: "NUDGE_CABINET", id: sel.id, amount: 3 })}
                    onMoveUp={sel.row === "wall" ? () => dispatch({ type: "NUDGE_VERTICAL", id: sel.id, amount: -3 }) : undefined}
                    onMoveDown={sel.row === "wall" ? () => dispatch({ type: "NUDGE_VERTICAL", id: sel.id, amount: 3 }) : undefined}
                    onDelete={() => setPendingDelete(sel.id)}
                    onAddGap={() => {
                      const layout=spec[sel.row==="base"?"base_layout":"wall_layout"]||[];
                      const pos=layout.findIndex(i=>i.ref===sel.id);
                      dispatch({type:"ADD_GAP",row:sel.row,position:Math.max(pos,0),gap:{type:"filler",label:"Filler",width:3}});
                    }}
                    onAddCab={() => {
                      const id=generateId(sel.row,spec),cab=defaultCabinet(sel.row);cab.id=id;
                      const layout=spec[sel.row==="base"?"base_layout":"wall_layout"]||[];
                      const pos=layout.findIndex(i=>i.ref===sel.id);
                      dispatch({type:"ADD_CABINET",row:sel.row,position:pos+1,cabinet:cab});setSelectedId(id);
                    }}
                    onSectionClick={(idx) => setEditingSectionIdx(idx)}
                  />
                )
              )}

              {/* Bottom bar — gap selected */}
              {!sel && selectedGapItem && (
                <div key={`gap-${selectedGapItem.rowName}-${selectedGapItem.idx}`} style={{flexShrink:0,background:"#0c0c14",borderTop:"1px solid #1a1a2a",padding:"8px 10px",display:"flex",alignItems:"center",gap:8,fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>
                  <span style={{color:"#555"}}>name</span>
                  <input type="text"
                    defaultValue={selectedGapItem.entry?.label||""}
                    placeholder="Opening"
                    onBlur={e=>{const v=e.target.value.trim();dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{label:v}});}}
                    onKeyDown={e=>{if(e.key==="Enter")e.target.blur();}}
                    style={{width:90,height:28,background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:4,color:"#fff",textAlign:"center",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}
                  />
                  <span style={{color:"#555"}}>width</span>
                  <input type="number"
                    defaultValue={selectedGapItem.w||0}
                    onKeyDown={e=>{if(e.key==="Enter"){const v=parseFloat(e.target.value);if(!isNaN(v)&&v>0){dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{width:v}});e.target.blur();}}}}
                    onBlur={e=>{const v=parseFloat(e.target.value);if(!isNaN(v)&&v>0)dispatch({type:"UPDATE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx,updates:{width:v}});}}
                    style={{width:50,height:28,background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:4,color:"#fff",textAlign:"center",fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}
                  />"
                  <span style={{flex:1}}/>
                  <button onClick={()=>{dispatch({type:"DELETE_GAP",row:selectedGapItem.rowName,position:selectedGapItem.idx});setSelectedGapItem(null);}} style={{height:28,padding:"0 10px",borderRadius:4,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#e04040",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Del</button>
                  <button onClick={()=>setSelectedGapItem(null)} style={{height:28,padding:"0 10px",borderRadius:4,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#888",fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Done</button>
                </div>
              )}

              {/* Bottom bar — nothing selected */}
              {!sel && !selectedGapItem && (
                <div data-noprint style={{flexShrink:0,background:"#0c0c14",borderTop:"1px solid #1a1a2a",padding:isMobile?"8px 8px":"8px 10px",display:"flex",alignItems:"center",gap:8,flexWrap:isMobile?"wrap":"nowrap"}}>
                  <span style={{color:"#444",fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>
                    {isMobile ? "Tap a cabinet to edit" : <>Click a cabinet to edit. <span style={{color:"#333"}}>Tab: next · ⌘D: duplicate · Delete: remove · Right-click: more</span></>}
                  </span>
                  <span style={{flex:1}}/>
                  <button onClick={()=>{
                    const id=generateId("base",spec),cab=defaultCabinet("base");cab.id=id;
                    dispatch({type:"ADD_CABINET",row:"base",position:(spec.base_layout||[]).length,cabinet:cab});setSelectedId(id);
                  }} style={{height:isMobile?40:32,padding:"0 10px",borderRadius:6,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#D94420",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>+ Base</button>
                  <button onClick={()=>{
                    const id=generateId("wall",spec),cab=defaultCabinet("wall");cab.id=id;
                    dispatch({type:"ADD_CABINET",row:"wall",position:(spec.wall_layout||[]).length,cabinet:cab});setSelectedId(id);
                  }} style={{height:isMobile?40:32,padding:"0 10px",borderRadius:6,background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#1a6fbf",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>+ Wall</button>
                  {!isMobile && <button onClick={reset} style={{height:32,padding:"0 10px",borderRadius:6,background:"transparent",border:"1px solid #2a2a3a",color:"#555",fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"'DM Sans',sans-serif"}}>Start Over</button>}
                </div>
              )}
            </div>
          );
        })()}

        {hasSpec && tab === "json" && (
          <JsonEditor spec={spec} dispatch={dispatch} />
        )}

        {hasSpec && tab === "photo" && photoPreview && (
          <div style={{display:"flex",justifyContent:"center",alignItems:"flex-start",maxHeight:"calc(100vh - 140px)",overflow:"auto"}}>
            <img src={photoPreview} alt="Original photo" style={{maxWidth:"100%",maxHeight:"calc(100vh - 160px)",borderRadius:8,objectFit:"contain"}}/>
          </div>
        )}

        {hasSpec && tab === "wireframe" && wireframePreview && (
          <div style={{display:"flex",justifyContent:"center",alignItems:"flex-start",maxHeight:"calc(100vh - 140px)",overflow:"auto"}}>
            <img src={wireframePreview} alt="Wireframe drawing" style={{maxWidth:"100%",maxHeight:"calc(100vh - 160px)",borderRadius:8,objectFit:"contain"}}/>
          </div>
        )}

        {/* Door Schedule Tab */}
        {hasSpec && tab === "doors" && (()=>{
          const fs = spec.frame_style || "framed";
          const allSections = [];
          const sizeCounts = {};
          (spec.cabinets || []).forEach(cab => {
            const sizes = calcDoorSizes(cab, fs);
            sizes.forEach(ds => {
              const scribeNote = calcScribeNotes(cab);
              allSections.push({ cab, ...ds, scribeNote });
              for (let c = 0; c < ds.count; c++) {
                const w = ds.count >= 2 && (ds.type === "door" || ds.type === "glass_door") ? ds.perDoorWidth : ds.width;
                const key = `${formatFraction(w)} x ${formatFraction(ds.height)}`;
                const label = ds.type === "drawer" ? "drawers" : ds.type === "false_front" ? "false fronts" : "doors";
                if (!sizeCounts[key]) sizeCounts[key] = { count: 0, label };
                sizeCounts[key].count += ds.count;
              }
            });
          });
          const rowColor = (type) => type === "door" || type === "glass_door" ? "#22c55e" : type === "drawer" ? "#f97216" : "#8b5cf6";
          return (
            <div style={{padding:isMobile?"10px":"14px 20px",maxHeight:"calc(100vh - 140px)",overflow:"auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <h2 style={{fontSize:16,fontWeight:700,color:"#eee",margin:0}}>Door Schedule</h2>
                <span style={{fontSize:11,color:"#555",fontFamily:"'JetBrains Mono',monospace"}}>{fs === "framed" ? "Framed" : "Frameless"}</span>
                <span style={{flex:1}}/>
                <button onClick={()=>{
                  const csv = ["Cabinet,Type,Component,Qty,Width,Height,Scribe"];
                  allSections.forEach(s => {
                    const w = s.count >= 2 && (s.type === "door" || s.type === "glass_door") ? s.perDoorWidth : s.width;
                    csv.push(`${s.cab.id},${s.cab.type},${s.type},${s.count},${w},${s.height},${s.scribeNote||""}`);
                  });
                  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                  a.download = `doors_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                }} style={{padding:"5px 10px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#888",fontFamily:"inherit"}}>Export CSV</button>
                <button onClick={()=>window.print()} style={{padding:"5px 10px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#888",fontFamily:"inherit"}}>Print</button>
              </div>

              {/* Detail table */}
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:"'JetBrains Mono',monospace"}}>
                <thead>
                  <tr style={{borderBottom:"2px solid #2a2a3a"}}>
                    {["Cab","Type","Component","Qty","Width","Height","Scribe",""].map(h=>(
                      <th key={h} style={{padding:"8px 6px",textAlign:"left",color:"#666",fontWeight:600,fontSize:10,letterSpacing:"0.05em"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSections.map((s, i) => {
                    const w = s.count >= 2 && (s.type === "door" || s.type === "glass_door") ? s.perDoorWidth : s.width;
                    return (
                      <tr key={i} style={{borderBottom:"1px solid #1a1a2a",cursor:"pointer"}}
                        onClick={()=>{setSelectedId(s.cab.id);setTab("render");}}
                        onMouseEnter={e=>e.currentTarget.style.background="#0a0a14"}
                        onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"6px",color:s.cab.row==="base"?"#D94420":"#1a6fbf",fontWeight:700}}>{s.cab.id}</td>
                        <td style={{padding:"6px",color:"#666"}}>{s.cab.type}</td>
                        <td style={{padding:"6px",color:rowColor(s.type),fontWeight:600}}>
                          {s.type === "door" ? "Door" : s.type === "glass_door" ? "Glass" : s.type === "drawer" ? "Drawer" : "False Front"}
                        </td>
                        <td style={{padding:"6px",color:"#aaa"}}>{s.count}</td>
                        <td style={{padding:"6px",color:"#eee",fontWeight:600}}>{formatFraction(w)}"</td>
                        <td style={{padding:"6px",color:"#eee",fontWeight:600}}>{formatFraction(s.height)}"</td>
                        <td style={{padding:"6px",color:s.scribeNote?"#eab308":"#555"}}>{s.scribeNote||"None"}</td>
                        <td style={{padding:"6px"}}>
                          {s.isOverride && <span style={{color:"#8b5cf6",fontSize:9,padding:"2px 6px",background:"rgba(139,92,246,0.1)",borderRadius:3}}>override</span>}
                          {s.needsVerify && <span style={{color:"#eab308",fontSize:9,padding:"2px 6px",background:"rgba(234,179,8,0.1)",borderRadius:3}}>verify</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Cut list summary */}
              <div style={{marginTop:24,padding:"14px 16px",background:"#0a0a14",borderRadius:8,border:"1px solid #1a1a2a"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#888",marginBottom:10,letterSpacing:"0.05em"}}>CUT LIST SUMMARY</div>
                {Object.entries(sizeCounts).map(([size, {count, label}]) => (
                  <div key={size} style={{display:"flex",gap:10,padding:"4px 0",fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}>
                    <span style={{color:"#D94420",fontWeight:700,minWidth:30}}>{count}x</span>
                    <span style={{color:"#eee",fontWeight:600}}>{size}</span>
                    <span style={{color:"#555"}}>({label})</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ═══ Cut List Tab ═══ */}
        {hasSpec && tab === "cutlist" && (()=>{
          const fs = spec.frame_style || "framed";
          const allParts = calcProjectCutList(spec, effectiveProfile);
          // Group by material for nesting summary
          const byMaterial = {};
          allParts.forEach(p => {
            const key = p.material || "Unknown";
            if (!byMaterial[key]) byMaterial[key] = [];
            byMaterial[key].push(p);
          });
          // Total part count
          const totalParts = allParts.reduce((s, p) => s + p.qty, 0);
          const catColor = (c) => c === "front" ? "#22c55e" : c === "drawer_box" ? "#f97216" : "#1a6fbf";
          const catLabel = (c) => c === "front" ? "Front" : c === "drawer_box" ? "Drawer Box" : "Box";
          return (
            <div style={{padding:isMobile?"10px":"14px 20px",maxHeight:"calc(100vh - 140px)",overflow:"auto"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                <h2 style={{fontSize:isMobile?14:16,fontWeight:700,color:"#eee",margin:0}}>CNC Cut List</h2>
                <span style={{fontSize:10,color:"#555",fontFamily:"'JetBrains Mono',monospace"}}>{fs === "framed" ? "Framed" : "Frameless"} · {totalParts} parts · {(spec.cabinets||[]).length} cabinets</span>
                <span style={{flex:1}}/>
                <button onClick={()=>setShowShopProfile(true)} style={{padding:"5px 10px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#888",fontFamily:"inherit"}}>⚙ Shop Profile</button>
                <button onClick={()=>{
                  const csv = ["Part_ID,Cabinet,Part,Qty,Length,Width,Thickness,Material,Grain,Edge_Band"];
                  allParts.forEach(p => {
                    const l = Math.max(p.width, p.height), w = Math.min(p.width, p.height);
                    csv.push(`${p.partId||""},${p.cabId},${p.part},${p.qty},${l},${w},${p.thickness||""},${p.material},${p.grain||""},${p.edgeBand}`);
                  });
                  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
                  a.download = `cutlist_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                }} style={{padding:"5px 10px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#888",fontFamily:"inherit"}}>Export CSV</button>
                <button onClick={()=>window.print()} style={{padding:"5px 10px",borderRadius:6,fontSize:10,fontWeight:600,cursor:"pointer",background:"#1a1a2a",border:"1px solid #2a2a3a",color:"#888",fontFamily:"inherit"}}>Print</button>
              </div>
              {/* First-run shop profile setup banner */}
              {showFirstRunBanner && (
                <div style={{padding:16,marginBottom:14,background:"#14141e",border:"1px solid #D94420",borderRadius:10}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#eee",marginBottom:4}}>Set up your shop defaults</div>
                  <div style={{fontSize:11,color:"#888",marginBottom:12}}>These settings control how the cut list is calculated. Set them to match your shop — you can always change them later.</div>
                  <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:"8px 16px",marginBottom:12}}>
                    {[
                      ["box_material","Box Material","text"],
                      ["box_thickness","Panel Thickness","num"],
                      ["slide_type","Slide Type","select"],
                      ["slide_clearance","Slide Clearance (total)","num"],
                      ["front_material","Door/Drawer Stock","text"],
                    ].map(([key,label,type])=>(
                      <div key={key} style={{display:"flex",alignItems:"center",gap:8}}>
                        <label style={{fontSize:11,color:"#aaa",minWidth:isMobile?100:140,fontFamily:"'DM Sans',sans-serif"}}>{label}</label>
                        {type==="select"?(
                          <div style={{display:"flex",gap:4}}>
                            {[{v:"side_mount",l:"Side Mount"},{v:"undermount",l:"Undermount"}].map(o=>(
                              <button key={o.v} onClick={()=>handleShopProfileChange({...effectiveProfile,[key]:o.v})} style={{
                                padding:"4px 8px",borderRadius:4,fontSize:10,fontWeight:600,cursor:"pointer",
                                border:effectiveProfile[key]===o.v?"1px solid rgba(217,68,32,0.3)":"1px solid transparent",
                                background:effectiveProfile[key]===o.v?"rgba(217,68,32,0.2)":"#0a0a14",
                                color:effectiveProfile[key]===o.v?"#D94420":"#555",fontFamily:"'JetBrains Mono',monospace",
                              }}>{o.l}</button>
                            ))}
                          </div>
                        ):(
                          <input type={type==="num"?"number":"text"} step={type==="num"?0.0625:undefined}
                            value={effectiveProfile[key]||""}
                            onChange={e=>{const v=type==="num"?parseFloat(e.target.value):e.target.value;if(type==="num"&&isNaN(v))return;handleShopProfileChange({...effectiveProfile,[key]:v});}}
                            style={{flex:1,height:28,background:"#0a0a14",border:"1px solid #2a2a3a",borderRadius:4,color:"#eee",fontSize:11,fontFamily:"'JetBrains Mono',monospace",padding:"0 8px",textAlign:type==="num"?"center":"left"}}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    <button onClick={()=>{markShopProfileConfigured();setShowFirstRunBanner(false);}} style={{padding:"6px 16px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",background:"#D94420",border:"none",color:"#fff",fontFamily:"inherit"}}>Save &amp; Continue</button>
                    <button onClick={()=>{markShopProfileConfigured();setShowFirstRunBanner(false);}} style={{padding:"6px 16px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",background:"transparent",border:"1px solid #2a2a3a",color:"#666",fontFamily:"inherit"}}>Use Defaults</button>
                    <button onClick={()=>{setShowFirstRunBanner(false);setShowShopProfile(true);markShopProfileConfigured();}} style={{padding:"6px 16px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",background:"transparent",border:"none",color:"#D94420",fontFamily:"inherit"}}>Configure All Settings →</button>
                  </div>
                </div>
              )}
              {/* Per-project override indicator */}
              {spec?.shop_profile_override && (
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"6px 10px",background:"rgba(139,92,246,0.1)",borderRadius:6,border:"1px solid rgba(139,92,246,0.2)"}}>
                  <span style={{fontSize:10,color:"#8b5cf6",fontWeight:600}}>Project-specific overrides active</span>
                  <button onClick={()=>{dispatch({type:"CLEAR_SHOP_OVERRIDE"});setProjectOverride(false);}} style={{fontSize:10,color:"#666",background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline"}}>Clear</button>
                </div>
              )}
              {/* Legend with category counts */}
              {(()=>{
                const boxCount = allParts.filter(p=>p.category==="box").reduce((s,p)=>s+p.qty,0);
                const frontCount = allParts.filter(p=>p.category==="front").reduce((s,p)=>s+p.qty,0);
                const drwCount = allParts.filter(p=>p.category==="drawer_box").reduce((s,p)=>s+p.qty,0);
                return <div style={{display:"flex",gap:14,marginBottom:14,fontSize:10,color:"#555",fontFamily:"'JetBrains Mono',monospace"}}>
                  <span><span style={{display:"inline-block",width:7,height:7,borderRadius:2,background:"#1a6fbf",marginRight:4,verticalAlign:"middle"}}/>Box <span style={{color:"#444"}}>{boxCount}</span></span>
                  <span><span style={{display:"inline-block",width:7,height:7,borderRadius:2,background:"#22c55e",marginRight:4,verticalAlign:"middle"}}/>Fronts <span style={{color:"#444"}}>{frontCount}</span></span>
                  <span><span style={{display:"inline-block",width:7,height:7,borderRadius:2,background:"#f97216",marginRight:4,verticalAlign:"middle"}}/>Drawer Box <span style={{color:"#444"}}>{drwCount}</span></span>
                </div>;
              })()}

              {/* Per-cabinet breakdown */}
              {(spec.cabinets||[]).map(cab => {
                const cabParts = allParts.filter(p => p.cabId === cab.id);
                if (!cabParts.length) return null;
                return (
                  <div key={cab.id} style={{marginBottom:20}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"6px 0",borderBottom:"1px solid #1a1a2a",cursor:"pointer"}}
                      onClick={()=>{setSelectedId(cab.id);setTab("render");}}>
                      <span style={{color:cab.row==="base"?"#D94420":"#1a6fbf",fontWeight:700,fontSize:13,fontFamily:"'JetBrains Mono',monospace"}}>{cab.id}</span>
                      <span style={{color:"#666",fontSize:11}}>{cab.type}</span>
                      <span style={{color:"#555",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>{cab.width}" × {cab.height}" × {cab.depth}"</span>
                      <span style={{flex:1}}/>
                      <span style={{fontSize:10,color:"#444"}}>{cabParts.reduce((s,p)=>s+p.qty,0)} parts</span>
                      <span style={{fontSize:9,color:"#555",opacity:0.7}}>view →</span>
                    </div>
                    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                    <table style={{width:"100%",minWidth:isMobile?600:undefined,borderCollapse:"collapse",fontSize:11,fontFamily:"'JetBrains Mono',monospace"}}>
                      <thead>
                        <tr style={{borderBottom:"1px solid #1a1a2a"}}>
                          {(isMobile?["","ID","Part","Qty","W","H","T","Mat"]:["","ID","Part","Qty","W","H","T","Material","Grain","Edge"]).map(h=>(
                            <th key={h} style={{padding:"4px 4px",textAlign:"left",color:"#555",fontWeight:600,fontSize:8,letterSpacing:"0.05em",whiteSpace:"nowrap"}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cabParts.map((p, i) => {
                          // Add separator between categories
                          const prevCat = i > 0 ? cabParts[i-1].category : null;
                          const showSep = prevCat && prevCat !== p.category;
                          return (<React.Fragment key={`part-${i}`}>
                          {showSep && <tr><td colSpan={10} style={{padding:0,height:1,background:"#2a2a3a"}}/></tr>}
                          <tr style={{borderBottom:"1px solid #0a0a14",background:i%2===0?"transparent":"rgba(255,255,255,0.015)"}}>
                            <td style={{padding:"3px 4px",width:6}}><span style={{display:"inline-block",width:6,height:6,borderRadius:2,background:catColor(p.category)}} title={catLabel(p.category)}/></td>
                            <td style={{padding:"3px 4px",color:"#555",fontSize:9,whiteSpace:"nowrap"}}>{p.partId||""}</td>
                            <td style={{padding:"3px 4px",color:"#ccc",whiteSpace:"nowrap"}}>{p.part}</td>
                            <td style={{padding:"3px 4px",color:"#888"}}>{p.qty}</td>
                            <td style={{padding:"3px 4px",color:"#eee",fontWeight:600,whiteSpace:"nowrap"}}>{p.width}"</td>
                            <td style={{padding:"3px 4px",color:"#eee",fontWeight:600,whiteSpace:"nowrap"}}>{p.height}"</td>
                            <td style={{padding:"3px 4px",color:"#888",fontSize:9}}>{p.thickness||""}</td>
                            <td style={{padding:"3px 4px",color:"#666",fontSize:9,whiteSpace:"nowrap"}}>{isMobile?(p.material||"").split('"')[0]+'"':p.material}</td>
                            {!isMobile && <td style={{padding:"3px 4px",color:p.grain==="V"?"#22c55e":"#1a6fbf",fontSize:9}}>{p.grain||""}</td>}
                            {!isMobile && <td style={{padding:"3px 4px",color:"#444",fontSize:9}}>{p.edgeBand}</td>}
                          </tr>
                          </React.Fragment>);
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                );
              })}

              {/* Material summary */}
              <div style={{marginTop:24,padding:"14px 16px",background:"#0a0a14",borderRadius:8,border:"1px solid #1a1a2a"}}>
                {/* Print-only header */}
                <div data-printonly style={{display:"none",marginBottom:16}}>
                  <div style={{fontSize:16,fontWeight:700}}>{projectName} — {roomName} › {wallName}</div>
                  <div style={{fontSize:11,color:"#666"}}>Cut List · Generated {new Date().toLocaleDateString()} · {totalParts} parts</div>
                </div>
                <div style={{fontSize:12,fontWeight:700,color:"#888",marginBottom:10,letterSpacing:"0.05em"}}>MATERIAL SUMMARY</div>
                {Object.entries(byMaterial).map(([mat, parts]) => {
                  const totalQty = parts.reduce((s, p) => s + p.qty, 0);
                  // Estimate 4×8 sheet usage (48"×96" = 4608 sq in, ~65% yield)
                  const totalSqIn = parts.reduce((s, p) => s + (p.qty * p.width * p.height), 0);
                  const sheetsRaw = totalSqIn / (48 * 96 * 0.65);
                  const sheets = Math.ceil(sheetsRaw * 10) / 10;
                  return (
                    <div key={mat} style={{display:"flex",gap:10,padding:"5px 0",fontSize:12,fontFamily:"'JetBrains Mono',monospace",alignItems:"center"}}>
                      <span style={{color:"#D94420",fontWeight:700,minWidth:36}}>{totalQty}x</span>
                      <span style={{color:"#eee",fontWeight:600,flex:1}}>{mat}</span>
                      {sheets > 0.1 && <span style={{color:"#888",fontSize:10,background:"#14141e",padding:"2px 8px",borderRadius:4}}>~{sheets} sheets</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999}}
          onClick={(e) => { if(e.target === e.currentTarget) setPendingDelete(null); }}>
          <div style={{background:"#1a1a2a",border:"1px solid #333",borderRadius:12,padding:"28px 32px",maxWidth:360,width:"90%",textAlign:"center"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#eee",marginBottom:8}}>Delete {pendingDelete}?</div>
            <div style={{fontSize:13,color:"#888",marginBottom:20}}>This cabinet will be removed from the layout.</div>
            <div style={{display:"flex",gap:10,justifyContent:"center"}}>
              <button onClick={() => setPendingDelete(null)}
                style={{padding:"10px 24px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
                  background:"transparent",color:"#888",border:"1px solid #333",fontFamily:"inherit"}}>
                Cancel
              </button>
              <button onClick={() => { dispatch({type:"DELETE_CABINET",id:pendingDelete}); setSelectedId(null); setPendingDelete(null); }}
                style={{padding:"10px 24px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",
                  background:"#e04040",color:"#fff",border:"none",fontFamily:"inherit"}}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shop Profile Modal */}
      {showShopProfile && (
        <ShopProfile
          profile={effectiveProfile}
          onChange={handleShopProfileChange}
          onClose={() => setShowShopProfile(false)}
          projectOverride={projectOverride}
          onToggleOverride={(on) => {
            if (on) {
              setProjectOverride(true);
              dispatch({ type: "SET_SHOP_OVERRIDE", override: { ...shopProfile } });
            } else {
              setProjectOverride(false);
              dispatch({ type: "CLEAR_SHOP_OVERRIDE" });
            }
          }}
        />
      )}

      {/* Extraction processing modal — blocks all interaction */}
      {uploading && (
        <div style={{
          position:"fixed",inset:0,zIndex:99999,
          background:"rgba(0,0,0,0.85)",backdropFilter:"blur(8px)",
          display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        }}>
          {/* Glowing spinner */}
          <div style={{
            width:80,height:80,borderRadius:"50%",
            border:"3px solid #1a1a2a",
            borderTopColor:"#D94420",
            animation:"spin 1s linear infinite",
            boxShadow:"0 0 30px rgba(217,68,32,0.4), 0 0 60px rgba(217,68,32,0.2)",
            marginBottom:28,
          }}/>
          <div style={{fontSize:18,fontWeight:700,color:"#eee",marginBottom:8,letterSpacing:"-0.02em"}}>
            AI is processing...
          </div>
          <div style={{fontSize:13,color:"#888",maxWidth:320,textAlign:"center",lineHeight:1.5,fontFamily:"'JetBrains Mono',monospace"}}>
            {uploadStatus || "Starting extraction..."}
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

    </div>
  );
}


// ═══════════════════════════════════════════════════════════
// ROOM EDITOR WRAPPER — loads project + room context, passes to EditorApp
// ═══════════════════════════════════════════════════════════
function RoomEditorWrapper() {
  const { projectId, roomId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await api.getProject(projectId);
        if (!cancelled) setProject(p);
      } catch (e) { console.error("Failed to load project:", e); }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  if (!project) {
    return <div style={{minHeight:"100vh",background:"#06060c",color:"#555",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>Loading...</div>;
  }

  const wall = project.rooms?.find(r => r.id === roomId);
  const roomName = wall?.room_name || "";
  const wallName = wall?.name || "Wall";

  return (
    <EditorApp
      key={roomId}
      roomId={roomId}
      projectId={projectId}
      projectName={project.name}
      roomName={roomName}
      wallName={wallName}
      onBack={() => navigate(`/project/${projectId}`)}
    />
  );
}


// ═══════════════════════════════════════════════════════════
// APP SHELL — shared dark theme wrapper with header
// ═══════════════════════════════════════════════════════════
function AppShell({ children }) {
  return (
    <div style={{minHeight:"100vh",background:"#07070f",color:"#ddd",fontFamily:"'DM Sans',-apple-system,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
      `}</style>
      <div style={{
        padding:"0",
        borderBottom:"1px solid rgba(255,255,255,0.06)",
        background:"linear-gradient(180deg, #0d0d1a 0%, #07070f 100%)",
      }}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"18px 32px",display:"flex",alignItems:"center",gap:14}}>
          <div style={{
            width:36,height:36,borderRadius:10,
            background:"linear-gradient(135deg, #ef5a30 0%, #D94420 100%)",
            display:"flex",alignItems:"center",justifyContent:"center",
            boxShadow:"0 4px 16px rgba(217,68,32,0.35), 0 0 0 1px rgba(217,68,32,0.2)",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="4" width="20" height="16" rx="2" stroke="#fff" strokeWidth="1.8"/>
              <line x1="2" y1="12" x2="22" y2="12" stroke="#fff" strokeWidth="1.2"/>
              <line x1="9" y1="12" x2="9" y2="20" stroke="#fff" strokeWidth="1.2"/>
              <line x1="15" y1="12" x2="15" y2="20" stroke="#fff" strokeWidth="1.2"/>
            </svg>
          </div>
          <h1 style={{fontSize:20,fontWeight:700,margin:0,letterSpacing:"-0.03em",color:"#fff"}}>
            Cabinet Spec Tool
          </h1>
        </div>
      </div>
      <div style={{padding:"0 0 40px"}}>{children}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP — routing shell
// ═══════════════════════════════════════════════════════════
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell><ProjectList /></AppShell>} />
      <Route path="/project/:projectId" element={<AppShell><ProjectDetail /></AppShell>} />
      <Route path="/project/:projectId/cutlist" element={<AppShell><ProjectCutList /></AppShell>} />
      <Route path="/project/:projectId/room/:roomId" element={<RoomEditorWrapper />} />
    </Routes>
  );
}
