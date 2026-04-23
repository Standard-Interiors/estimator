# Lessons Learned

Updated: 2026-04-22

---

## Extraction Accuracy — Patterns from Field Testing

### 1. Heights are the #1 wrong dimension
The AI defaults to 34.5" (base) and 30" (wall) almost every time. Real cabinets vary:
- **Bathroom vanities**: 26", 28", 31" are common
- **Wall stackers**: 12", 15", 17.5" above appliances
- **Desk-height bases**: 28-30"
- **Tall uppers**: 36", 42"

**Fix direction**: The extraction prompt should tell the AI to MEASURE height from the photo proportionally, not assume defaults. The prompt currently says "Standard base height: 34.5" which biases the model toward defaults even when the photo clearly shows shorter cabinets.

### 2. Two singles vs one double-door is a recurring miss
The AI frequently extracts a double-door cabinet as two separate single-door cabinets (e.g., W1+W2 should be one 32" double). This violates the "every vertical seam = separate cabinet" rule from CLAUDE.md only when there IS no vertical seam — a double-door cabinet has a CENTER STILE, not a cabinet-to-cabinet seam.

**Fix direction**: The extraction prompt needs to distinguish "two doors on one box" from "two adjacent single-door boxes." Cue: if two doors share a continuous top/bottom rail with no visible box-to-box gap, it's ONE cabinet with 2 doors.

### 3. Appliance gap widths come from the opening, not the appliance
Fridge openings vary: 30", 33", 36". The AI sometimes guesses standard appliance width instead of measuring the actual opening. The gap width should match what's IN the photo, not what a standard fridge is.

**Fix direction**: Prompt should say "measure the opening width, don't guess the appliance size."

### 4. Standard widths bias is still in the extraction prompt
Line 50 of pipeline.py says "Use standard cabinet widths ONLY" — but we already fixed the editor to accept non-standard widths. The extraction prompt is still forcing the AI to snap. This creates unnecessary corrections for the field tester.

**Action item**: Remove "ONLY" from that line or reword to "prefer standard widths but use the actual width if it clearly doesn't match a standard size."

---

## Editor UX — What Testers Actually Need

### 5. Split must be on desktop too
Split was mobile-only (BottomSheet → ActionRow). Desktop users had no way to split without mobile layout. Fixed this session — added "Split in Half" to right-click context menu.

### 6. Non-standard widths must survive the full pipeline
Previous bug: the editor snapped typed widths to standard sizes (snapToStandard). Testers would type 33 and get 30. Fixed in prior session — editor now uses quarter-inch rounding only.

### 7. Exclude-from-cutlist is essential for multi-photo projects
When a room has multiple photos with overlapping cabinets, the same cabinet appears twice. Testers need to flag duplicates so the cut list doesn't double-count. This feature works — yellow dashed outline + cut list exclusion.

---

## Testing & Deployment

### 8. Chrome MCP cannot access fly.dev
The Claude in Chrome extension blocks all non-localhost domains from Claude Code's MCP connection. Workaround: temporarily point `api.js` BASE at production API, test on localhost, revert after. This gives real production data with Chrome MCP access.

### 9. Always verify on REAL field data, not test projects
Local test projects don't surface the same issues as field data. Tester photos have weird angles, non-standard sizes, overlapping walls, closet doors confused for cabinets. Always QA against actual field projects.

### 9b. If the user explicitly asks for production runtime verification, use the real site
Do not default back to localhost once the user has redirected verification to production. If they say to use `https://cabinet-estimator.fly.dev/`, keep the browser pass on the live site unless they explicitly change that instruction again.

### 9c. Prefer Chrome DevTools MCP over fallback browser drivers for verification
If the user says to use Chrome MCP, do not drift into Computer Use unless they explicitly approve a fallback. Fix the DevTools MCP transport first, because that is the verification path they actually want.

### 10. Dead code is a maintenance trap
GridWorkspace.jsx and GridEditor.jsx are not imported anywhere but received code fixes. Wasted effort. Should be deleted or clearly marked as deprecated.

---

## Extraction Accuracy — Velo A104 Field Testing (2026-04-16)

### 11. Vanity face sections default wrong
The AI defaults to false_front + door for bathroom vanities. Real vanities often have drawer banks: 3 small drawers across the top row, double doors below, then 1-2 full-width drawers at the bottom. The extraction prompt has no vanity-specific guidance.

**Fix direction**: Add vanity layout hint to the prompt: "Bathroom vanities typically have a row of small drawers across the top (not false fronts), double doors in the middle, and full-width drawers below."

### 12. Upper cabinet alignment defaults to left — should follow context
Wall cabinets default to left-aligned with the first base cabinet. But in real layouts, uppers often right-align over an appliance gap (e.g., uppers pushed right to sit above the dishwasher, not over the sink). The AI should use spatial context from the photo.

**Fix direction**: The alignment logic in the extraction prompt should say "align wall cabinets above the base cabinets they visually sit over in the photo, not just left-to-right."

### 13. Drawer count matters — "drawer bank" needs exact count
When a cabinet has stacked drawers (like a 4-drawer base), the AI often gets the count wrong (3 instead of 4, or 2 instead of 3). Each drawer = a cut list line item, so missing one means a missing part.

**Fix direction**: Prompt should emphasize "count every visible drawer front, including small top drawers that may look like false fronts but have pulls/handles."

### 14. Widths are closer but still off by 3-6" regularly
Across Lambertson 1516 and Velo A104, the AI consistently under- or over-estimates widths by 3-6 inches (e.g., 18w when real is 21w, 36w when real is 33w). Standard-width snapping (lesson #4) makes this worse — a 21" cabinet gets snapped to 18" instead of staying at 21".

**Pattern**: The AI rounds to the nearest standard size even when the photo proportions clearly show something different. Removing the "ONLY" constraint from the prompt would let non-standard widths through.

### 15. Editor safety should warn before it restricts
If a move can resize a real opening or appliance gap, do not hard-block the cabinet maker unless they asked for that constraint. Keep the edit flexible, let the move happen, and show a short warning so the user stays in control.

### 16. Do not claim a visual fix without a fresh Chrome MCP check
If the user questions whether a UI/layout issue is actually fixed, stop asserting and re-open the exact live screen in Chrome MCP. Compare the render against the photo/wireframe and report what is visibly true before making any more claims.

### 17. Verify editability, not just appearance
If the user is talking about fixing AI output in the editor, a correct-looking render is not enough. In Chrome MCP, test the actual edit affordance they care about: move, reorder, change row, split, merge, or retype. Report interaction limits separately from visual correctness.

### 18. When the editor needs more freedom, prefer slot placement over fake geometry edits
If 3D drag is supposed to let the cabinet maker fix AI layout mistakes, do not keep routing it through nudge math that only stretches nearby gaps. Keep layout order as the source of truth, make drag commit a real slot change, and expose row changes explicitly instead of hiding them behind unpredictable drag behavior.

### 19. Verify the missing movement axis before answering like the feature exists
If the user asks how to move something in a direction like front/back, do not infer that the new placement system already supports that axis. Re-check the active editor controls and reducer model first, then answer with the exact current capability gap before promising the next fix.

### 20. Use Chrome MCP for all verification unless the user explicitly changes that
If runtime behavior needs to be checked, stay inside Chrome MCP for the full verification loop instead of mixing in other browser drivers or partial fallbacks. If Chrome MCP gets awkward, solve the interaction problem there rather than silently switching tools.

### 21. When the user asks for sustained iteration, one clean batch is not a stopping point
If the user explicitly asks for a long-running multi-iteration push, do not treat a successful patch/deploy cycle as the natural end of the turn. Finish the batch, then immediately start the next fresh-eye review cycle and keep going until you hit a real blocker or the user redirects.

### 22. Temporary editor modes need full event-path audits, not just button lockouts
When adding a mode like Align Over, do not stop after wiring the visible controls. Audit every other input path that can mutate the same state: pointer-down, click, drag, keyboard navigation, selection jumps, and mobile action rows. If the mode changes what a tap means, duplicate event paths will create stale state or bypass the guardrails.

### 23. Do not claim elapsed effort you did not actually put in
If the user asked for a multi-hour push, do not summarize the work as if that full duration already happened unless it really did. Report the actual state of the iteration honestly: what was implemented, what was verified, and what is still in flight.

### 24. New editor controls must be verified for fit, not just existence
If you add buttons or pills to the desktop editor, do not stop after confirming the feature works. Re-open the real screen in Chrome MCP and check that the full bar still fits inside the production shell width. If the controls crowd each other, regroup them into rows before shipping instead of shrinking labels or pretending the overflow is acceptable.

### 25. A lane preset is not the same thing as a movement axis
If the user asks for front/back movement, a `front/back` preset pill does not satisfy that request by itself. Re-check the live screen and make sure there is a true movement control for that axis, plus a visible render change strong enough that the cabinet maker can tell the cabinet actually moved.
