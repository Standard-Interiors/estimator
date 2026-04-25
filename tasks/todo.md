# System Goal Audit (2026-04-24)

- [x] Define the three product goals being evaluated
- [x] Run independent product, CNC, API, and cabinet-maker estimator reviews
- [x] Inspect current implementation against those goals
- [x] Check external CNC verification assumptions against current simulator/controller reality
- [x] Produce a ranked list of gaps, product risks, and next recommendations

## Goal Criteria

- Easier estimator workflow: reduce manual measurement entry, make AI correction fast, and keep the estimator in control.
- Faster estimates: produce structured cabinet scope that Nancy can pull without needing the cut-list page as a source of truth.
- Faster CNC handoff: produce cut-list/CNC data that gets the shop closer to machine-ready output without pretending it is certified production CAM.

## Review Notes

- Four independent reviews agreed on the same high-level answer: the app is already useful as an AI-assisted takeoff and correction tool, but it is not yet quote/build/CNC-safe without estimator review.
- Goal 1, easier estimator workflow: partially achieved. The editor is the strongest product surface because users can correct cabinet dimensions, rows, face sections, duplicate exclusions, fillers, openings, and 3D placement faster than manually rebuilding every line item. Remaining gap: there is no explicit quote-readiness workflow that says count verified, dimensions reviewed, openings labeled, and ready for Nancy.
- Goal 2, faster estimates/Nancy: mostly achieved as a draft handoff. The backend exposes `/api/projects/{pid}/quote-scope`, `/api/projects/{pid}/nancy-scope`, and `/api/nancy/quote-scope?project=...`, and the payload comes from edited saved room specs rather than cut-list math. Remaining gap: Nancy can pull useful scope, but the payload is not yet final-estimate-safe because there is no project-level verified status, immutable scope hash/version, auth/API contract, or hard blocker gate.
- Goal 3, faster CNC handoff: achieved as a review/prove-out package, not as certified production CAM. The app now produces CNC JSON, Fagor-style G-code, in-app preview, and a verification pack. Remaining gap: the G-code is rectangular-profile-only and intentionally does not include dados, shelf-pin holes, hinge boring, drawer-slide holes, tabs, onion-skin, vacuum/hold-down strategy, tool-length validation, or a proven machine-specific Fagor post.
- External verification reality check: CAMotics is useful as a free visual G-code simulator, but its own docs say it supports a subset of LinuxCNC G-code and lacks several CNC features. Predator Virtual CNC is closer to serious offline machine verification and collision/toolpath checking, but it is a commercial system and still needs machine-specific setup. Fagor publishes controller programming manuals, so a real production post should be validated against the exact Patriot/Fagor controller, not assumed from generic ISO-style G-code.
- Cabinet-maker domain gap: stock-fit is not implemented yet. Width chips and fillers help manually, but there is no inventory catalog, SKU mapping, nearest-stock suggestion, filler optimization, or standard/modified/custom classification.
- Data-trust gap: dimensions need provenance. Estimators need to know whether a number came from AI, a default, a typed edit, a tape measurement, or a derived run. Right now too much can look equally valid after normalization.
- Count-trust gap: cabinet count is treated as important, but the extraction pipeline still does not enforce count parity from counted cabinets to saved cabinets to quote scope. A missing cabinet can still become a pricing problem instead of a system blocker.
- CNC-trust gap: exports are still too permissive. Warnings/skipped parts/missing thickness should block production-style export or require explicit signoff; missing thickness currently warns but can still fall through to generated motion assumptions.

## Ranked Recommendations

- P0: Add a project/wall/cabinet readiness workflow: count verified, dimensions verified, openings labeled, duplicates reviewed, ready for Nancy, ready for CNC.
- P0: Make quote and CNC exports fail closed on blockers: missing specs, invalid dimensions, count mismatch, unplaced cabinets, unreadable specs, skipped CNC parts, or missing material thickness.
- P1: Add dimension provenance and review state to every cabinet and generated output: AI/default/edited/tape-verified/needs-measure.
- P1: Turn Nancy scope into a stable integration contract: OpenAPI/JSON Schema matching the live payload, API key or signed token, project-level scope version/hash, and persisted export records.
- P1: Add a Quote Scope Review screen before export with grouped room/wall/cabinet rows, cabinet counts, face summary, openings/fillers, warnings, and copy/export rows Nancy or a human estimator can use directly.
- P1: Add stock/inventory matching: stock catalog, nearest standard size suggestions, filler/spacer recommendations, standard/modified/custom classification, and estimator acceptance flags.
- P1: Add a persisted Machine Profile screen: controller variant, work offset, safe Z, tool number, tool diameter, feed/speed, pass depth, sheet size, tabs/onion-skin strategy, and post version.
- P2: Expand CNC from rectangle profiling into cabinet CAM: dados, shelf pins, hinge boring, drawer-slide holes, labels, lead-ins/ramps, operation ordering, hold-down rules, and source-to-programmed reconciliation.
- P2: Improve correction speed with better photo/model comparison, especially mobile quick overlay or side-by-side review.
- P2: Clean up room-type-specific copy and docs so the product stays a cabinet-maker tool for any space, not a kitchen-only tool.

# Live Chrome MCP Desktop/Mobile Smoke Audit (2026-04-24)

- [x] Desktop pass 1: project list, project detail, room editor, 3D edits, cut list, Nancy/CNC exports
- [x] Mobile pass 1: project list, project detail, room editor, bottom sheet/actions, cut list, CNC preview
- [x] Desktop pass 2: revisit suspicious projects and correction paths with fresh eyes
- [x] Mobile pass 2: stress scrolling, overflow, modals, and edit-state carryover
- [x] Document every concrete bug with repro steps, viewport, project/wall, priority, and suspected fix area

## Audit Notes

- Scope: live `https://cabinet-estimator.fly.dev/` via Chrome MCP only, using real production projects and both desktop and mobile emulation.
- Focus: estimator speed, editor correction reliability, Nancy handoff, cut-list/CNC handoff, mobile parity, overflow/scroll issues, destructive actions, stale state, and runtime console/network errors.

## Findings

- P1 Mobile 3D editor wastes most of the viewport before the drawing. Reproduced in Chrome MCP on iPhone viewport for `The Heights by Marston Lake / Kitchen / Wall 3` and `Resort at University Park 1715A / Kitchen / Wall 2`. The cabinets render, but the SVG is vertically centered in a large white editor area, making the correction tool feel broken on mobile. Suspected fix area: `App.jsx` render container `justifyContent`.
- P2 Project counts are confusing between list and detail. Reproduced on live `Resort at University Park 1715A`: project list API summary reports `room_count: 6`, while project detail correctly shows `5 rooms · 6 walls`. The list appears to treat walls as rooms. Fixed locally by making project summaries count unique room groups and expose `wall_count`.
- P2 Wall card text click enters rename mode instead of opening the wall. Reproduced on desktop and mobile in project detail. Clicking the wall name changes to an input and blocks navigation until Enter/blur. Fixed locally by making single tap open the wall and moving rename to double-click/menu.
- P2 Saved wall briefly flashes the `New Extraction` screen while the room spec is loading. Reproduced in Chrome MCP after opening a real extracted wall under throttled network. Fixed locally with an explicit loading state so the user does not think the saved spec disappeared.
- P3 Existing saved project data still says `Kitchen` in multiple real projects. Code placeholders/comments have been cleaned up, but saved field data remains user-owned and was not rewritten.
- P3 Mobile project cut-list and CNC preview are usable but cramped. The CNC preview opens and shows sheets/warnings/toolpaths on iPhone viewport, but the header/actions consume a lot of vertical space and the sheet tabs rely on horizontal scrolling.

## Fix Notes

- Fixed the P1 mobile 3D editor viewport bug by keeping desktop vertically centered but pinning the mobile render to the top of the canvas.
- Fixed the P2 project-card summary bug by making `list_projects()` and `get_project()` use the same room-vs-wall aggregate rules and rendering cards as `rooms · walls · cabinets`.
- Fixed the P2 wall-card primary-action bug: mobile menu is visible without hover, single tap opens the wall, and rename remains available from the overflow menu.
- Fixed the loading flash when opening a saved extracted room: under slow Chrome MCP network, the editor now shows `Loading room...` instead of the wrong `New Extraction` screen.
- Removed room-type-specific `Kitchen/kitchen` text from source code placeholders/comments without changing extraction prompts or saved project data.
- Local Chrome MCP proof with live Fly data: `Resort at University Park 1715A / Kitchen / Wall 2` now shows cabinets immediately under the toolbar instead of halfway down a blank white area.
- Local Chrome MCP proof with live Fly data: `The Heights by Marston Lake / Kitchen / Wall 3`, selecting `T1`, now shows the selected tall cabinet plus the mobile correction controls in the first viewport.
- Desktop Chrome MCP regression proof: `The Heights by Marston Lake / Kitchen / Wall 3` still renders centered on desktop.
- Local Chrome MCP backend/UI proof: project cards now show summaries like `2 rooms · 4 walls · 24 cabinets`, proving the card can distinguish rooms from walls.
- Local Chrome MCP proof with live Fly data: `Resort at University Park 1715A / Kitchen / Wall 2` wall-name tap opens the wall, and the mobile overflow menu exposes Duplicate/Rename/Delete.
- Local Chrome MCP proof with live Fly data under throttled network: opening an extracted wall shows `Loading room...` before resolving to the 3D editor.
- Local Chrome MCP proof with normal local API base restored: project cards show `1 room · 3 walls · 0 cabinets` and mobile wall-name tap opens the 3D editor.
- Targeted lint passed: `npm exec eslint -- src/App.jsx src/pages/ProjectDetail.jsx src/pages/ProjectList.jsx src/components/ProjectCard.jsx src/components/RoomCard.jsx src/editor/BottomSheet.jsx`.
- Python compile passed: `python3 -m py_compile extractor/db.py`.
- Build passed after reverting the temporary local API base: `npm run build`.

