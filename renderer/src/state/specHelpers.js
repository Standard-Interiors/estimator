export const STANDARD_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48];
export const WALL_HEIGHTS = [12, 15, 18, 24, 30, 36, 42];
export const BASE_HEIGHT = 34.5;
export const BASE_DEPTH = 24;
export const WALL_DEPTH = 12;

export const BASE_TYPES = [
  "base",
  "base_sink",
  "base_drawer_bank",
  "base_pullout",
  "base_spice",
];
export const WALL_TYPES = ["wall", "wall_bridge", "wall_stacker"];
export const TALL_TYPES = ["tall_pantry", "tall_oven"];
export const SECTION_TYPES = ["drawer", "door", "false_front", "glass_door", "open"];
export const FRAME_STYLES = ["framed", "frameless"];
export const DEFAULT_FRAME_STYLE = "framed";

// ═══════════════════════════════════════════════════════════
// SHOP PROFILE — set-once defaults for CNC cut list generation
// ═══════════════════════════════════════════════════════════

export const DEFAULT_SHOP_PROFILE = {
  // Box construction
  box_material: '3/4" Melamine',
  box_thickness: 0.75,
  back_material: '1/4" Plywood',
  back_thickness: 0.25,
  back_dado_depth: 0.375,      // depth of dado slot cut into sides for back panel
  back_inset: 0.5,             // distance from rear edge to back panel face

  // Drawer box construction
  drawer_box_material: '1/2" Baltic Birch',
  drawer_box_thickness: 0.5,
  drawer_bottom_material: '1/4" Plywood',
  drawer_bottom_thickness: 0.25,
  drawer_bottom_dado_depth: 0.25,
  drawer_box_rear_gap: 1.0,
  drawer_reveal: 1.5,          // total height deduction (front overlay top + bottom)
  door_thickness: 0.75,        // drawer/door front material thickness

  // Slide hardware
  slide_type: "side_mount",    // side_mount | undermount
  slide_clearance: 0.5,        // TOTAL clearance (both sides combined) for side-mount

  // Toe kick (base cabinets only)
  toe_kick_height: 4.5,
  toe_kick_depth: 3.0,
  base_bottom_clearance: 0.5,  // gap below bottom panel for levelers/shims

  // Shelving
  shelf_material: '3/4" Melamine',
  shelf_thickness: 0.75,
  shelf_setback: 0.5,
  shelf_clearance: 0.125,      // per side clearance for adjustable shelves
  default_shelf_count: { base: 1, wall: 2, tall: 4 },

  // Edge banding
  edge_band_thickness: 0.02,
  edge_band_fronts: true,

  // Construction joints
  box_joint: "dado",
  dado_depth: 0.375,

  // Door/drawer front material
  front_material: '3/4" Plywood',

  // Structural parts toggles
  include_toe_kick: true,
  include_nailer: true,
  include_face_frame: false,
  face_frame_stile_width: 1.5,
  face_frame_rail_width: 1.5,
};

/** Load shop profile from localStorage, merged with defaults */
export function loadShopProfile() {
  try {
    const stored = localStorage.getItem("shop_profile");
    if (stored) return { ...DEFAULT_SHOP_PROFILE, ...JSON.parse(stored) };
  } catch {}
  return { ...DEFAULT_SHOP_PROFILE };
}

/** Save shop profile to localStorage */
export function saveShopProfile(profile) {
  try {
    localStorage.setItem("shop_profile", JSON.stringify(profile));
  } catch {}
}

// Door sizing offsets by frame style
export const FRAME_OFFSETS = {
  framed: {
    width: 0.5,           // subtract from cabinet width for single door
    centerStile: 0.25,    // additional subtract for double doors, then divide by 2
    height: 0.5,          // subtract from cabinet height
    baseDeduct: 5,        // subtract for base cab (toe kick + clearance)
    defaultDrawer: 6,     // default drawer height
  },
  frameless: {
    width: 0.125,
    centerStile: 0.125,   // 0.25 total gap, then divide by 2
    height: 0.25,
    baseDeduct: 4.875,
    defaultDrawer: 6,
  },
};

// Scribe offsets
export const SCRIBE_OFFSETS = {
  side: 0.5,   // per scribed side, reduces door width
  top: 0.75,   // scribed top, reduces door height
};

// Drawer bank default heights (bottom to top)
export const DRAWER_BANK_HEIGHTS = [10.5, 6, 6, 6];

const PREFIX = { base: "B", wall: "W", tall: "T" };

/**
 * Scan existing cabinet ids for the highest number with the row prefix,
 * then return the next available id (e.g. "B7").
 */
