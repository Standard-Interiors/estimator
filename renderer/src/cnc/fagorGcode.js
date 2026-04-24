const SCHEMA = "cnc_gcode_package_v1";

export const DEFAULT_CNC_PROFILE = {
  machine_make: "Freedom Machine Tool",
  machine_model: "Patriot 4x8",
  controller: "Fagor",
  dialect: "Fagor ISO",
  units: "inch",
  sheet_width: 48,
  sheet_height: 96,
  margin: 0.75,
  spacing: 0.375,
  tool_number: 1,
  tool_diameter: 0.25,
  safe_z: 0.75,
  cut_extra_depth: 0.03,
  pass_depth: 0.25,
  plunge_feed_ipm: 80,
  cut_feed_ipm: 220,
  spindle_rpm: 18000,
};

const round4 = (n) => Math.round(Number(n || 0) * 10000) / 10000;

const clean = (value, fallback = "") =>
  String(value ?? fallback).trim().replace(/[^\w .:/#()+-]/g, "_");

const fileSafe = (value, fallback = "project") =>
  clean(value, fallback).replace(/\s+/g, "_").replace(/_+/g, "_").slice(0, 80) || fallback;

const partKey = (part) => `${part.material || "Unknown"}|${part.thickness || ""}`;

function warning(code, message, extra = {}) {
  return { code, severity: "review", message, ...extra };
}

function expandParts(parts) {
  const expanded = [];
  const warnings = [];

  for (const part of parts || []) {
    const qty = Math.max(0, Math.floor(Number(part.qty || 0)));
    const width = Number(part.width);
    const height = Number(part.height);
    const thickness = Number(part.thickness || 0);

    if (!qty) continue;
    if (!(width > 0) || !(height > 0)) {
      warnings.push(warning(
        "invalid_part_dimension",
        "Part has an invalid width or height and was skipped.",
        { part_id: part.partId, cabinet_id: part.cabId, width: part.width, height: part.height }
      ));
      continue;
    }
    if (!(thickness > 0)) {
      warnings.push(warning(
        "missing_part_thickness",
        "Part has no usable thickness; it stays in the CNC package but needs review.",
        { part_id: part.partId, cabinet_id: part.cabId, thickness: part.thickness }
      ));
    }

    for (let i = 0; i < qty; i += 1) {
      expanded.push({
        ...part,
        width: round4(width),
        height: round4(height),
        thickness: round4(thickness),
        instance: i + 1,
        instanceId: `${part.partId || `${part.cabId || "PART"}-${part.part || "ITEM"}`}-${i + 1}`,
      });
    }
  }

  return { expanded, warnings };
}

function groupParts(parts) {
  const groups = new Map();
  for (const part of parts) {
    const key = partKey(part);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        material: part.material || "Unknown",
        thickness: part.thickness || "",
        parts: [],
      });
    }
    groups.get(key).parts.push(part);
  }
  return [...groups.values()];
}

function placeGroup(group, profile, groupIndex) {
  const warnings = [];
  const sheets = [];
  const maxW = profile.sheet_width - (2 * profile.margin);
  const maxH = profile.sheet_height - (2 * profile.margin);
  const sorted = [...group.parts].sort((a, b) => (b.width * b.height) - (a.width * a.height));

  let sheet = null;
  let x = profile.margin;
  let y = profile.margin;
  let rowH = 0;

  const newSheet = () => {
    sheet = {
      id: `S${groupIndex + 1}-${sheets.length + 1}`,
      material: group.material,
      thickness: group.thickness,
      sheet_width: profile.sheet_width,
      sheet_height: profile.sheet_height,
      parts: [],
    };
    sheets.push(sheet);
    x = profile.margin;
    y = profile.margin;
    rowH = 0;
  };

  newSheet();

  for (const part of sorted) {
    const fits = part.width <= maxW && part.height <= maxH;
    const rotatedFits = part.height <= maxW && part.width <= maxH;
    if (!fits && rotatedFits) {
      warnings.push(warning(
        "part_only_fits_rotated",
        "Part only fits on a 4x8 sheet if rotated; it was skipped to avoid violating grain direction.",
        { part_id: part.partId, cabinet_id: part.cabId, width: part.width, height: part.height, material: group.material }
      ));
      continue;
    }
    if (!fits) {
      warnings.push(warning(
        "part_too_large_for_sheet",
        "Part is too large for the configured sheet size and was skipped.",
        { part_id: part.partId, cabinet_id: part.cabId, width: part.width, height: part.height, material: group.material }
      ));
      continue;
    }

    if (x + part.width > profile.sheet_width - profile.margin) {
      x = profile.margin;
      y += rowH + profile.spacing;
      rowH = 0;
    }
    if (y + part.height > profile.sheet_height - profile.margin) {
      newSheet();
    }

    sheet.parts.push({
      ...part,
      x: round4(x),
      y: round4(y),
      rotation: 0,
    });
    x += part.width + profile.spacing;
    rowH = Math.max(rowH, part.height);
  }

  return { sheets: sheets.filter(s => s.parts.length), warnings };
}