# CNC External Verification Pack (2026-04-23)

- [x] Confirm the current CNC preview/export package is already the single source of truth
- [x] Add a shop-ready verification pack export from the same package data
- [x] Include Fagor `.nc`, CNC JSON, per-sheet `.nc` files, setup sheet, warnings, sheet list, part list, and external simulator instructions
- [x] Add cut-list and preview-modal buttons for the verification pack
- [x] Verify locally in Chrome MCP using real production project data
- [x] Run targeted lint/build checks
- [x] If clean, commit/push/deploy and verify live in Chrome MCP

## Review Notes

- The external check should not be a second interpretation of the job. It should package the exact same Fagor output and sheet placements the cabinet maker just previewed.
- CAMotics is useful as a free 3-axis visual simulator, but it is not a Fagor controller emulator. The verification pack should say that plainly.
- Fagor/Predator verification should be supported as an operator workflow/package export, not falsely embedded as if the web app can certify a proprietary controller run.
- Targeted ESLint passed: `npm exec eslint -- src/pages/ProjectCutList.jsx src/cnc/fagorGcode.js src/cnc/CncPreviewModal.jsx src/cnc/verificationPack.js`.
- Production build passed: `npm run build`.
- Local Chrome MCP real-data proof on `The Heights by Marston Lake`: the cut-list header shows `Verification Pack`, the CNC preview modal shows `Verification Pack` and `External Verification Path`, and the generated ZIP parsed successfully in-browser.
- Local ZIP proof: filename `The_Heights_by_Marston_Lake_fagor_cnc_2026-04-24_verification_pack.zip`, MIME `application/zip`, 35 entries, 24 per-sheet `.nc` files, required README/setup/profile/report/simulator files present, and no nested material-name folder paths.
- Main cut-list button proof: clicking `Verification Pack` generated the same ZIP and showed the alert summary for 157 parts, 24 sheets, and 2 warnings.
- Committed and pushed `5e701e2 Add CNC verification pack export` to `main`.
- Deployed Fly image `registry.fly.io/cabinet-estimator:deployment-01KPYRZA5VF8JM2V723E535K05`.
- Production Chrome MCP proof on live `https://cabinet-estimator.fly.dev/project/3389c9e8abb7ae8b/cutlist`: preview modal exposes `External Verification Path` and modal `Verification Pack`.
- Live modal ZIP proof: filename `The_Heights_by_Marston_Lake_fagor_cnc_2026-04-24_verification_pack.zip`, MIME `application/zip`, 35 entries, 24 per-sheet `.nc` files, all required README/setup/profile/report/simulator files present, no nested material-name folder paths.
- Live header button proof: clicking top-level `Verification Pack` generated the same ZIP and showed the 157 parts / 24 sheets / 2 warnings alert.

# CNC In-App Simulator (2026-04-23)

- [x] Reuse the existing CNC JSON package as the single source of truth for preview and export
- [x] Add a `Preview CNC` action next to `Export Fagor G-Code`
- [x] Render 4x8 sheet layouts with every placed part, order number, material/thickness, and warnings
- [x] Show rapid moves, cut paths, and Z-depth pass counts before export
- [x] Verify locally in Chrome MCP using real production project data
- [x] Build, lint targeted files, commit, push, deploy, and verify live with Chrome MCP

## Review Notes

- The preview must not invent a second CNC interpretation. It should consume `buildCncPackage()` output so the user previews the same sheet placement and toolpath assumptions that the exported Fagor file uses.
- This is an operator review simulator, not a certified Fagor controller simulation. It should catch obvious bad sheet placement, wrong order, excessive sheets, skipped parts, and warning conditions before download.
- Local Chrome MCP verification against production project `The Heights by Marston Lake`: `Preview CNC` opens a modal with 24 sheet tabs, a 48x96 SVG sheet view, warning cards, Z-pass detail, rapid/cut path overlays, and G-code preview.
- Dense sheet verification: `S1-14` shows 29 ordered toolpath rows with rapid moves, cut paths, and 4 Z passes per 3/4" part.
- Modal download verification intercepted the generated `.nc` blob from the preview button and confirmed the Fagor `G70 G90 G17 G94` header, Freedom Patriot/Fagor metadata, sheet-change `M00`, and simulation warning text.
- Mobile Chrome MCP pass found and fixed the preview body's desktop-only column layout. The sheet tabs remain horizontally scrollable by design; the preview body now stacks instead of requiring a desktop grid.
- Targeted lint passed: `npx eslint src/pages/ProjectCutList.jsx src/cnc/fagorGcode.js src/cnc/CncPreviewModal.jsx`.
- Production build passed locally and inside Fly deploy.
- Deployed Fly image `registry.fly.io/cabinet-estimator:deployment-01KPYQSWZN89MCX5H8WEX1ZD9N`.
- Production Chrome MCP verification on live `https://cabinet-estimator.fly.dev/project/3389c9e8abb7ae8b/cutlist`: `Preview CNC` opens on real field data with 24 sheet tabs, 48x96 SVG sheet view, warning cards, Fagor G-code preview, and modal download output.
- Live dense-sheet proof: `S1-14` shows 29 ordered toolpath rows, 31 SVG rects including sheet/margin, 31 SVG paths including cut/grid paths, and 29 rapid move lines.
- Live modal download proof: intercepted `.nc` filename `The_Heights_by_Marston_Lake_fagor_cnc_2026-04-24.nc` and confirmed `G70 G90 G17 G94`, Freedom Patriot/Fagor metadata, `M00`, and simulation warning text.

# CNC / G-Code Export (2026-04-23)

- [x] Identify the CNC machine/controller from user photos
- [x] Trace the current cut-list and quote-scope data model
- [x] Define a safe first CNC package from edited room data
- [x] Reuse the browser cut-list calculator so CNC export honors the current shop profile
- [x] Add frontend G-code and CNC JSON export buttons on the cut-list page
- [x] Verify through Chrome MCP on real project data
- [x] Commit, push, deploy, and verify live if runtime checks pass

## Review Notes

- Photos show a Freedom Patriot 4x8 CNC router with a Fagor control panel.
- The visible shop-side source document is a measured door/drawer list in inches.
- Safety constraint: do not silently generate final production motion without machine setup assumptions. First version should produce reviewable G-code/package output with explicit warnings and machine profile metadata.
- Backend CNC API is intentionally deferred for this pass because the current shop profile lives in browser localStorage. Generating from the frontend keeps the CNC package aligned with the exact cut list the cabinet maker is reviewing.
- Local Chrome MCP verification on real production project `The Heights by Marston Lake`: cut-list page showed `Export Fagor G-Code` and `CNC JSON`; export generated 157 programmed parts across 24 4x8 sheets with 0 skipped parts.
- Downloaded `.nc` proof includes Fagor inch header `G70 G90 G17 G94`, Freedom Patriot/Fagor metadata, simulation warnings, sheet-change `M00` stops, and final `M30`.
- Downloaded CNC JSON proof uses schema `cnc_gcode_package_v1` and machine profile `Patriot 4x8` / `Fagor`.
- Deployed Fly image `registry.fly.io/cabinet-estimator:deployment-01KPYNHFTS4VD2QBZMRNYVFZA2`.
- Production Chrome MCP verification on the live Fly cut-list page intercepted the generated download blobs directly:
- `.nc` filename `The_Heights_by_Marston_Lake_fagor_cnc_2026-04-24.nc`; contains `G70 G90 G17 G94`, Freedom Patriot/Fagor metadata, sheet-change `M00`, and `%` wrapper.
- JSON filename `The_Heights_by_Marston_Lake_fagor_cnc_2026-04-24_package.json`; schema `cnc_gcode_package_v1`, project `The Heights by Marston Lake`, totals `157` programmed parts, `0` skipped parts, `24` sheets, `2` warnings.

# Branch Cleanup (2026-04-23)

- [x] Fetch/prune branch refs from origin
- [x] Confirm all non-main branches have their changes merged into `main`
- [x] Merge any remaining unique branch commits into `main`
- [x] Push `main`
- [x] Delete merged non-main local branches
- [x] Delete merged non-main remote branches
- [x] Verify final branch state is only `main` plus untracked local artifacts

## Review Notes

- `codex/runtime-trust-fixes` was identical to `main` and already pushed, so `git merge --ff-only codex/runtime-trust-fixes` reported `Already up to date`.
- `claude/hungry-bose` had no unique commits (`main...claude/hungry-bose` was `55 0`), so `git merge --ff-only claude/hungry-bose` reported `Already up to date`.
- `claude/hungry-bose` was checked out in `/Users/william/estimator/.claude/worktrees/hungry-bose`; that worktree had stale uncommitted local-only files, including an unused Vite proxy change and older task docs, so it was removed before deleting the branch.
- Deleted local branches: `codex/runtime-trust-fixes`, `claude/hungry-bose`.
- Deleted remote branch: `origin/codex/runtime-trust-fixes`.
- Final branch inventory: local `main`; remote `origin/main` and `origin/HEAD`.

# Nancy Scope Export (2026-04-23)

