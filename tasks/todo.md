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