export function generateId(row, spec) {
  const prefix = PREFIX[row] || "C";
  let max = 0;
  for (const cab of spec.cabinets) {
    if (cab.id.startsWith(prefix)) {
      const num = parseInt(cab.id.slice(prefix.length), 10);
      if (!isNaN(num) && num > max) max = num;
    }
  }
  return `${prefix}${max + 1}`;
}

/**
 * Return a cabinet template with standard dimensions and a single-door face.
 */
export function defaultCabinet(row, type) {
  const isWall = row === "wall";
  const isTall = row === "tall";

  const width = 18;
  const height = isTall ? 84 : isWall ? 30 : BASE_HEIGHT;
  const depth = isWall ? WALL_DEPTH : BASE_DEPTH;

  return {
    id: "", // caller must set
    type: type || (isWall ? "wall" : isTall ? "tall_pantry" : "base"),
    label: "",
    row,
    width,
    height,
    depth,
    face: {
      sections: [
        {
          type: "door",
          count: 1,
          hinge_side: "left",
        },
      ],
    },
  };
}

/**
 * Return a gap / opening object for insertion into a layout array.
 */
export function defaultGap(label = "Opening", width = 30) {
  return {
    type: "appliance",
    id: `opening_${Date.now()}`,
    label,
    width,
  };
}

/**
 * Sum all widths in a layout row (both cabinet refs and gaps).
 * Cabinet widths are looked up from spec.cabinets.
 */
export function totalRun(spec, row) {
  const layoutKey = row === "base" ? "base_layout" : "wall_layout";
  const layout = spec[layoutKey];
  if (!layout) return 0;

  let total = 0;
  for (const item of layout) {
    if (item.ref) {
      const cab = spec.cabinets.find((c) => c.id === item.ref);
      if (cab) total += cab.width;
    } else if (typeof item.width === "number") {
      total += item.width;
    }
  }
  return total;
}

/**
 * Convert decimal inches to cabinet-maker fraction string (nearest 1/16").
 * e.g. 17.5 → "17-1/2", 8.375 → "8-3/8", 22.125 → "22-1/8"
 */
export function formatFraction(inches) {
  if (inches == null || isNaN(inches)) return "—";
  const neg = inches < 0;
  const abs = Math.abs(inches);
  const whole = Math.floor(abs);
  const rem = abs - whole;

  // Round to nearest 1/16
  const sixteenths = Math.round(rem * 16);
  if (sixteenths === 0) return `${neg ? "-" : ""}${whole}`;
  if (sixteenths === 16) return `${neg ? "-" : ""}${whole + 1}`;

  // Simplify fraction
  let num = sixteenths, den = 16;
  while (num % 2 === 0) { num /= 2; den /= 2; }

  return `${neg ? "-" : ""}${whole > 0 ? `${whole}-` : ""}${num}/${den}`;
}

/**
 * Calculate door/drawer cut sizes for a cabinet.
 *
 * @param {object} cab - cabinet object with width, height, face.sections, scribe
 * @param {string} frameStyle - "framed" or "frameless"
 * @returns {Array<{type, width, height, count, perDoorWidth, label, isOverride, needsVerify}>}
 */
