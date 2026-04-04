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