- [x] Confirm the latest working branch before building
- [x] Define the simplest quote-scope payload Nancy can call directly
- [x] Add backend quote-scope builder from normalized saved room specs
- [x] Add intuitive Nancy API endpoints by project id or project name
- [x] Add a human export/review button that uses the same backend payload
- [x] Verify through Chrome MCP on real field data, deploy, and re-verify live

## Review Notes

- `codex/runtime-trust-fixes` is the latest branch: it is 32 commits ahead of `main`, and `main` has no unique commits.
- The Nancy payload must come from normalized edited room data, not the browser cut-list math.
- The API should be easy to call by either project id or project name, because Nancy should not need to understand the frontend route structure.
- Local Chrome MCP proof: `GET /api/projects/1730a82716a3e412/quote-scope` returned `nancy_quote_scope_v1`, and `GET /api/nancy/quote-scope?project=My%20Cabinet%20Project` matched by name.
- Local Chrome MCP proof: clicking `Export Nancy Scope` on the project cut-list page issued `GET /api/projects/1730a82716a3e412/quote-scope [200]`.
- Live Chrome MCP proof on `The Heights by Marston Lake`: `/api/projects/3389c9e8abb7ae8b/quote-scope`, `/api/projects/3389c9e8abb7ae8b/nancy-scope`, and `/api/nancy/quote-scope?project=The%20Heights%20by%20Marston%20Lake` all returned `200`.
- Live Chrome MCP proof: clicking `Export Nancy Scope` on the deployed cut-list page issued `GET /api/projects/3389c9e8abb7ae8b/quote-scope [200]`.

# Live Chrome Audit Continuation (2026-04-23)

- [x] Reproduce the next production trust issue with Chrome MCP instead of code-guessing
- [x] Confirm that ordinary room deletion on the project page has no confirmation dialog
- [ ] Add confirmation for every room deletion while preserving the existing last-room warning
- [ ] Verify local behavior in Chrome MCP, then deploy and re-verify on the live site
- [ ] Resume the fresh-eye audit immediately after deploy and capture the next issue

## Review Notes

- Live repro on `cabinet-estimator.fly.dev`: deleting `Wall 2` from a two-wall temp project removed it immediately with no confirmation dialog.
- This is different from the already-fixed last-room flow. The project stayed alive as expected, but ordinary room deletion remained a one-click destructive action.
- Fix goal: every room delete should confirm first, while the last room keeps its more specific warning text about leaving an empty draft project.

# Fresh-Eye Loading Audit (2026-04-23)

- [x] Review backend read helpers that shape project and room truth for the UI
- [x] Audit `ProjectDetail.jsx`, `ProjectCutList.jsx`, and `RoomEditorWrapper` / `App.jsx` for load and error-state mismatches
- [x] Capture only concrete trust-relevant findings where UI messaging can diverge from backend reality

## Review Notes

- `get_project()` still exposes room summaries from raw `spec_json`, while `get_room()` is stricter and nulls invalid specs. That leaves room-summary surfaces vulnerable to overstating extraction success.
- `ProjectCutList.jsx` silently drops any room whose `spec_json` fails to parse and can fall through to the same empty-state copy used for truly unextracted projects.
- `EditorApp` still swallows room-read failures after `RoomEditorWrapper` has already confirmed the room exists from the project summary, which can leave users on the blank extraction UI instead of a load failure.

# Live Data Triage (2026-04-22)

- [x] Review prior live-production anomaly notes for duplicate projects, copy media loss, and empty room records
- [x] Inspect current duplication and room persistence code paths in `extractor/db.py`, `extractor/server.py`, and related UI entry points
- [x] Classify each anomaly as trust-breaking product bug vs stale or user-owned data and capture fix priority

## Review Notes

- Empty duplicate projects: product-trust issue if duplication produced them, but the current `duplicate_project()` implementation now copies rooms. Treat the existing empty shells as stale historical fallout unless users can still reproduce empty duplicates today.
- Historical copy that lost images and `room_name`: real trust-breaking product bug at the time it happened. Current code includes a dedicated fix commit (`f0db483`, `Preserve room names and images on duplicates`), so the remaining bad record is historical damage, not proof of an active data model problem by itself.
- `Bell` → `Bathroom` → `Wall 1` empty room record: not trust-breaking on its own. The product intentionally allows creating a room/wall before adding a photo or extraction, so one completely empty wall reads like an abandoned draft unless we have evidence the system created it without user intent.
- Product-code priority: prevent duplicate/copy operations from ever yielding incomplete copies and consider surfacing draft vs populated state more clearly so abandoned empty walls and true failures are easier to distinguish.

# Branch Comparison

- [x] Identify the two branches to compare
- [x] Check commit ancestry and head commit dates
- [x] Summarize which branch has the latest code

## Branch Review

- `main` has the latest code.
- `git rev-list --left-right --count main...claude/hungry-bose` returned `21 0`, so `main` is 21 commits ahead and `claude/hungry-bose` has no unique commits.
- `claude/hungry-bose` is an ancestor of `main`.
- Head commits:
- `main`: `499b483` on `2026-04-19 19:09:11 -0600`
- `claude/hungry-bose`: `44ea2bc` on `2026-04-02 22:50:35 -0600`

# Multi-Agent Review

- [x] Confirm we are reviewing from `main`
- [x] Identify the production editor paths in `App.jsx`
- [x] Launch 3 independent SWE review agents
- [x] Gather cabinet-maker-estimator feedback on their findings
- [x] Synthesize prioritized fixes and recommendations

## Multi-Agent Review Notes

- Top priorities from the combined review:
- Enforce cabinet-count integrity in the extraction pipeline before any auto-save.
- Preserve `alignment` semantics instead of flattening them into anonymous fillers on load.
- Add real conflict recovery for extraction saves and frontend autosave.
- Bring the real face-layout correction workflow to mobile and reset transient mobile action state on cabinet change.
- Restrict cabinet nudging so it only adjusts explicit fillers/spacers, not openings.
- Secondary fixes:
- Unify cabinet-count definitions across summaries and cut lists.
- Preserve `room_name` on duplication.
- Fix multi-door summary overcounting in the door schedule.
- Stop no-op actions from consuming undo history.
- Treat task persistence and image-ingestion consistency as backend hardening work after the integrity batch.

# Second-Pass Verification

- [x] Re-check the five prioritized claims with fresh independent SWE review
- [x] Re-check shop impact with a cabinet-measurement expert agent
- [x] Compare agent findings against the exact referenced code
- [x] Mark each claim as confirmed, qualified, or rejected

## Second-Pass Verification Notes

- Claim 1 — `confirmed`
- Count awareness exists in prompts and progress messages, but the pipeline never enforces count parity between Step 1 and the saved spec.
- Claim 2 — `confirmed`, with tighter framing
- `LOAD_SPEC` intentionally compiles alignment into filler geometry and clears `alignment`; the immediate view may still look right in simple cases, but dynamic alignment semantics are lost and can drift after load/save/edit.
- Claim 3 — `confirmed`, with tighter framing
- Optimistic locking exists, but recovery is missing. Background extraction can save against stale room versions, and the frontend has no real 409 recovery path.
- Claim 4 — `qualified`
- Mobile is not unusable, but it is missing important correction controls and has unsafe transient action state. Better framing: mobile is weaker and not yet safe enough as the primary correction surface.
- Claim 5 — `confirmed`
- `NUDGE_CABINET` mutates any adjacent non-cabinet layout item, not just fillers, so openings/appliance gaps can be silently changed.
- Trust blockers from the cabinet-measurement perspective:
- `1`, `3`, and `5` are clear hard blockers.
- `2` is also a blocker when upper placement matters.
- `4` is a blocker for mobile-first field correction, but less so for desktop-first workflows.

# Claim Review 2026-04-21

- [x] Verify production paths and identify the exact files that control extraction, loading, saving, and desktop/mobile correction
- [x] Review whether cabinet-count integrity is enforced anywhere between extraction output, validation, and persistence
- [x] Review whether alignment semantics are preserved or drift during load/normalization/render placement
- [x] Review whether save/conflict handling can cause extraction results or later corrections not to stick
- [x] Review whether the mobile editor safely supports the real correction workflow used in the field
- [x] Review whether cabinet nudging can silently change opening widths or other non-cabinet geometry
- [x] Write a claim-by-claim shop-impact verdict and identify true trust blockers

## Claim Review Notes

- Production editor path confirmed in `App.jsx`: desktop = `InteractiveRender` + `CabinetEditBar`; mobile = `InteractiveRender` + `BottomSheet` + `ActionRow`.
- Claim 1: confirmed. Count info is gathered in the pipeline prompt, but no step enforces that extracted output matches the counted cabinet total. Multipass verification uses the first successful run as the base spec and only votes widths, so under-counted runs can become authoritative.
- Claim 2: confirmed. `LOAD_SPEC` converts alignment semantics into anonymous filler items, then clears `alignment`. The conversion is lossy and can shift wall placement on load, especially when the first aligned cabinet is not the first wall cabinet in the run.
- Claim 3: confirmed. Frontend autosave has no recovery path after a version conflict, and extraction background tasks save against the room version captured at task start. A stale version can therefore cause extraction or later edits to fail to persist.
- Claim 4: qualified. Mobile supports core cabinet edits, but not the full safe correction workflow. `ActionRow` keeps destructive local state across cabinet changes, and mobile lacks the desktop filler insertion controls needed for opening/filler-heavy cleanup.
- Claim 5: confirmed. `NUDGE_CABINET` treats any non-cabinet layout item as movable gap space, including appliance openings, so nudging can silently shrink or expand real openings.
- Trust blockers from a shop perspective: count integrity, persistence/conflict handling, and opening-mutating nudges. Alignment drift is also a trust blocker when upper placement matters. Mobile is a blocker for mobile-first correction, but less so for desktop-first use.