export function calcDoorSizes(cab, frameStyle = "framed") {
  if (!cab?.face?.sections?.length) return [];

  const offsets = FRAME_OFFSETS[frameStyle] || FRAME_OFFSETS.framed;
  const scribe = cab.scribe || {};
  const sections = cab.face.sections;
  const isBase = (cab.row === "base");

  // Effective exterior dimensions after scribe
  const effWidth = cab.width
    - (scribe.left ? SCRIBE_OFFSETS.side : 0)
    - (scribe.right ? SCRIBE_OFFSETS.side : 0);
  const effHeight = cab.height
    - (scribe.top ? SCRIBE_OFFSETS.top : 0);

  // Find the door section to determine if double-door (affects drawer width)
  const doorSection = sections.find(s => s.type === "door" || s.type === "glass_door");
  const doorCount = doorSection?.count || 1;
  const isDouble = doorCount >= 2;

  // Calculate single door width
  const singleDoorWidth = effWidth - offsets.width;
  // Per-door width for double doors
  const perDoorWidth = isDouble
    ? (effWidth - offsets.width - offsets.centerStile) / 2
    : singleDoorWidth;

  // Sum all explicit drawer/false_front heights for base height calculation
  const drawerHeightSum = sections
    .filter(s => s.type === "drawer" || s.type === "false_front")
    .reduce((sum, s) => sum + (s.height || offsets.defaultDrawer), 0);

  // Door height calculation
  const baseDoorHeight = isBase
    ? effHeight - offsets.baseDeduct - drawerHeightSum - offsets.height
    : effHeight - offsets.height;

  const results = [];

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (sec.type === "open") continue; // no cut for open sections

    // Check for manual overrides
    const hasOverride = sec.width_override != null || sec.height_override != null;

    let w, h, pdw;

    if (sec.type === "door" || sec.type === "glass_door") {
      pdw = sec.width_override ?? perDoorWidth;
      w = sec.count >= 2 ? pdw : (sec.width_override ?? singleDoorWidth);
      h = sec.height_override ?? (sec.height || baseDoorHeight);
    } else if (sec.type === "drawer") {
      // Drawer width matches door width; for double-door cabinets, full-width drawer spans both
      const drawerWidth = isDouble
        ? (perDoorWidth * 2) + offsets.centerStile
        : singleDoorWidth;
      w = sec.width_override ?? drawerWidth;
      h = sec.height_override ?? (sec.height || offsets.defaultDrawer);
      pdw = w;
    } else if (sec.type === "false_front") {
      // False front spans full width (same as drawer)
      const ffWidth = isDouble
        ? (perDoorWidth * 2) + offsets.centerStile
        : singleDoorWidth;
      w = sec.width_override ?? ffWidth;
      h = sec.height_override ?? (sec.height || offsets.defaultDrawer);
      pdw = w;
    } else {
      continue;
    }

    // Check if this is a drawer bank that needs verification
    const isDrawerBank = cab.type === "base_drawer_bank";

    const count = sec.count || 1;
    const typeLabel = sec.type === "door" ? "Door" :
      sec.type === "glass_door" ? "Glass" :
      sec.type === "drawer" ? "Drw" :
      sec.type === "false_front" ? "FF" : sec.type;

    const wStr = formatFraction(sec.type === "door" && count >= 2 ? pdw : w);
    const hStr = formatFraction(h);
    const label = count >= 2
      ? `${typeLabel} (x${count}) ${wStr} x ${hStr}`
      : `${typeLabel} ${wStr} x ${hStr}`;

    results.push({
      sectionIndex: i,
      type: sec.type,
      width: w,
      height: h,
      count,
      perDoorWidth: pdw,
      label,
      isOverride: hasOverride,
      needsVerify: isDrawerBank && sec.type === "drawer",
    });
  }

  return results;
}

/**
 * Get scribe description string for a cabinet.
 */
export function calcScribeNotes(cab) {
  const s = cab?.scribe;
  if (!s) return "";
  const parts = [];
  if (s.left) parts.push("L");
  if (s.right) parts.push("R");
  if (s.top) parts.push("Top");
  return parts.length ? parts.join("+") + " scribe" : "";
}

// ═══════════════════════════════════════════════════════════
// BOX PARTS CALCULATOR — all cabinet box panels for CNC
// ═══════════════════════════════════════════════════════════

/**
 * Calculate all box parts (sides, top, bottom, back, shelves) for a cabinet.
 * Dimensions follow standard frameless/framed construction:
 * - Sides are full depth, height minus toe kick for base
 * - Top/bottom fit between sides, depth accounts for back inset
 * - Back sits in dado on all four inner faces
 * - Shelves fit between sides with pin clearance
 */