function numberLines(lines) {
  let n = 10;
  return lines.map((line) => {
    if (!line || line === "%" || line.startsWith("(")) return line;
    const numbered = `N${n} ${line}`;
    n += 10;
    return numbered;
  }).join("\n");
}

function formatNumber(n) {
  return round4(n).toFixed(4);
}

function cutPartLines(part, profile) {
  const radius = profile.tool_diameter / 2;
  const x0 = part.x - radius;
  const y0 = part.y - radius;
  const x1 = part.x + part.width + radius;
  const y1 = part.y + part.height + radius;
  const finalDepth = -round4((Number(part.thickness || 0) || 0.75) + profile.cut_extra_depth);
  const passDepth = Math.max(0.05, Number(profile.pass_depth || 0.25));
  const lines = [
    `(${clean(part.instanceId)} ${clean(part.part)} ${formatNumber(part.width)} x ${formatNumber(part.height)} x ${formatNumber(part.thickness)})`,
    `G00 Z${formatNumber(profile.safe_z)}`,
    `G00 X${formatNumber(x0)} Y${formatNumber(y0)}`,
  ];

  let depth = -passDepth;
  while (depth > finalDepth) {
    lines.push(`G01 Z${formatNumber(depth)} F${formatNumber(profile.plunge_feed_ipm)}`);
    lines.push(`G01 X${formatNumber(x1)} Y${formatNumber(y0)} F${formatNumber(profile.cut_feed_ipm)}`);
    lines.push(`G01 X${formatNumber(x1)} Y${formatNumber(y1)}`);
    lines.push(`G01 X${formatNumber(x0)} Y${formatNumber(y1)}`);
    lines.push(`G01 X${formatNumber(x0)} Y${formatNumber(y0)}`);
    depth = round4(depth - passDepth);
  }

  if (depth !== finalDepth) {
    lines.push(`G01 Z${formatNumber(finalDepth)} F${formatNumber(profile.plunge_feed_ipm)}`);
    lines.push(`G01 X${formatNumber(x1)} Y${formatNumber(y0)} F${formatNumber(profile.cut_feed_ipm)}`);
    lines.push(`G01 X${formatNumber(x1)} Y${formatNumber(y1)}`);
    lines.push(`G01 X${formatNumber(x0)} Y${formatNumber(y1)}`);
    lines.push(`G01 X${formatNumber(x0)} Y${formatNumber(y0)}`);
  }

  lines.push(`G00 Z${formatNumber(profile.safe_z)}`);
  return lines;
}

