import { buildSingleSheetGcode } from "./fagorGcode";

const ZIP_MIME_TYPE = "application/zip";
const ENCODER = new TextEncoder();

const clean = (value, fallback = "") =>
  String(value ?? fallback).trim().replace(/[^\w .:/#()+-]/g, "_");

const fileSafe = (value, fallback = "file") =>
  clean(value, fallback).replace(/[\\/:]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").slice(0, 96) || fallback;

const fmt = (value, digits = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(digits).replace(/\.?0+$/, "");
};

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const csvRows = (headers, rows) => [
  headers.map(csvCell).join(","),
  ...rows.map(row => headers.map(header => csvCell(row[header])).join(",")),
].join("\n");

function getBaseName(packageData) {
  const filename = packageData?.gcode?.filename || `${packageData?.project?.name || "project"}_fagor_cnc.nc`;
  return fileSafe(filename.replace(/\.nc$/i, ""), "cnc_job");
}

function dosTimestamp(dateString) {
  const parsed = new Date(dateString);
  const date = Number.isNaN(parsed.getTime()) ? new Date("2026-01-01T00:00:00Z") : parsed;
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pushU16(target, value) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushU32(target, value) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function toBytes(values) {
  return new Uint8Array(values);
}

function concat(chunks, totalSize) {
  const out = new Uint8Array(totalSize);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

function normalizeZipFile(file) {
  const name = String(file.name || "file.txt").replace(/^\/+/, "");
  const data = typeof file.contents === "string" ? ENCODER.encode(file.contents) : file.contents;
  return {
    name,
    nameBytes: ENCODER.encode(name),
    dataBytes: data instanceof Uint8Array ? data : new Uint8Array(data || []),
  };
}

function buildZip(files, generatedAt) {
  const timestamp = dosTimestamp(generatedAt);
  const chunks = [];
  const centralChunks = [];
  let offset = 0;
  let totalSize = 0;
  let centralSize = 0;

  const normalized = files.map(normalizeZipFile);

  normalized.forEach((file) => {
    const crc = crc32(file.dataBytes);
    const local = [];
    pushU32(local, 0x04034b50);
    pushU16(local, 20);
    pushU16(local, 0);
    pushU16(local, 0);
    pushU16(local, timestamp.time);
    pushU16(local, timestamp.date);
    pushU32(local, crc);
    pushU32(local, file.dataBytes.length);
    pushU32(local, file.dataBytes.length);
    pushU16(local, file.nameBytes.length);
    pushU16(local, 0);

    const localBytes = toBytes(local);
    chunks.push(localBytes, file.nameBytes, file.dataBytes);
    totalSize += localBytes.length + file.nameBytes.length + file.dataBytes.length;

    const central = [];
    pushU32(central, 0x02014b50);
    pushU16(central, 20);
    pushU16(central, 20);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, timestamp.time);
    pushU16(central, timestamp.date);
    pushU32(central, crc);
    pushU32(central, file.dataBytes.length);
    pushU32(central, file.dataBytes.length);
    pushU16(central, file.nameBytes.length);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU16(central, 0);
    pushU32(central, 0);
    pushU32(central, offset);

    const centralBytes = toBytes(central);
    centralChunks.push(centralBytes, file.nameBytes);
    centralSize += centralBytes.length + file.nameBytes.length;
    offset += localBytes.length + file.nameBytes.length + file.dataBytes.length;
  });

  const end = [];
  pushU32(end, 0x06054b50);
  pushU16(end, 0);
  pushU16(end, 0);
  pushU16(end, normalized.length);
  pushU16(end, normalized.length);
  pushU32(end, centralSize);
  pushU32(end, offset);
  pushU16(end, 0);

  const endBytes = toBytes(end);
  return concat([...chunks, ...centralChunks, endBytes], totalSize + centralSize + endBytes.length);
}

function buildSetupSheet(packageData) {
  const profile = packageData.machine_profile || {};
  const totals = packageData.totals || {};

  return [
    "# CNC Setup Sheet",
    "",
    `Project: ${packageData.project?.name || "Project"}`,
    `Generated: ${packageData.generated_at || ""}`,
    `Machine: ${[profile.machine_make, profile.machine_model, profile.controller].filter(Boolean).join(" / ")}`,
    `Program: ${packageData.gcode?.filename || ""}`,
    "",
    "## Job Totals",
    "",
    `Source parts: ${totals.source_parts || 0}`,
    `Programmed parts: ${totals.programmed_parts || 0}`,
    `Skipped parts: ${totals.skipped_parts || 0}`,
    `Sheets: ${totals.sheets || 0}`,
    `Warnings: ${totals.warnings || 0}`,
    "",
    "## Machine Assumptions",
    "",
    `Units: ${profile.units || "inch"}`,
    `Sheet: ${fmt(profile.sheet_width, 3)} x ${fmt(profile.sheet_height, 3)}`,
    `Origin: lower-left sheet corner`,
    `Z zero: material top`,
    `Safe Z: ${fmt(profile.safe_z, 3)}`,
    `Tool: T${profile.tool_number || 1}, ${fmt(profile.tool_diameter, 4)} in diameter`,
    `Pass depth: ${fmt(profile.pass_depth, 4)}`,
    `Cut extra depth: ${fmt(profile.cut_extra_depth, 4)}`,
    `Spindle: ${profile.spindle_rpm || ""} RPM`,
    `Feed: ${profile.cut_feed_ipm || ""} IPM cut, ${profile.plunge_feed_ipm || ""} IPM plunge`,
    "",
    "## Operator Must Verify",
    "",
    "- Correct sheet material and actual thickness.",
    "- Correct tool diameter, tool number, tool length, and collet condition.",
    "- Correct work offset/origin on every sheet.",
    "- Safe Z clears clamps, spoilboard hardware, pods, and fixtures.",
    "- Hold-down/vacuum is safe for small parts.",
    "- Feed, speed, pass depth, tabs/onion skin strategy, and dust collection are acceptable.",
    "- Program is simulated or dry-run before cutting with the spindle engaged.",
    "",
    "## Known Limits",
    "",
    "- Rectangular profile cuts only.",
    "- No dados, shelf-pin holes, hinge boring, drawer-slide holes, pockets, tabs, onion skin, or vacuum-zone logic yet.",
    "- This export helps review cabinet part geometry. It is not a certified machine setup.",
    "",
  ].join("\n");
}

function buildExternalReadme(packageData) {
  const profile = packageData.machine_profile || {};
  return [
    "# External CNC Verification Pack",
    "",
    "Use this pack after the in-app CNC preview and before the machine.",
    "",
    "## Recommended Flow",
    "",
    "1. Open the in-app CNC preview and check sheet layout, toolpath order, rapid moves, Z passes, and warnings.",
    "2. Open the per-sheet `.nc` files in CAMotics or another visual simulator. Per-sheet files are easier to verify because each sheet starts from a clean 48 x 96 origin.",
    "3. Load the full Fagor `.nc` or each per-sheet `.nc` into the Fagor control/simulator and confirm the controller accepts the code.",
    "4. If the shop uses Predator, import the Fagor program with the actual Fagor controller profile and run material-removal/collision verification.",
    "5. Do a machine dry-run/prove-out with the spindle off or above the sheet before cutting real material.",
    "",
    "## Included Files",
    "",
    "- `gcode/full_job.nc`: full multi-sheet Fagor review program.",
    "- `gcode/per_sheet/*.nc`: one program per sheet for easier external simulation.",
    "- `cnc_package.json`: the exact structured CNC payload from the web app.",
    "- `machine_profile.json`: machine, tool, feed, and sheet assumptions.",
    "- `SETUP_SHEET.md`: operator setup assumptions and checklist.",
    "- `reports/warnings.csv`: all review warnings.",
    "- `reports/sheets.csv`: sheet/material/part-count summary.",
    "- `reports/programmed_parts.csv`: every programmed part with sheet position.",
    "- `simulators/*.md`: notes for CAMotics, Fagor, and Predator.",
    "",
    "## Critical Assumption",
    "",
    `This package assumes ${fmt(profile.sheet_width, 3)} x ${fmt(profile.sheet_height, 3)} sheets, inch units, lower-left sheet origin, and Z zero at material top.`,
    "",
  ].join("\n");
}

function buildCamoticsNotes(packageData) {
  const profile = packageData.machine_profile || {};
  return [
    "# CAMotics Notes",
    "",
    "CAMotics is the best free first external visual check for this app right now.",
    "",
    "## How To Check",
    "",
    "1. Use one file from `gcode/per_sheet/` at a time.",
    "2. Set units to inches if CAMotics does not infer them from `G70`.",
    `3. Set the workpiece to ${fmt(profile.sheet_width, 3)} x ${fmt(profile.sheet_height, 3)} x material thickness.`,
    `4. Set the tool diameter to ${fmt(profile.tool_diameter, 4)} in.`,
    "5. Simulate and look for wrong scale, wrong origin, unsafe rapids, or cuts outside the sheet.",
    "",
    "## Important Limit",
    "",
    "CAMotics is a visual 3-axis G-code simulator. It is not a Fagor controller emulator and does not prove that the real controller, offsets, tooling, or hold-down setup are safe.",
    "",
  ].join("\n");
}

function buildFagorNotes() {
  return [
    "# Fagor Controller Check",
    "",
    "Use this as the controller-level sanity check after the visual preview.",
    "",
    "## What To Confirm",
    "",
    "- The controller accepts the file and reads inch mode (`G70`).",
    "- The active plane and absolute mode match the header (`G17`, `G90`).",
    "- The tool number, spindle speed, feed, and safe Z match the real setup.",
    "- The lower-left sheet origin is set correctly before every sheet.",
    "- `M00` sheet stops are honored in the full-job program.",
    "- A dry-run/prove-out clears clamps, spoilboard hardware, and fixtures.",
    "",
    "## Practical Tip",
    "",
    "If the full multi-sheet file is awkward to prove out, start with the matching `gcode/per_sheet/` file for the sheet currently on the machine.",
    "",
  ].join("\n");
}

function buildPredatorNotes() {
  return [
    "# Predator Virtual CNC Notes",
    "",
    "Predator is the serious commercial verification path if the shop wants machine-specific Fagor simulation.",
    "",
    "## What To Use From This Pack",
    "",
    "- Import `gcode/full_job.nc` or one `gcode/per_sheet/*.nc` file.",
    "- Use the actual Fagor controller/model profile in Predator.",
    "- Set stock to the sheet size and material thickness from `SETUP_SHEET.md`.",
    "- Match tool diameter, safe Z, feeds, spindle speed, and origin assumptions.",
    "- Review material removal, rapids, controller alarms, and sheet-change behavior.",
    "",
    "## Important Limit",
    "",
    "The web app cannot certify a proprietary Predator/Fagor machine profile. This pack gives Predator the clean job inputs to verify.",
    "",
  ].join("\n");
}

function warningRows(warnings) {
  return (warnings || []).map((item, index) => ({
    index: index + 1,
    severity: item.severity || "review",
    code: item.code || "",
    message: item.message || "",
    part_id: item.part_id || "",
    cabinet_id: item.cabinet_id || "",
    width: item.width || "",
    height: item.height || "",
    material: item.material || "",
  }));
}

function sheetRows(sheets) {
  return (sheets || []).map(sheet => ({
    sheet_id: sheet.id,
    material: sheet.material || "",
    thickness: sheet.thickness || "",
    sheet_width: sheet.sheet_width || "",
    sheet_height: sheet.sheet_height || "",
    part_count: sheet.parts?.length || 0,
  }));
}

function programmedPartRows(sheets) {
  return (sheets || []).flatMap(sheet => (sheet.parts || []).map((part, index) => ({
    sheet_id: sheet.id,
    cut_order: index + 1,
    instance_id: part.instanceId || "",
    part_id: part.partId || "",
    cabinet_id: part.cabId || "",
    room: part.roomName || "",
    wall: part.wallName || "",
    part: part.part || "",
    category: part.category || "",
    material: part.material || sheet.material || "",
    thickness: part.thickness || sheet.thickness || "",
    width: part.width || "",
    height: part.height || "",
    x: part.x || "",
    y: part.y || "",
    rotation: part.rotation || 0,
    grain: part.grain || "",
    edge_band: part.edgeBand || "",
  })));
}

export function buildCncVerificationPack(packageData) {
  if (!packageData?.gcode?.content) {
    throw new Error("Missing CNC G-code package.");
  }

  const baseName = getBaseName(packageData);
  const sheets = packageData.sheets || [];
  const fullGcodeFilename = fileSafe(packageData.gcode.filename || `${baseName}.nc`, `${baseName}.nc`);
  const files = [
    { name: "README_EXTERNAL_VERIFICATION.md", contents: buildExternalReadme(packageData) },
    { name: "SETUP_SHEET.md", contents: buildSetupSheet(packageData) },
    { name: "cnc_package.json", contents: `${JSON.stringify(packageData, null, 2)}\n` },
    { name: "machine_profile.json", contents: `${JSON.stringify(packageData.machine_profile || {}, null, 2)}\n` },
    { name: `gcode/${fullGcodeFilename}`, contents: packageData.gcode.content },
    {
      name: "reports/warnings.csv",
      contents: csvRows(
        ["index", "severity", "code", "message", "part_id", "cabinet_id", "width", "height", "material"],
        warningRows(packageData.warnings)
      ),
    },
    {
      name: "reports/sheets.csv",
      contents: csvRows(
        ["sheet_id", "material", "thickness", "sheet_width", "sheet_height", "part_count"],
        sheetRows(sheets)
      ),
    },
    {
      name: "reports/programmed_parts.csv",
      contents: csvRows(
        ["sheet_id", "cut_order", "instance_id", "part_id", "cabinet_id", "room", "wall", "part", "category", "material", "thickness", "width", "height", "x", "y", "rotation", "grain", "edge_band"],
        programmedPartRows(sheets)
      ),
    },
    { name: "simulators/CAMOTICS.md", contents: buildCamoticsNotes(packageData) },
    { name: "simulators/FAGOR.md", contents: buildFagorNotes(packageData) },
    { name: "simulators/PREDATOR.md", contents: buildPredatorNotes(packageData) },
  ];

  sheets.forEach((sheet) => {
    const material = fileSafe(sheet.material || "material", "material");
    const thickness = fileSafe(sheet.thickness || "thickness", "thickness");
    files.push({
      name: `gcode/per_sheet/${fileSafe(sheet.id, "sheet")}_${material}_${thickness}.nc`,
      contents: buildSingleSheetGcode(packageData, sheet),
    });
  });

  return {
    filename: `${baseName}_verification_pack.zip`,
    mimeType: ZIP_MIME_TYPE,
    files,
    bytes: buildZip(files, packageData.generated_at),
  };
}