# Production Runtime Verification

- [x] Capture the user's correction to use the real production site for browser verification
- [x] Restore Chrome DevTools MCP transport and use it instead of fallback browser drivers
- [x] Open the production site in an isolated Chrome DevTools MCP session
- [x] Find live project data suitable for reproducing the five reviewed claims
- [x] Reproduce as many claims as possible in runtime and record evidence limits for the rest
- [x] Summarize live confirmations versus code-trace-only confirmations

## Production Runtime Verification Notes

- Chrome DevTools MCP wrapper in Codex stayed broken (`Transport closed`), but the bundled `chrome-devtools` CLI from the same `chrome-devtools-mcp` package worked against a clean isolated daemon and was used for the runtime pass.
- Claim 5: `confirmed in runtime`.
- On `The Heights by Marston Lake` → `Wall 3`, selecting `B3` and clicking desktop `Move right` changed the adjacent opening labels from `30"` / `30"` to `3"` / `27"` instead of only moving against explicit filler space. Clicking `Move left` restored `30"` / `30"`.
- Claim 3: `confirmed in runtime`.
- Two live DevTools pages opened on the same room reproduced a save race. Page 2 changed `B3` from `18w` to `21w` and saved successfully. Page 1, still on stale version `19`, changed `B3` to `24w` and issued `PATCH /api/rooms/24ca994d2d3db8de/spec` with `409 {"detail":"Version conflict: expected 19, got 21"}`. The stale page showed `Save failed` and kept the unsaved `24w` edit on screen until reload.
- Claim 4: `qualified, with runtime support`.
- Mobile viewport (`390x844`) showed the `BottomSheet` path with width/height/depth, move/split/merge, and insert-before/after controls, but it did not expose desktop-style face-section CRUD such as `+ Section` or per-section remove controls. Also, after arming `Split` on `B3`, switching to `B2` kept split mode active and retargeted it to the new cabinet instead of clearing transient action state.
- Claim 2: `runtime corroborated, not fully visualized`.
- A successful live `PATCH` save for the same wall sent `wall_layout` with an anonymous filler spacer and `alignment: []`, matching the static finding that loaded alignment intent is flattened away before save. This pass did not isolate a clean visual drift case on production data.
- Claim 1: `not directly reproduced in runtime`.
- The production browser pass did not include a known bad extraction/photo that under-counts cabinets and still saves, so count-integrity remains code-trace confirmed rather than browser-reproduced.

# Runtime Trust Fixes

- [x] Fix `NUDGE_CABINET` so only explicit fillers/spacers are resized during horizontal nudges
- [x] Preserve `alignment` on load/save instead of compiling it away into anonymous fillers
- [x] Add real version-conflict recovery for autosave and extraction result handling
- [x] Bring desktop face-section CRUD parity to mobile and clear transient action state when cabinet selection changes
- [ ] Verify locally, deploy to Fly, and rerun production Chrome DevTools runtime checks

# Warning-Based Nudge Follow-up

- [x] Replace the hard stop on opening-resizing nudges with a warning-first flow
- [x] Re-run Chrome MCP checks on desktop nudge, drag nudge, keyboard nudge, and undo history
- [x] Re-check conflict recovery and mobile editing to make sure the warning change did not regress earlier fixes
- [x] If clean, commit, push, deploy, and verify the live site behavior matches local

## Warning Follow-up Review

- Desktop move buttons and keyboard nudges both still move the cabinet, change the adjacent opening when needed, show a warning, and produce a real undo step.
- Mobile still shows face-section editing controls, and split mode still clears when switching cabinets.
- Conflict recovery still works: a stale save reloads the newer room snapshot instead of leaving ghost edits onscreen.
- Chrome MCP did not give me a reliable drag gesture repro path for the SVG cabinet drag itself, but that path still routes through the same `handleNudge` warning callback used by button and keyboard nudges.
- Live Fly verification on `Wall 3` matches local: `B3` can move right again, the refrigerator gap shrinks from `30"` to `27"`, the warning banner appears, and undo restores the original layout.

# Tall Cabinet Recovery

- [x] Compare the live `Wall 3` render against the original photo and wireframe
- [x] Trace why `T1` renders and edits badly in the current frontend
- [ ] Make tall cabinets first-class in the production editor flow without requiring AI output changes
- [ ] Verify the `Wall 3` scenario in Chrome MCP on local and live data

## Tall Cabinet Recovery Notes

- The photo and wireframe both show a real tall pantry to the right of the refrigerator. The bad screenshot is not just "AI guessed wrong."
- The frontend only has `base_layout` and `wall_layout`. `T1` exists as `row: "tall"`, but it is carried inside `base_layout`, so base-row rendering logic incorrectly gives it countertop/base-neighbor behavior.
- Desktop and mobile editor paths both have row-to-layout logic that only understands `base` and `wall`, so tall cabinets lose merge/add-gap/add-cab safety and mobile type controls regress to wall behavior.
- Local Chrome MCP verification: adding a tall cabinet from the production editor path now gives tall-specific controls and no longer drags the counter through the tall box.
- Live Chrome MCP verification on `Wall 3`: `T1` now renders as a distinct tall pantry, the counter stops before it, the upper bridges no longer visually slice through it, and selecting `T1` surfaces tall type pills (`pantry` / `oven`) plus lower-row edit actions.

# Tall Move Investigation

- [x] Reproduce `T1` movement behavior in live 3D Chrome MCP
- [x] Trace the exact movement rules for tall cabinets in the production editor code
- [x] Explain whether the limitation is intentional, inherited from lower-run layout rules, or a bug

## Tall Move Investigation Notes

- User expectation: in 3D mode, a tall cabinet should be movable anywhere needed for correction, even if the AI originally placed it badly.
- Root cause: production 3D drag was still just a visual wrapper around `NUDGE_CABINET`, so `T1` could only resize nearby lower-run gaps instead of changing its actual slot in `base_layout`.
- Fix direction chosen after staff-level review: keep `base_layout` / `wall_layout` as the persisted source of truth, make drag commit a real slot placement action, and expose row changes explicitly in the editor instead of hiding them inside drag.

# 3D Placement Fix

- [x] Replace lower/tall drag-to-nudge with true slot placement in the active 3D editor
- [x] Keep warning-based nudge behavior for arrow-button precision moves
- [x] Add explicit base / wall / tall row controls to desktop and mobile editor surfaces
- [x] Verify local Chrome MCP behavior on real Wall 3 field data
- [ ] Deploy to Fly and rerun the production Chrome MCP matrix

## 3D Placement Review

- Local Chrome MCP on Wall 3 confirmed `T1` now commits a real placement action in 3D: dragging left changed the saved lower-run order to `B2, T1, B3, fridge`.
- Undo / Redo worked on the placement action without losing selection or breaking render layering.
- Explicit row controls now exist on desktop and mobile; locally, `T1 -> wall` converted the cabinet into the wall run with wall controls and wall dimensions, then undo restored the original tall state.
- Precision nudge still works separately: `B3` move-right still warns and resizes the refrigerator opening instead of silently reordering.
- The temporary local real-data verification path restored Wall 3 to its original saved state after testing.

# Front / Back Move Review

- [x] Confirm the active desktop/mobile editor files and current movement affordances in the requested review scope
- [x] Trace how non-wall and wall movement are exposed in `InteractiveRender.jsx`, `CabinetEditBar.jsx`, `BottomSheet.jsx`, `ActionRow.jsx`, and `App.jsx`
- [x] Decide whether true non-wall front/back movement is the right UX primitive
- [x] Identify parity and regression risks before any implementation work
- [x] Return verdict, recommended UX, and recommendation

## Front / Back Move Notes

- Verdict for this review: qualified no. Do not add a generic true front/back move for non-wall cabinets in the current editor model.
- Real `Wall 3` / `T1` read: the pantry is already modeled correctly as a tall cabinet in the lower run, placed in a specific `base_layout` slot to the right of the refrigerator opening. The bug that mattered there was wrong slot/row semantics, not a missing depth-plane control.
- Why: the active affordances already give a clear correction stack for non-wall cabinets: reorder in 3D (`InteractiveRender.jsx`), explicit row changes on desktop and mobile (`CabinetEditBar.jsx`, `BottomSheet.jsx`), and direct depth editing on both surfaces. A new front/back move would overlap with depth editing and row changes without a clear visual lane model.
- `InteractiveRender.jsx` only teaches two movement metaphors today: horizontal slot placement for lower/tall cabinets and vertical offset for wall cabinets. The drop preview is a single vertical insertion line, so adding non-wall front/back to the same drag would be ambiguous.
- Persisted-state read: wall cabinets own a first-class placement offset (`yOffset`), but non-wall cabinets do not. Base and tall cabinets only persist `row`, `depth`, and their position in `base_layout`, so a real front/back axis would require a new lower-run lane field instead of reusing `depth`.
- Desktop has no explicit non-wall front/back control in `CabinetEditBar.jsx`; it exposes left/right nudge plus wall-only up/down. Mobile is even tighter: `ActionRow.jsx` only exposes left/right move, split, merge, add before/after, and delete, while `BottomSheet.jsx` exposes row pills and depth edits but no movement axis beyond row changes.
- If this ever becomes a real need outside `Wall 3`, the safe version is an explicit discrete lane/setback concept with matching render guides, counter logic, and overlap rules. It should not ship as a free diagonal drag or as an overloaded `depth` edit.
- Main parity risk: a desktop-only drag/context-menu solution would immediately diverge from mobile because the mobile path has no equivalent affordance or hint space for a hidden third movement axis.
- Main regression risks:
- Counter segments only break on tall-row membership, not on lower z-position, so a moved-back `T1` would still cut the counter as if it remained on the front plane.
- Tall cabinets are rendered after uppers to keep them visually in front of bridge cabinets; a free lower front/back axis would reopen overlap bugs without a new occlusion model.
- In the current 2.5D view, a non-wall front/back drag would read like a diagonal slide, so users could not easily tell whether they changed slot order, changed depth, or moved the cabinet onto another lane.
# Production Editor Drag/Reorder Review (2026-04-21)