function buildGcode(packageData) {
  const p = packageData.machine_profile;
  const lines = [
    "%",
    `(Cabinet Estimator CNC export - REVIEW AND SIMULATE BEFORE CUTTING)`,
    `(Project: ${clean(packageData.project.name, "Project")})`,
    `(Machine: ${clean(p.machine_make)} ${clean(p.machine_model)} / ${clean(p.controller)})`,
    `(Units: inches via Fagor G70. Origin: lower-left sheet corner. Z zero: material top.)`,
    `(Assumes ${formatNumber(p.tool_diameter)} in cutter, ${formatNumber(p.safe_z)} in safe Z, ${formatNumber(p.pass_depth)} in pass depth.)`,
    `(No tabs, onion-skin, drilling, dados, pockets, vacuum-zone logic, or tool-length validation.)`,
    `(Operator must verify tool, offsets, hold-down, material thickness, feed, spindle, and dry-run first.)`,
    `(Review warnings: ${packageData.warnings.length})`,
  ];

  packageData.warnings.slice(0, 30).forEach((item) => {
    lines.push(`(WARN ${clean(item.code)}: ${clean(item.message).slice(0, 150)})`);
  });
  if (packageData.warnings.length > 30) {
    lines.push(`(WARN more warnings exist in the JSON package: ${packageData.warnings.length - 30})`);
  }

  lines.push(
    `G70 G90 G17 G94`,
    `T${Math.floor(Number(p.tool_number || 1))}`,
    `S${Math.floor(Number(p.spindle_rpm || 18000))} M03`,
    `G00 Z${formatNumber(p.safe_z)}`,
  );

  packageData.sheets.forEach((sheet, sheetIndex) => {
    if (sheetIndex > 0) {
      lines.push(`M05`);
      lines.push(`M00`);
      lines.push(`(Load next sheet, reset XY origin to lower-left sheet corner, then resume)`);
      lines.push(`S${Math.floor(Number(p.spindle_rpm || 18000))} M03`);
      lines.push(`G00 Z${formatNumber(p.safe_z)}`);
    }
    lines.push(`(Sheet ${sheet.id}: ${clean(sheet.material)} ${clean(sheet.thickness)} in)`);
    sheet.parts.forEach(part => {
      lines.push(...cutPartLines(part, p));
    });
  });

  lines.push(`M05`);
  lines.push(`G00 Z${formatNumber(p.safe_z)}`);
  lines.push(`M30`);
  lines.push("%");

  return numberLines(lines);
}

export function buildSingleSheetGcode(packageData, sheet) {
  const singleSheet = sheet ? { ...sheet, id: `${sheet.id}` } : null;
  return buildGcode({
    ...packageData,
    sheets: singleSheet ? [singleSheet] : [],
    totals: {
      ...(packageData?.totals || {}),
      sheets: singleSheet ? 1 : 0,
      programmed_parts: singleSheet?.parts?.length || 0,
    },
  });
}

export function buildCncPackage({ project, parts, shopProfile, machineProfile } = {}) {
  const generatedAt = new Date().toISOString();
  const profile = {
    ...DEFAULT_CNC_PROFILE,
    ...(machineProfile || {}),
  };

  const warnings = [
    warning(
      "simulate_before_cutting",
      "This file is generated from cabinet measurements and must be simulated/dry-run before cutting."
    ),
    warning(
      "rectangular_profile_only",
      "This first CNC export only profiles rectangular parts. It does not generate dados, shelf pin holes, hinge boring, drawer-slide holes, tabs, or nested joinery."
    ),
  ];

  const { expanded, warnings: partWarnings } = expandParts(parts || []);
  warnings.push(...partWarnings);

  const sheets = [];
  for (const [index, group] of groupParts(expanded).entries()) {
    const placed = placeGroup(group, profile, index);
    sheets.push(...placed.sheets);
    warnings.push(...placed.warnings);
  }

  const placedCount = sheets.reduce((sum, sheet) => sum + sheet.parts.length, 0);
  const skippedCount = Math.max(0, expanded.length - placedCount);
  if (skippedCount > 0) {
    warnings.push(warning(
      "some_parts_not_programmed",
      "Some parts were not placed into G-code. Review package warnings before using the output.",
      { skipped_parts: skippedCount }
    ));
  }

  const packageData = {
    schema: SCHEMA,
    generated_at: generatedAt,
    project: {
      id: project?.id || null,
      name: project?.name || "Project",
      status: project?.status || "",
    },
    machine_profile: profile,
    shop_profile: shopProfile || {},
    totals: {
      source_parts: (parts || []).length,
      expanded_parts: expanded.length,
      programmed_parts: placedCount,
      skipped_parts: skippedCount,
      sheets: sheets.length,
      warnings: warnings.length,
    },
    sheets,
    warnings,
  };

  const baseName = fileSafe(project?.name || "project");
  packageData.gcode = {
    filename: `${baseName}_fagor_cnc_${generatedAt.slice(0, 10)}.nc`,
    dialect: profile.dialect,
    content: buildGcode(packageData),
  };

  return packageData;
}
