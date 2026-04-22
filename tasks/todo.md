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