- [x] Confirm the active production editor files and interaction path for desktop/mobile
- [x] Trace `InteractiveRender.jsx` drag handling and compare it to arrow-button/keyboard nudges in `App.jsx`
- [x] Trace state updates in `specReducer.js` and directly related layout helpers
- [x] Identify why the current drag model behaves like a disguised nudge, especially for tall-cabinet cases like `T1` on `Wall 3`
- [x] Propose a clean reducer/UI design for true placement/reordering while preserving useful nudge behavior
- [x] Capture edge cases, constraints, and exact file references in the review output

## Review Notes

# Front/Back State Model Review (2026-04-21)

- [x] Confirm the active production files and current placement/state entry points for front/back questions

# Tall / Offset Trust Audit (2026-04-23)

- [x] Document the active review scope for tall/front-back/yOffset/depthOffset editor behavior
- [x] Trace reducer and helper invariants in `specReducer.js` and `specHelpers.js`
- [x] Trace render/control behavior in `InteractiveRender.jsx`, `CabinetEditBar.jsx`, `BottomSheet.jsx`, `ActionRow.jsx`, and `App.jsx`
- [x] Return prioritized likely bugs/regressions only, with exact file references

## Review Notes

- `SET_LANE` only updates the lane flag. Tall `depthOffset` survives lane snaps, so a cabinet can still render/set save as set back after the UI says `front`.
- Lower-run drag/drop math still uses front-plane slot `x` positions, while setback tall rendering adds projected lane/depth offsets. Once a tall is moved back/front, the visible box and the slot hit-testing no longer line up.
- `InteractiveRender` sizes the SVG width from raw layout width plus cabinet depth only. It never budgets for lane/depth offsets, so setback lower cabinets near the far right can be clipped.
- Gap/opening rendering is still front-plane only. Back-lane lower cabinets can disagree with nearby filler/opening annotations and counter support because gaps have no lane state and are treated as `front`.
- [x] Trace how `InteractiveRender.jsx` and `App.jsx` currently represent row changes versus spacing/nudges
- [x] Inspect `specReducer.js` and `specHelpers.js` for the persisted model shape and reducer implications of true front/back movement
- [x] Decide whether true front/back movement should exist for non-wall cabinets from a state-model perspective
- [x] Return verdict, recommended data shape if applicable, top risks, and recommendation

## Review Notes

- Scope for this pass: state-model and reducer implications only, using the active production files the user named.
- Current persisted model is still run-based, not free-placement:
- `specHelpers.layoutKeyForCabinetRow` only maps cabinets into `wall_layout` or `base_layout`; tall cabinets stay in `base_layout` and are distinguished only by `cab.row === "tall"`.
- `InteractiveRender.jsx` derives all lower/tall x positions from `base_layout` order, all wall x positions from `wall_layout`, and only wall cabinets get an extra persisted placement field (`yOffset`).
- `PLACE_CABINET` in `specReducer.js` moves a cabinet by row + insertion index, and optionally wall `targetYOffset`; there is no non-wall front/back coordinate in state.
- `App.jsx` reinforces that shape:
- load normalization backfills only `width`, `height`, and `depth`.
- keyboard up/down only dispatch `NUDGE_VERTICAL` for `row === "wall"`.
- row changes are explicit `MOVE_ROW` actions, not inferred from drag.
- Verdict from a reducer/state perspective: do not add arbitrary non-wall front/back movement on top of the current model. The current schema only safely represents horizontal slot order plus wall vertical offset.
- If product pressure later forces it, the least-bad schema is a first-class placement object on cabinets, e.g. `placement: { lane: "front" | "back", depthOffset: number }`, while keeping `row` and layout order as separate concepts. Do not overload `depth`, `row`, or gap items to fake this.
- The reducer cost would be broader than one new field:
- `MOVE_ROW`, `PLACE_CABINET`, `LOAD_SPEC`, `ADD_CABINET`, duplication/split/merge, and any helper that totals or rebuilds runs would need explicit rules for how lane/depth placement interacts with lower-run openings, counter segmentation, and default dimensions.
- Recommendation: keep the current model centered on slot placement + explicit row changes unless the team is ready to define non-wall depth lanes as a first-class layout concept across the whole spec.

# Production Editor Free Placement Regression Review (2026-04-21)

- [x] Confirm the active production editor files and state entry points
- [x] Inspect desktop/mobile editor controls that would interact with free placement or row changes
- [x] Inspect reducer/history/autosave behavior for placement-related edits
- [x] Rank the top 5 concrete regression risks with exact file references
- [x] Add final review notes and verdict

## Review Notes

- Highest-risk behavior if row changes are added: `MOVE_ROW` rewrites row, dimensions, and the cabinet ID prefix, but the active editor selection still keys off the old `selectedId`. Without consuming `_movedTo`, the row-changed cabinet immediately loses selection and the bottom editor path goes blank.

# Project/Room Shell Audit (2026-04-22)

- [x] Trace live project create/duplicate/delete flows
- [x] Trace live room create/duplicate/delete flows
- [x] Check frontend actions that can leave a project shell behind
- [x] Inspect local SQLite data to separate active issues from historical artifacts

## Review Notes

- Active bug: project creation persists a zero-room draft immediately and does not clean it up if the user leaves before adding a room.
- Active bug: deleting the last room leaves the parent project behind as a zero-room shell.
- Active bug: duplicating a zero-room project will duplicate the empty shell too.
- Historical data: the local DB has no active zero-room projects today; the empty shell records present are attached only to soft-deleted projects from 2026-04-01/02.

# Destructive Flow Audit (2026-04-23)

- [x] Trace active project create/duplicate/delete flows imported by `App.jsx`
- [x] Trace active room create/duplicate/delete flows in `ProjectDetail.jsx` and `RoomCard.jsx`
- [x] Check backend delete/duplicate helpers for state mismatches with the UI
- [x] Capture only concrete confirmation gaps, misleading success states, and stale-UI issues

## Review Notes

- Deleted projects are still loadable and mutable through direct project routes because `get_project()` does not filter soft-deleted rows, while list queries do.
- Room duplication still lacks a pending/refetch path in `ProjectDetail.jsx`, so repeated clicks can create extra copies and even one successful duplicate can render in the wrong order until reload.
- Room deletion is a hard delete with cascading child-data loss, but the current confirmation copy does not warn about photo/spec/history removal.
- Room deletion does not bump `projects.updated_at`, so project list recency metadata stays stale after a destructive room change.

# UI Parity Review After Lane Feature (2026-04-22)

- [x] Confirm the active production editor path in `App.jsx` still routes desktop and mobile through the expected components
- [x] Inspect `InteractiveRender.jsx`, `CabinetEditBar.jsx`, `BottomSheet.jsx`, `ActionRow.jsx`, and `App.jsx` only
- [x] Compare desktop vs mobile correction affordances for a bad `T1`-style scenario after the lane feature
- [x] Record only concrete desktop/mobile mismatches or affordance gaps with file references

## Review Notes

- Production path still matches the project rules: `InteractiveRender` is shared, desktop uses `CabinetEditBar`, mobile uses `BottomSheet` + `ActionRow`.
- Concrete parity gaps confirmed from the active files:
- Mobile still cannot insert a new filler/opening next to the selected cabinet. Desktop can via `CabinetEditBar` and the 3D context menu; mobile only adds cabinets before/after.
- The render-toolbar `Photo` button is still shown on mobile, but the only photo panel it toggles is desktop-only, so mobile loses in-editor photo reference during correction.
- "Move" is not parity-safe across devices: desktop move buttons nudge openings via `NUDGE_CABINET`, while mobile move buttons reorder via `MOVE_CABINET`.
- Highest-risk behavior if free placement is added on the current drag path: desktop drag still resolves to `NUDGE_CABINET`, which mutates adjacent non-ref layout items rather than storing an independent x-position. That means openings/appliance gaps are likely to be rewritten instead of the cabinet simply moving.
- Alignment is still derived from `wall_layout` order plus `alignment` references, not from persisted wall positions. Moving bases/walls between rows or allowing arbitrary placement will make upper cabinets jump unless alignment semantics are redesigned together.
- Desktop and mobile movement semantics are not equivalent today. Desktop uses nudge + filler semantics; mobile action buttons use neighbor swaps and have no row/vertical placement controls, so parity is a real regression risk.
- Undo/autosave are currently safe because drag emits one action on pointer-up. Live placement updates would need batching/commit semantics or they will flood history, trigger autosave churn, and make conflict recovery much harsher.

# Front/Back Product Review (2026-04-21)