export function calcBoxParts(cab, shop) {
  if (!cab) return [];
  const parts = [];
  const t = shop.box_thickness;
  const isBase = cab.row === "base";

  // Side height: base = cabinet height - toe kick; wall/tall = full height
  const sideH = isBase ? cab.height - shop.toe_kick_height : cab.height;
  const sideD = cab.depth;

  parts.push({ part: "Left Side", partId: `${cab.id}-LS`, qty: 1,
    width: round4(sideD), height: round4(sideH), thickness: t,
    material: shop.box_material, grain: "V", edgeBand: shop.edge_band_fronts ? "front" : "none" });
  parts.push({ part: "Right Side", partId: `${cab.id}-RS`, qty: 1,
    width: round4(sideD), height: round4(sideH), thickness: t,
    material: shop.box_material, grain: "V", edgeBand: shop.edge_band_fronts ? "front" : "none" });

  // Top & bottom: fit between sides, depth stops at back inset
  const tbW = cab.width - (2 * t);
  const tbD = cab.depth - shop.back_inset; // FIX #1: don't extend past back panel

  parts.push({ part: "Top", partId: `${cab.id}-T`, qty: 1,
    width: round4(tbW), height: round4(tbD), thickness: t,
    material: shop.box_material, grain: "H", edgeBand: shop.edge_band_fronts ? "front" : "none" });
  parts.push({ part: "Bottom", partId: `${cab.id}-B`, qty: 1,
    width: round4(tbW), height: round4(tbD), thickness: t,
    material: shop.box_material, grain: "H", edgeBand: shop.edge_band_fronts ? "front" : "none" });

  // Back panel: fits in dado routed into sides/top/bottom
  // Width = cabinet width minus dado depth on each side
  // Height = side height minus dado depth top and bottom
  const backW = cab.width - (2 * shop.back_dado_depth);
  const backH = sideH - (2 * shop.back_dado_depth);
  parts.push({ part: "Back", partId: `${cab.id}-BK`, qty: 1,
    width: round4(backW), height: round4(backH), thickness: shop.back_thickness,
    material: shop.back_material, grain: "H", edgeBand: "none" });

  // Adjustable shelves: between sides with pin clearance, set back from front
  const shelfCount = (shop.default_shelf_count || {})[cab.row] || 1;
  if (shelfCount > 0) {
    const shelfW = cab.width - (2 * t) - (2 * shop.shelf_clearance);
    const shelfD = cab.depth - shop.shelf_setback - shop.back_inset;
    parts.push({ part: "Adj. Shelf", partId: `${cab.id}-SH`, qty: shelfCount,
      width: round4(shelfW), height: round4(shelfD), thickness: shop.shelf_thickness,
      material: shop.shelf_material, grain: "H", edgeBand: shop.edge_band_fronts ? "front" : "none" });
  }

  // Toe kick stretcher (base cabs only)
  if (isBase && shop.include_toe_kick) {
    parts.push({ part: "Toe Kick", partId: `${cab.id}-TK`, qty: 1,
      width: round4(cab.width - (2 * t)), height: round4(shop.toe_kick_height),
      thickness: t, material: shop.box_material, grain: "H", edgeBand: "none" });
  }

  // Nailer cleat (wall cabs)
  if (cab.row === "wall" && shop.include_nailer) {
    parts.push({ part: "Nailer", partId: `${cab.id}-NL`, qty: 1,
      width: round4(cab.width - (2 * t)), height: 3,
      thickness: t, material: shop.box_material, grain: "H", edgeBand: "none" });
  }

  // Face frame (framed construction only, when enabled)
  if (shop.include_face_frame) {
    const sw = shop.face_frame_stile_width;
    const rw = shop.face_frame_rail_width;
    // Left stile, right stile
    parts.push({ part: "FF Stile L", partId: `${cab.id}-FFS-L`, qty: 1,
      width: round4(sw), height: round4(sideH), thickness: t,
      material: "Face Frame Stock", grain: "V", edgeBand: "none" });
    parts.push({ part: "FF Stile R", partId: `${cab.id}-FFS-R`, qty: 1,
      width: round4(sw), height: round4(sideH), thickness: t,
      material: "Face Frame Stock", grain: "V", edgeBand: "none" });
    // Top rail, bottom rail
    const railW = cab.width - (2 * sw);
    parts.push({ part: "FF Rail T", partId: `${cab.id}-FFR-T`, qty: 1,
      width: round4(railW), height: round4(rw), thickness: t,
      material: "Face Frame Stock", grain: "H", edgeBand: "none" });
    parts.push({ part: "FF Rail B", partId: `${cab.id}-FFR-B`, qty: 1,
      width: round4(railW), height: round4(rw), thickness: t,
      material: "Face Frame Stock", grain: "H", edgeBand: "none" });
    // Center stile for double-door
    const sections = cab.face?.sections || [];
    const hasDblDoor = sections.some(s => (s.type === "door" || s.type === "glass_door") && (s.count || 1) >= 2);
    if (hasDblDoor) {
      // Center stile spans between top and bottom rails
      const csH = sideH - (2 * rw);
      parts.push({ part: "FF Stile C", partId: `${cab.id}-FFS-C`, qty: 1,
        width: round4(sw), height: round4(csH), thickness: t,
        material: "Face Frame Stock", grain: "V", edgeBand: "none" });
    }
  }

  return parts;
}

/**
 * Calculate drawer box parts for a single drawer section.
 * Uses shop profile for slide clearance, reveal, front thickness.
 */
