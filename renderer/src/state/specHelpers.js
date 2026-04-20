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

/** Check if the user has completed the first-run shop profile setup */
export function isShopProfileConfigured() {
  return localStorage.getItem("shop_profile_setup_complete") === "1";
}

/** Mark the shop profile as configured (first-run dismissed) */
export function markShopProfileConfigured() {
  localStorage.setItem("shop_profile_setup_complete", "1");
}

/**
 * Resolve the effective shop profile for a spec.
 * Per-project override in spec.shop_profile_override takes precedence over global defaults.
 */
export function resolveShopProfile(spec) {
  const global = loadShopProfile();
  if (spec?.shop_profile_override) {
    return { ...global, ...spec.shop_profile_override };
  }
  return global;
}

// Door sizing offsets by frame style
// Per Neil Prinster's spec (Standard Interiors of Colorado):
//   framed    wall/tall: door = cab - 0.5 (width and height)
//   framed    base:      door_h = cab_h - 5 - drawer_height
//   frameless wall/tall: door = cab - 0.125 (w), cab - 0.25 (h)
//   frameless base:      door_h = cab_h - 4.875 - drawer_height
// The baseDeduct values (5 / 4.875) ALREADY include the top reveal —
// callers must NOT add `height` on top for standard bases. See calcDoorSizes().
// baseRevealExtra = baseDeduct − standard toe_kick (4.5). If shop_profile.toe_kick_height
// is non-standard, baseDeduct is recomputed as toe_kick + baseRevealExtra.
export const FRAME_OFFSETS = {
  framed: {
    width: 0.5,            // subtract from cabinet width for single door
    centerStile: 0.25,     // additional subtract for double doors, then divide by 2
    height: 0.5,           // subtract from cab height for non-base doors
    baseDeduct: 5,         // Neil's number: total deduction for std base (toe kick + reveal)
    baseRevealExtra: 0.5,  // baseDeduct − 4.5" std toe kick; added to shop toe_kick_height
    defaultDrawer: 6,      // default drawer height
  },
  frameless: {
    width: 0.125,
    centerStile: 0.125,    // 0.25 total gap, then divide by 2
    height: 0.25,
    baseDeduct: 4.875,
    baseRevealExtra: 0.375,
    defaultDrawer: 6,
  },
};

// Scribe offsets
export const SCRIBE_OFFSETS = {
  side: 0.5,   // per scribed side, reduces door width
  top: 0.75,   // scribed top, reduces door height
};

// Drawer bank default heights, in section order (top → bottom).
// Per Neil's spec: "10.5" for lowest drawer, 6" for three drawers above it."
// These are often custom — UI surfaces a verify badge (see needsVerify below).
export const DRAWER_BANK_HEIGHTS = [6, 6, 6, 10.5];

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
export function calcDoorSizes(cab, frameStyle = "framed", shopProfile) {
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

  // Dynamic baseDeduct: standard bases (>28") get Neil's full frame-style deduction
  // (5" framed / 4.875" frameless). This value ALREADY includes the top reveal, so we
  // do NOT add offsets.height on top for standard bases. Short bases like vanities
  // (≤28") have no toe kick and fall back to the general cab rule (effHeight - height).
  // If shop_profile.toe_kick_height is non-standard, we rebuild baseDeduct as
  // toe_kick + baseRevealExtra so the door math tracks the custom toe kick.
  const stdToeKick = 4.5;
  const shopToeKick = shopProfile?.toe_kick_height ?? stdToeKick;
  const baseDeduct = (isBase && cab.height > 28)
    ? shopToeKick + offsets.baseRevealExtra
    : 0;

  // Door height:
  // - Non-base (wall/tall): effHeight - drawerHeightSum - offsets.height
  //     (drawers on wall cabs are unusual but legal — must still subtract their height)
  // - Base >28" (std base): effHeight - baseDeduct - drawerHeightSum
  //     (baseDeduct already bakes in the top reveal; do NOT add offsets.height again)
  // - Base ≤28" (vanity): effHeight - drawerHeightSum - offsets.height (general rule)
  const baseDoorHeight = isBase
    ? (baseDeduct > 0
        ? effHeight - baseDeduct - drawerHeightSum
        : effHeight - drawerHeightSum - offsets.height)
    : effHeight - drawerHeightSum - offsets.height;

  // Cabinet-level overflow: do the face sections fit in the cabinet?
  // For drawer banks (no door) this is the ONLY way we'd catch a bad face.
  // Example: AI extracts drawer heights [6, 12, 12] on a 34.5" base → sum=30,
  // + 5" base deduct = 35" needed for 34.5" cab → overflow.
  const hasDoor = sections.some(s => s.type === "door" || s.type === "glass_door");
  const consumedByDrawersPlusDeduct = drawerHeightSum + (isBase && baseDeduct > 0 ? baseDeduct : offsets.height);
  const faceOverflow = !hasDoor && consumedByDrawersPlusDeduct > effHeight;

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

    // Overflow flag: either
    //   (a) computed dimensions went negative (door auto-height < 0) — catches the
    //       post-merge "-6.5\" door" case even though merge now auto-resets, OR
    //   (b) cabinet-level face overflow (drawer bank where heights sum > cab height).
    // The UI surfaces this in red so the cabinet maker never sends bad geometry to CNC.
    const overflows = w <= 0 || h <= 0 || faceOverflow;

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
      overflows,
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

  // Nailer cleat — ALL cabinet types need a rear nailer for wall mounting
  // (base: supports countertop clips + wall screws; wall: sole mounting;
  // tall: prevents tipping). Not just wall cabs.
  if (shop.include_nailer) {
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
  const frontH = ds.height;

  // FIX #4: Use configurable drawer_reveal instead of hardcoded 1.5
  const boxH = round4(frontH - (shop.drawer_reveal || 1.5));

  // CRITICAL FIX: Drawer box width must be derived from the CABINET OPENING
  // (cab.width minus two side panels), NOT from the door front width (ds.width).
  // The front includes overlay that extends past the carcass — using it made
  // every drawer box 0.5-1.375" too wide to physically fit inside the box.
  //
  // Correct: opening = cab.width - 2×box_thickness
  //          boxW    = opening - slide_clearance - 2×drawer_box_thickness
  const openingW = cab.width - (2 * shop.box_thickness);
  const slideTotal = shop.slide_clearance || 0.5;
  const sideDeduct = shop.slide_type === "undermount" ? 0 : slideTotal;
  const boxW = round4(openingW - sideDeduct - (2 * bt));

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
  const frontSizes = calcDoorSizes(cab, frameStyle, shop);
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
    // Skip cabinets explicitly marked as duplicates of ones in other photos —
    // they stay in the layout view for spatial context but must not
    // double-count material in the cut list.
    if (cab.exclude_from_cutlist) continue;
    allParts.push(...calcFullCutList(cab, fs, shop));
  }
  return allParts;
}

/** Round to 4 decimal places to avoid floating point noise */
function round4(n) {
  return Math.round(n * 10000) / 10000;
}