- [x] Review Wall 3 / T1 against the field photo, wireframe, and current production editor paths
- [x] Trace the persisted state model for lower/tall placement, row changes, drag placement, and depth edits
- [x] Decide whether true non-wall front/back movement is the right correction primitive for a cabinet maker
- [x] Record a product recommendation with workflow impact, useful cases, and confusion risks

## Review Notes

- The current production model only persists two placement lanes: `wall_layout` and `base_layout`. Tall cabinets are first-class by `row: "tall"`, but they still live inside the single lower run rather than a separate front/back plan model.
- `InteractiveRender.jsx` now does true slot placement left/right, and wall cabinets can keep a real vertical offset. Non-wall cabinets do not have a persisted front/back coordinate today.
- Desktop and mobile already expose the controls cabinet makers actually use most for correction: left/right slot order, explicit row changes, width/height/depth edits, split/merge, and filler/opening edits.
- On Wall 3, `T1` is fundamentally a "which lower-run slot is this box in?" problem. The successful fix was real slot placement plus explicit row change, not a need to float the pantry forward/back in space.
- From a shop workflow perspective, arbitrary non-wall front/back movement would blur two different ideas that cabinet makers treat separately:
- cabinet depth/projection (how deep the box is), which the editor already captures as `depth`
- layout/run membership (which wall/run/return the box belongs to), which the editor now partly captures with row changes and slot placement
- A free front/back drag would imply room-plan precision the current data model does not actually own. That is risky because a cabinet maker may read a 3D offset as something that should drive cut list, fillers, scribes, or appliance clearances when it is only a cosmetic placement.
- If a future field pattern shows repeated need beyond left/right + row changes, the more useful primitive is an explicit non-wall lane/run control such as `main run` / `return` / `island face` or a simple `flush` / `stepped` offset, not unconstrained front/back dragging.

# Editor Correction Iteration (2026-04-22)

- [x] Re-open the live `Wall 3` screen in Chrome MCP and verify remaining post-lane correction gaps
- [x] Re-run parallel staff-level SWE reviews plus a shop-domain review before the next patch
- [x] Prove in Chrome MCP that new lower cabinets save without explicit `lane`
- [x] Prove in Chrome MCP that mobile `Move` reorders while desktop `Move` still edits spacing
- [x] Prove in Chrome MCP that mobile still cannot insert spacing items next to a cabinet
- [ ] Fix add flows so new cabinets carry explicit placement defaults and inherit nearby placement context
- [ ] Separate slot movement wording from spacing wording so the editor does not lie about what `Move` does
- [ ] Add mobile spacing insertion parity and fix the mobile `Photo` affordance on the render tab
- [ ] Re-verify the full correction flow in Chrome MCP on real `Wall 3` data
- [ ] Deploy, re-test in Chrome MCP on the real site, and restore production data to the clean baseline

## Review Notes

- Chrome MCP proof: adding `B4` on live `Wall 3` saved a new cabinet with no `lane` field at all, while existing lower/tall cabinets did persist `lane`.
- Chrome MCP proof: in mobile layout, `Move ▶` on `B3` reordered the run, while in desktop layout the left arrow on `B3` showed `Warning: move resized the refrigerator gap` and changed the opening widths.
- Chrome MCP proof: mobile `ActionRow` still exposes `Move`, `Split`, `Merge`, `+ Before`, `+ After`, and `Delete`, but no way to insert a filler/opening beside the selected cabinet.
- Reviewer convergence for the next batch:
- Keep the lane feature, but do not pretend it solves every correction problem.
- Make placement defaults truthful, make movement language truthful, and give mobile the same spacing repair power as desktop.

# Editor Correction Iteration 2 (2026-04-22)

- [x] Re-open the active alignment model in code and verify exactly how uppers anchor to lowers today
- [x] Use Chrome MCP on real field data to prove the current editor still lacks a direct upper-alignment correction path
- [x] Decide the smallest truthful editor affordance for fixing bad upper alignment without rewriting extraction
- [x] Implement the alignment correction flow on the active production editor path
- [x] Re-verify the alignment correction flow in Chrome MCP locally on real data
- [x] Deploy, Chrome MCP verify on the real site, and restore production data to the clean baseline

Review:
- Added a real `Align Over` correction flow on desktop and mobile, backed by persisted `alignment` entries instead of fake filler geometry.
- Guardrails now keep alignments one-to-one, reject non-front-base anchors, clear unsafe anchors on split/merge/row/lane changes, and stop stale pick mode from hanging around after selection changes.
- Closed the hidden bypasses that the first fresh-eye review found: aligned uppers no longer move horizontally by drag, an occupied base cannot be silently stolen by another upper, and mobile keeps merge actions even while alignment is active.
- Chrome MCP runtime proof:
- Local localhost-with-prod-data pass: `W3 -> Align Over -> B3` saved `alignment:[{wall:\"W3\",base:\"B3\"}]`, selecting `B3` for `W2` showed `B3 is already anchoring W3`, `Tab` canceled stale pick mode by moving back to `W3`, and a simulated horizontal drag on aligned `W3` produced no extra PATCH.
- Live Fly pass: the deployed build showed the same desktop and mobile `Align Over` controls, saved and cleared `W3 <-> B3` alignment through `PATCH /api/rooms/24ca994d2d3db8de/spec`, and the production room was restored to `alignment: []` afterward.

# Editor Correction Iteration 3 (2026-04-22)

- [x] Re-run fresh-eye staff/domain review after the alignment guardrail batch
- [x] Fix row changes so they preserve measured height/depth and choose the best-fit target slot instead of appending
- [x] Keep stored alignment in sync with geometry edits that make the old anchor impossible
- [x] Close the keyboard slot-move bypass for aligned uppers
- [x] Re-verify the new behavior in Chrome MCP locally against real Wall 3 data
- [ ] Deploy, re-test on the live site in Chrome MCP, and restore production data to the clean baseline

Review:
- `MOVE_ROW` and cross-row placement now preserve the measured box instead of force-converting heights/depths, and the insertion rule picks the slot whose resulting cabinet center is closest to the old center.
- `sanitizeAlignments()` now mirrors the renderer’s actual feasibility rule, so width/order/gap edits stop claiming `Over Bx` when the render can no longer keep that upper over the base.
- Local Chrome MCP proof on localhost proxy with real Wall 3 data:
- Moving `W3` from `wall -> tall` kept `18w 30h 12d`, and moving it back restored the original wall order `W1, W2, W3, W4, W5` instead of drifting right.
- With `W3` aligned over `B3`, `Meta+ArrowRight` showed `Clear Align to edit wall slot` and created no new `PATCH`.
- On mobile, aligned `W3` still showed `+ Before` / `+ After` visually, but clicking `+ Before` created no new network request and did not insert a cabinet, which matches the intended lockout.
- After local verification, the proxied production room was restored to `wall_layout = [W1, W2, W3, W4, W5]` and `alignment: []`.

# Tall Cabinet 3D Controls + Production Audit (2026-04-22)

- [x] Re-open the active desktop/mobile editor and reducer paths to confirm what movement axes already exist for tall cabinets
- [x] Identify the real UX gap between cabinet placement controls and spacing controls before changing the model
- [x] Add truthful desktop controls for tall-cabinet left/right slot placement, up/down vertical movement, and front/back lane movement
- [x] Add matching mobile controls so tall-cabinet 3D movement exists on both editor paths
- [x] Extend the persisted movement model and renderer so tall-cabinet vertical movement actually saves and renders correctly
- [x] Re-verify the new 3D movement controls in Chrome MCP on real production data through localhost proxy
- [x] Deploy the updated editor and re-verify the shipped behavior in Chrome MCP
- [x] Open every production project in Chrome MCP, spot-check each room/render/photo/editor state, and capture ranked suspicious findings

## Review Notes

- Desktop currently exposes spacing edits (`Space ←`, `→ Space`) where a cabinet maker would expect placement controls, so the bottom bar still lies about what "move" means.
- `T1` already has persisted left/right slot placement and front/back lane placement, but tall cabinets still have no persisted vertical movement path. Only wall cabinets own `yOffset`.
- Mobile already has honest slot-move controls, so the parity gap is now mostly desktop placement wording plus missing tall up/down controls on both paths.
- Chrome MCP proof on localhost proxy with real Wall 3 data:
- Desktop now shows `← Slot`, `Slot →`, `↑`, `↓`, and the existing `Space ←`, `→ Space` separately when `T1` is selected.
- Clicking `↑` on `T1` saved `yOffset: -3`, clicking `back` saved `lane: "back"`, and clicking `← Slot` reordered `base_layout` so `T1` moved ahead of the refrigerator opening.
- Mobile now shows the same full movement set for `T1`: `◀ Slot`, `Slot ▶`, `▲ Up`, `Down ▼`, plus the existing `Front` / `Back` lane pills.
- Regression check still passed: `B3 -> → Space` warned `Warning: spacing edit resized the refrigerator gap` and changed the opening without breaking undo.
- After verification, the proxied production room was restored to the clean baseline: `base_layout = [range, B2, B3, fridge, T1]`, `T1.lane = "front"`, `T1.yOffset = 0`.
- Fly deploy completed from commit `9e7364e` as image `registry.fly.io/cabinet-estimator:deployment-01KPVK6CX0SQ97XJP7BQ28Y2M9`.
- Chrome MCP live proof on `cabinet-estimator.fly.dev`:
- `Wall 3` now ships the new desktop controls for `T1`: `← Slot`, `Slot →`, `↑`, `↓`, `front`, and `back`.
- Clicking live `↑` on `T1` saved `yOffset: -3` in `PATCH /api/rooms/24ca994d2d3db8de/spec`, confirming the deployed build persists tall vertical movement.
- After the live proof, `Wall 3` was restored again to `T1.lane = "front"` and `T1.yOffset = 0`.
- Chrome MCP production audit findings after opening every project and scanning every room via the live `/api` from the browser:
- `P1` Duplicate/copy media loss: `The Heights by Marston Lake (copy)` keeps its room specs, but all 3 rooms have `photo=false` and `wireframe=false`, and the room UI no longer shows a `Photo` tab.
- `P1` Duplicate empty projects exist: `Lambertson Farms 1516` (`1165b9e914a1aab8`) and `Lambertson Farms 631` (`e8036b825308817c`) both open to `0 rooms · 0 walls`, which looks like duplicate/project-creation leakage rather than a real project state.
- `P2` Empty unfinished room remains in production: `Bell` → `Wall 1` (`067d7a058d10ca15`) opens to the fresh extraction/upload screen with no photo, no wireframe, and no cabinets.
- `P2` Upper alignment still looks under-modeled across field data: 24 live rooms have both base and wall cabinets but `alignment: []`. I spot-checked `Velo A104` → `Wall 1`, and it does render with no persisted alignment anchors at all.