export function calcDrawerBoxParts(cab, ds, shop) {
  if (!ds || ds.type !== "drawer") return [];

  const parts = [];
  const bt = shop.drawer_box_thickness;
  const frontW = ds.width;
  const frontH = ds.height;

  // FIX #4: Use configurable drawer_reveal instead of hardcoded 1.5
  const boxH = round4(frontH - (shop.drawer_reveal || 1.5));

  // FIX #3: slide_clearance is now TOTAL (both sides), not per-side
  const slideTotal = shop.slide_clearance || 0.5;
  // For undermount: no side clearance needed, box width = front width - 2×thickness
  const sideDeduct = shop.slide_type === "undermount" ? 0 : slideTotal;
  const boxW = round4(frontW - sideDeduct - (2 * bt));

  // FIX #5: Use door_thickness from shop profile, not hardcoded 0.75
  const frontThick = shop.door_thickness || 0.75;
  const boxD = round4(cab.depth - frontThick - shop.drawer_box_rear_gap);

  // Sides (qty 2)
  parts.push({ part: "Drw Side", partId: `${cab.id}-DR${ds.sectionIndex}-S`, qty: 2,
    width: round4(boxD), height: round4(boxH), thickness: bt,
    material: shop.drawer_box_material, grain: "H", edgeBand: "top" });

  // Sub-front & back: fit between sides
  parts.push({ part: "Drw Box Ft", partId: `${cab.id}-DR${ds.sectionIndex}-BF`, qty: 1,
    width: round4(boxW), height: round4(boxH), thickness: bt,
    material: shop.drawer_box_material, grain: "H", edgeBand: "top" });
  parts.push({ part: "Drw Back", partId: `${cab.id}-DR${ds.sectionIndex}-BK`, qty: 1,
    width: round4(boxW), height: round4(boxH), thickness: bt,
    material: shop.drawer_box_material, grain: "H", edgeBand: "none" });

  // FIX #2: Bottom panel sits IN dados on front/back/sides
  // Width = inner box width (front/back are between sides, bottom fits between them)
  // Depth = box depth minus one dado (slides in from back during assembly)
  const btmW = round4(boxW);
  const btmD = round4(boxD - shop.drawer_bottom_dado_depth);
  parts.push({ part: "Drw Bottom", partId: `${cab.id}-DR${ds.sectionIndex}-BT`, qty: 1,
    width: btmW, height: btmD, thickness: shop.drawer_bottom_thickness,
    material: shop.drawer_bottom_material, grain: "H", edgeBand: "none" });

  return parts;
}

/**
 * Calculate the complete CNC cut list for a single cabinet.
 * Returns every part: box panels, structural parts, fronts, drawer boxes.
 */
export function calcFullCutList(cab, frameStyle, shop) {
  if (!cab) return [];
  const parts = [];

  // 1. Box parts (sides, top, bottom, back, shelves, toe kick, nailer, face frame)
  for (const bp of calcBoxParts(cab, shop)) {
    parts.push({ cabId: cab.id, ...bp, category: "box" });
  }

  // 2. Fronts (doors, drawers, false fronts) + drawer boxes
  const frontSizes = calcDoorSizes(cab, frameStyle);
  for (const ds of frontSizes) {
    const w = ds.count >= 2 && (ds.type === "door" || ds.type === "glass_door")
      ? ds.perDoorWidth : ds.width;
    const partCode = ds.type === "door" ? "DR" : ds.type === "glass_door" ? "GD"
      : ds.type === "drawer" ? "DRF" : "FF";
    parts.push({
      cabId: cab.id,
      part: ds.type === "door" ? "Door" : ds.type === "glass_door" ? "Glass Door"
        : ds.type === "drawer" ? "Drw Face" : "False Front",
      partId: `${cab.id}-${partCode}${ds.sectionIndex}`,
      qty: ds.count,
      width: round4(w),
      height: round4(ds.height),
      thickness: shop.door_thickness || 0.75,
      material: shop.front_material || "Door Stock",
      grain: "V",
      edgeBand: "all",
      category: "front",
    });

    // Drawer box parts
    if (ds.type === "drawer") {
      for (const dbp of calcDrawerBoxParts(cab, ds, shop)) {
        parts.push({ cabId: cab.id, ...dbp, category: "drawer_box" });
      }
    }
  }

  return parts;
}

/**
 * Calculate the complete CNC cut list for ALL cabinets in a spec.
 */
export function calcProjectCutList(spec, shop) {
  if (!spec?.cabinets) return [];
  const fs = spec.frame_style || "framed";
  const allParts = [];
  for (const cab of spec.cabinets) {
    allParts.push(...calcFullCutList(cab, fs, shop));
  }
  return allParts;
}

/** Round to 4 decimal places to avoid floating point noise */
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