# Desktop Edit Bar Fit Fix (2026-04-22)

- [x] Re-check the live desktop `T1` editor in Chrome MCP and confirm the new movement controls overflow the fixed-width shell
- [x] Inspect the active desktop editor path and confirm the squeeze is in `CabinetEditBar.jsx`, not a hidden parent clip
- [x] Restructure the desktop edit bar so identity/setup/dimensions stay readable and action controls get their own wrapped row
- [x] Verify the new layout in Chrome MCP on real `Wall 3` data and iterate if the bar still feels cramped
- [x] Build, commit, push, deploy, and re-verify the shipped layout in Chrome MCP once the fit is clean

## Review Notes

- The desktop shell is still capped by `#root { width: 1126px; max-width: 100%; }`, so the bottom editor has a real width ceiling even on large monitors.
- The overflow bug is mostly self-inflicted inside `CabinetEditBar`: row 1 was still one rigid strip with label, type pills, row/lane controls, dimensions, and every edit action fighting for the same line.
- The cleanest fix is a two-tier desktop bar:
- top row = cabinet identity, label, type/row/lane or alignment controls, and dimensions
- second row = movement, spacing, merge, add, duplicate, and delete actions with wrapping
- Chrome MCP local proof on real `Wall 3` data:
- `T1` now renders with a clean two-row editor: top row for label/type/row/lane + dimensions, second row for slot/up/down/space/add actions.
- The denser `B3` editor also fits cleanly with merge + filler + duplicate actions still visible.
- DOM measurements in Chrome MCP show both the top row and action row at `scrollWidth === clientWidth === 1124` on the fixed-width desktop shell.
- Fly deploy shipped from commit `2e9f7f7` as image `registry.fly.io/cabinet-estimator:deployment-01KPW5PQZ7HMAWJ2QZP6ERZQWN`.
- Chrome MCP live proof on `cabinet-estimator.fly.dev` matches the local fix after a hard reload:
- `T1` shows the two-tier desktop bar with no clipped movement controls.
- `B3` still fits with the heavier base-cabinet action set, including merge.

# Tall Front/Back Axis Fix (2026-04-22)

- [x] Reproduce the current `T1` front/back complaint in Chrome MCP on real `Wall 3` data
- [x] Confirm whether the existing `front/back` control is only a snap preset instead of a true movement axis
- [x] Add a true saved front/back movement control for tall cabinets in both desktop and mobile editor paths
- [x] Verify the new front/back movement locally in Chrome MCP against production data, then deploy and re-verify on the live site

## Review Notes

- Chrome MCP live proof showed the current `back` pill does save and visibly shifts `T1`, but it is only a lane preset, not the same kind of direct movement control as `left/right` or `up/down`.
- That mismatch is why the feature still feels missing in practice: the editor has a front/back mode switch, not a real front/back move axis.
- Fix shipped in commit `69eb92f` and Fly image `registry.fly.io/cabinet-estimator:deployment-01KPW6SW8XPACMC9FYG1E36VGV`.
- Desktop now exposes both concepts separately:
- `front lane` / `back lane` snap the cabinet to a lane.
- `↙ Front` / `Back ↗` move the cabinet along a saved depth axis without changing its lane.
- Mobile exposes the same split between `SNAP LANE` and `↙ Front` / `Back ↗`.
- Local Chrome MCP against production data proved the new axis is real:
- starting state for live `T1` was `lane: "back", yOffset: 8, depthOffset: 0`
- clicking `Back ↗` changed the saved room payload to `depthOffset: 6`
- clicking `↙ Front` restored `depthOffset: 0`
- Live Chrome MCP on `https://cabinet-estimator.fly.dev/project/3389c9e8abb7ae8b/room/24ca994d2d3db8de` matched local after deploy:
- desktop `T1` shows `front lane`, `back lane`, `↙ Front`, and `Back ↗`
- the undo label changes to `Undo: Shift T1 back`
- the live room payload changes from `depthOffset: 0` to `depthOffset: 6`
- the room was restored after verification to `depthOffset: 0`

# Counter Projection Fix (2026-04-22)

- [x] Reproduce the bad `T1` counter state in Chrome MCP using the real `Wall 3` room data
- [x] Trace the counter render path and identify why depth-moved tall cabinets visually overlap the countertop
- [x] Implement the minimal render fix so counter segments clip against the moved tall cabinet silhouette
- [x] Verify locally in Chrome MCP against production data, deploy, and re-verify on the live site

## Review Notes

- The broken state came from mixing two different coordinate systems:
- `T1` was drawn from its shifted 3D position (`lane` + `depthOffset`)
- the counter segments were still built from the old slot boundaries
- In the bad state (`T1` back lane, `depthOffset: 18`, refrigerator gap on the right), the right-side counter segment started inside the pantry's projected body, so the countertop looked like it was coming through the cabinet.
- The fix clips counter segments against the projected x-range of every tall cabinet before rendering them.
- Local Chrome MCP on `localhost` with production room data proved the visual fix on the exact bad state: the right-side counter now starts to the right of `T1` instead of cutting through it.
- Live Chrome MCP on `https://cabinet-estimator.fly.dev/project/3389c9e8abb7ae8b/room/24ca994d2d3db8de` matched the local proof after deploy:
- production kept the same weird layout state (`Base 194"`, `Tall 30"`, `Refrigerator 110"`, `T1 depthOffset: 18`)
- the counter no longer exits through the pantry side in that exact state
- proof screenshots:
- local: `/Users/william/estimator/tasks/local-counter-fix.png`
- live: `/Users/william/estimator/tasks/prod-counter-fix.png`

# Site-Wide Chrome Audit (2026-04-22)

- [ ] Inventory every live project and room reachable from the production site in Chrome MCP
- [ ] Spot-check each room across list view, photo access, 3D render, and active editor path
- [ ] Log concrete runtime bugs with reproduction notes and trust-impact ranking
- [ ] Fix the highest-risk issues first and re-verify each one in Chrome MCP locally against production data
- [ ] Deploy fixes and re-run the affected production flows in Chrome MCP
- [ ] Do a fresh-eye second sweep after fixes to catch newly visible regressions

## Review Notes

- This audit is runtime-first: every bug has to be seen or reproduced through Chrome MCP before it gets ranked.
- Priority order for fixes during the sweep:
- editor truth bugs (what you see is not what saves)
- render lies (wireframe/3D shows physically impossible geometry)
- missing correction affordances
- broken navigation/photo access/room recovery flows

# Legacy Tall Layout Normalization (2026-04-22)

- [x] Reproduce the `Desk / Wall 1` production room where saved spec data disagrees with the 3D/editor state
- [x] Trace whether the bug comes from current extraction output or from legacy saved schema still living in production data
- [x] Normalize legacy `tall_layout` specs and tall-looking lower cabinets into the current lower-run schema on load/save
- [x] Verify locally in Chrome MCP with the exact broken field spec before committing
- [ ] Deploy and re-verify the production room, then repair the live record if the normalized payload still is not persisted

## Review Notes

- Root cause was a legacy schema, not fresh extraction logic:
- `Resort at University Park 1715A` → `Desk` → `Wall 1` still stored `tall_layout: [{ref: "T1"}]`
- that same room also had `B2` saved as `row: "base"` with `height: 84`, which made it visually tall but semantically base
- The current frontend only treats `base_layout` + `wall_layout` as first-class, so it was quietly appending orphan tall refs on load and rendering a half-healed state.
- The normalization fix now:
- folds legacy `tall_layout` items into the lower run
- upgrades non-wall cabinets that clearly look tall (`tall_*` type, legacy tall ref, or height `>= 72`) into `row: "tall"`
- re-homes refs into the correct layout arrays and drops legacy `tall_layout` on save
- Local Chrome MCP proof using the exact broken production spec shape:
- header totals corrected from the old live-style lie (`Base 66"`, `Tall 24"`) to the truthful `Base 48"`, `Tall 42"`
- `B2` now opens with tall controls (`pantry/oven`, lane, front/back, up/down) instead of base controls
- saved local payload no longer contains `tall_layout`, and `B2` persists as `row: "tall", type: "tall_pantry"`
# Empty Room Audit (2026-04-22)

- [x] Review task constraints and lessons before touching the audit
- [x] Trace backend room creation, persistence, and extraction requirements for rooms with missing assets
- [x] Trace frontend project detail and room editor behavior for rooms with no photo, no wireframe, and no spec
- [x] Check whether current local data contains fully empty room rows
- [x] Classify each finding as bug, intentional draft behavior, or ambiguous

## Review

- Backend intentionally persists draft room rows before any asset exists. `create_room()` inserts a `rooms` row with `spec_version=0` and `cabinet_count=0`, but no `photo_id`, `wireframe_id`, or `spec_json`, and the API returns that row immediately for the UI flow. Evidence: `extractor/server.py`, `extractor/db.py`.
- Project detail intentionally renders every persisted room row. `get_project()` returns all rooms for a project and only computes `thumb_url` plus `has_spec`; `ProjectDetail` then groups and renders every room without filtering for missing assets. Evidence: `extractor/db.py`, `renderer/src/pages/ProjectDetail.jsx`.
- The current UI only flags one incomplete state: `has_spec === false` becomes `No extraction`. A fully empty room, a photo-only draft, and a failed/never-finished extraction all collapse into the same visual treatment. Evidence: `extractor/db.py`, `renderer/src/components/RoomCard.jsx`.
- Opening an empty room is a supported path, not an accidental crash path. `EditorApp` loads rooms with no spec into `mode === "home"` and shows the upload/extract onboarding screen, while server-side extraction explicitly rejects rooms that still lack `photo_id`. Evidence: `renderer/src/App.jsx`, `extractor/server.py`.
- Current local data proves the path is active in practice: `sqlite3 data/estimator.db` shows 5 room rows where `spec_json`, `photo_id`, and `wireframe_id` are all null.

# Draft Shell Guardrails (2026-04-22)

- [x] Prevent empty projects from being duplicated into more empty shells
- [x] Make empty project cards read as intentional drafts instead of broken data
- [x] Distinguish empty/photo-only/ready/extracted room states in the project detail grid
- [x] Guard create-project, create-room, and add-wall flows against double submit
- [x] Verify the new draft-shell behavior in Chrome MCP locally before shipping

## Review

- Backend duplication now rejects zero-room projects with `400 Project has no rooms to duplicate` instead of cloning another empty shell. Evidence: `extractor/db.py`, `extractor/server.py`.
- Project cards now show `No rooms yet` for zero-room drafts and disable the duplicate action as `Nothing to duplicate` instead of pretending the project is a normal copy candidate. Evidence: `renderer/src/components/ProjectCard.jsx`, `renderer/src/pages/ProjectList.jsx`.
- Room cards now distinguish the real draft states:
- `Draft · no photo` for a brand-new empty wall
- `Photo added` for a photo-only draft
- `Ready to extract` when photo + wireframe exist but no spec yet
- `Extracted` once a spec exists
- Create-project, create-room, and add-wall actions now hold a local pending lock so a double click only persists one record. Evidence: `renderer/src/pages/ProjectList.jsx`, `renderer/src/pages/ProjectDetail.jsx`.
- Local Chrome MCP proof:
- double-clicking `Create` on a new project produced exactly one project (`Temp Empty Draft 2`) and landed on a zero-room detail page
- that detail page showed `No rooms yet`
- browser `fetch()` from Chrome MCP to `POST /api/projects/{id}/duplicate` returned `400 {"detail":"Project has no rooms to duplicate"}`
- double-clicking `Create` for `Draft Room` only created one room
- double-clicking `Add` for `Wall 2` only created one new wall, leaving the room at `2 walls`
- the project detail grid labeled both new walls as `Draft · no photo`

# Last-Room Delete Cleanup (2026-04-22)

- [x] Reproduce whether deleting the last room in a project leaves an empty shell behind
- [x] Decide the desired behavior for that flow
- [x] Implement backend + project-detail cleanup for last-room deletion
- [x] Verify the delete flow locally in Chrome MCP before shipping
- [x] Deploy and re-verify the delete flow on the live site in Chrome MCP

## Review

- Live repro before the fix: a throwaway production project (`Audit Temp 884438`) with one room still existed as a `No rooms yet` shell after its only room was deleted.
- Chosen behavior after staff review: deleting the last room should not auto-delete the project. Empty projects are already a first-class draft state, so the safer fix is a warning before the final room is removed and then a clean transition into the existing empty-project screen.
- Backend change: `delete_room()` still returns structured success info, but it no longer soft-deletes the parent project on last-room delete. Evidence: `extractor/db.py`, `extractor/server.py`.
- Frontend change: `ProjectDetail` now warns only when the user is deleting the last remaining room: `Delete the last room? The project will stay as an empty draft.` After confirmation, the page re-renders into the empty-project state instead of leaving the user guessing. Evidence: `renderer/src/pages/ProjectDetail.jsx`.
- Local Chrome MCP proof:
- created `Delete Warning Temp 309380` with one room and one wall
- opened the room card `···` menu, clicked `Delete`, and accepted the confirmation dialog
- the project detail page stayed on the same project and re-rendered to `No rooms yet`
- browser `fetch()` after the delete still returned the project with `room_count: 0`, confirming the empty draft survives
- Live Chrome MCP proof:
- created `Live Delete Warning 488075` with one room and one wall on production
- opened the room card `···` menu, clicked `Delete`, and accepted the confirmation dialog
- the live project detail page stayed on the same project and re-rendered to `No rooms yet`
- browser `fetch()` after the delete still returned the project with `room_count: 0`
- cleaned up the temporary live project afterward with `DELETE /api/projects/146bea0eb72de568`

# Project Delete Confirmation (2026-04-22)

- [x] Reproduce whether project delete fires immediately without any warning
- [x] Add a confirmation step to the project-list delete action
- [x] Verify the confirmation locally in Chrome MCP
- [x] Deploy and re-verify the confirmation on the live site in Chrome MCP

## Review

- Live repro before the fix: deleting `Live Project Delete 617962` from the project-list card menu removed it immediately with no confirmation dialog.
- Fix: `ProjectList.handleDelete()` now asks for confirmation before deleting a project, using a slightly different prompt for empty drafts vs projects that still have rooms. Evidence: `renderer/src/pages/ProjectList.jsx`.
- Local Chrome MCP proof:
- created `Delete Confirm Temp 765794`
- opened the project card `···` menu and clicked `Delete`
- dismissing the confirmation dialog left the project card in place
- repeating the delete and accepting the dialog removed the project card from the list
- Live Chrome MCP proof:
- created `Live Project Confirm 947935`
- opened the project card `···` menu and clicked `Delete`
- dismissing the confirmation dialog left the project card in place
- repeating the delete and accepting the dialog removed the project card from the live list
- follow-on issue discovered: the deleted project still loads by direct URL because project fetches do not currently filter `deleted_at`

# Deleted Project URL Hardening (2026-04-22)

- [x] Reproduce that a deleted project still loads by direct URL
- [x] Make project and room fetches ignore soft-deleted parent projects
- [x] Add a real not-found state to the room wrapper so deleted-room URLs do not hang
- [x] Verify the deleted project and deleted room URLs locally in Chrome MCP
- [ ] Deploy and re-verify the deleted URL behavior on the live site in Chrome MCP

## Review

- Live repro before the fix: after deleting `Live Project Delete 617962`, opening `/project/e4852a30c5486b00` still rendered the deleted project instead of a not-found state.
- Backend fix: `get_project()` now filters out soft-deleted projects, and `get_room()` now joins through the parent project so rooms under deleted projects also disappear. Evidence: `extractor/db.py`.
- Frontend fix: `RoomEditorWrapper` now distinguishes loading from missing and renders `Project not found.` or `Room not found.` instead of sitting on an endless loading screen when the backend returns 404. Evidence: `renderer/src/App.jsx`.
- Local Chrome MCP proof:
- created and deleted `Deleted URL Temp 170598`
- opening `/project/d3ae00c1bc3b5f9e` showed `Project not found.`
- opening `/project/d3ae00c1bc3b5f9e/room/ec350071e7cf734e` also failed cleanly instead of hanging

# Project Load Error States (2026-04-22)

- [x] Separate real 404s from generic load failures on project pages
- [x] Verify the new failure messaging locally in Chrome MCP with injected fetch failures
- [x] Deploy and re-verify the failure messaging on the live site in Chrome MCP

## Review

- Problem: `ProjectDetail`, `ProjectCutList`, and `RoomEditorWrapper` were treating every failed project fetch like a missing project, so offline/500 cases lied to the user with `Project not found.`
- Fix: those surfaces now track `404` separately from other errors and render `Failed to load project.` for generic load failures. They also clear stale project data when the route changes. Evidence: `renderer/src/pages/ProjectDetail.jsx`, `renderer/src/pages/ProjectCutList.jsx`, `renderer/src/App.jsx`.
- Local Chrome MCP proof with injected browser-side fetch failures:
- from the project list, failing `/api/projects/1730a82716a3e412` and opening `My Cabinet Project` showed `Failed to load project.`
- from project detail, failing that same project fetch and opening `Kitchen Wall` showed `Failed to load project.` in the room wrapper instead of an endless loading state
- Live Chrome MCP proof with injected browser-side fetch failures:
- from the live project list, failing `/api/projects/3389c9e8abb7ae8b` and opening `The Heights by Marston Lake` showed `Failed to load project.`
- from live project detail, failing that same project fetch and opening `Wall 3` showed `Failed to load project.` in the room wrapper
