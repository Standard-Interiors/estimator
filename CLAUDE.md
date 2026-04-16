## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 4b. Iterations Mean FULL CYCLES — Not Pre-Planned Checklists
- An "iteration" is: implement ALL fixes, verify they work, then look with COMPLETELY FRESH EYES and find what's STILL wrong. Repeat.
- WRONG: Splitting a pre-planned list of fixes into numbered "iterations" (that's theater, not engineering)
- RIGHT: Each iteration discovers NEW problems that only became visible after the previous round of fixes
- Each iteration should produce staff-level insight — not just check boxes off a list
- If you find yourself writing "Iteration 1: do X, Iteration 2: do Y" before starting — you're cheating

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## HARD CONSTRAINTS — Cabinet Maker Tool

### This is NOT a kitchen tool. It is a cabinet maker's tool.

**We are cabinet makers.** Cabinets go in kitchens, bathrooms, laundry rooms, offices, garages, entertainment centers, mudrooms, closets, and anywhere else. ALL code, UI text, prompts, variable names, comments, and documentation MUST be room-agnostic. Never say "kitchen" — say "space", "room", or "layout".

### Product Goal — AI Gets You 80%, Editor Gets You to 100%

**The AI extraction will NEVER be perfect. That is by design.** The AI's job is to get the cabinet maker 80% of the way there — correct count, roughly correct sizes, right layout order. The EDITOR is the product. The editor gives users fast, easy tools to correct the last 20% (tap a width chip, type a height, merge two cabinets, drag to reorder).

**Do NOT chase extraction perfection by rewriting prompts.** Prompt tweaking is a black hole — it fixes one project and breaks another. Instead, invest in making the editor corrections faster and easier. Every minute saved in the editor is worth more than a 2% accuracy improvement in extraction.

### HARD CONSTRAINT — Do NOT Change Extraction Prompts

**The extraction prompts in `pipeline.py` are FROZEN.** Do not rewrite, expand, or "improve" them without explicit user approval. Prompt changes:
- Are unpredictable — fixing one case breaks others
- Cannot be tested without running extraction on dozens of real photos
- Create false confidence ("the prompt is better now" with no proof)

If extraction accuracy needs improvement, the fix is almost always in the **pipeline logic** (better voting, better validation, better defaults) — not in the prompt text.

### Extraction Priority — CABINETS ONLY

The extraction system exists to identify **cabinets**. Nothing else matters.

**Priority order:**
1. **Recognize every cabinet** — count every separate box, don't merge adjacent units
2. **Get the size right** — width, height, depth measured from the photo (NOT forced to standard sizes)
3. **Get the position right** — left-to-right order, which row (upper/lower/tall)

### HARD CONSTRAINT — Cabinet Count Must Be 100%

**The number of cabinets detected can NEVER be off.** Widths can be adjusted later in the editor. Positions can be corrected. But a MISSING cabinet means the cabinet maker doesn't know it exists — that's a showstopper.

- It is BETTER to over-detect (find a cabinet that isn't there) than to under-detect (miss one that is)
- Every vertical seam = a separate cabinet. Period.
- Two single-door units side by side = TWO cabinets, not one double-door
- A narrow 9" pullout is still a cabinet — don't skip it because it's small
- Short stackers above the fridge are cabinets — don't skip them because they're short
- If in doubt, split it into two cabinets rather than merge into one

**Extraction prompts must emphasize counting FIRST, sizing SECOND.** The AI must enumerate every box before it starts estimating widths. Fixes to extraction accuracy must be GENERAL — they must work for any room with any number of cabinets, not just the current test image.

**Appliances, fridges, ranges, dishwashers are NOT cabinets.** They are just GAPS — empty spaces between cabinets that affect positioning. Don't spend extraction effort identifying what appliance goes in a gap. A gap is a gap. Label it "opening" with a width and move on.

**Do NOT optimize for:**
- Appliance identification (range vs dishwasher vs fridge — irrelevant to cabinet maker)
- Countertop material or style
- Hardware or finish details
- Room type identification

**A cabinet maker looks at the extraction and asks:**
- "Are all my boxes accounted for?"
- "Are the widths right?"
- "Is the layout order correct?"

If the answer to those three questions is yes, the extraction is good. Everything else is noise.

## HARD CONSTRAINT — Chrome MCP Verification Before Every Commit

**NEVER commit code without verifying it works in Chrome MCP first.** Every change that touches UI or API must be tested via Chrome MCP — never curl. No exceptions.

- If you changed frontend code: take a Chrome MCP screenshot proving the change works
- If you changed backend code: trigger it from the UI in Chrome MCP and verify with a screenshot
- If you changed both: verify the full flow end-to-end in Chrome MCP
- **NEVER use curl for testing.** Always test through the real UI in Chrome MCP. Curl is lazy and misses UI integration bugs.
- A build passing (`vite build`) is NOT sufficient — you must verify runtime behavior
- If Chrome MCP is unavailable, explicitly tell the user you could not verify
- **Chrome MCP cannot navigate to fly.dev.** To test production data: temporarily change `api.js` BASE to `https://cabinet-estimator.fly.dev`, test on `localhost:5173`, then REVERT before committing. This gives real prod data with Chrome MCP access.
- **Always test on REAL field data, not local test projects.** Local projects don't surface the same issues as field data (weird angles, non-standard sizes, closet doors confused for cabinets).

**Why:** Bugs that ship because "it compiled" waste the user's time and erode trust. The photo_bytes bug was introduced because the extraction function signature was changed in server.py without verifying the actual extraction flow worked.

## HARD CONSTRAINT — Know the Codebase Before Touching It

### Dead Code Exists — Don't Waste Time on It

- `renderer/src/editor/GridWorkspace.jsx` — **NOT IMPORTED ANYWHERE.** Dead code.
- `renderer/src/editor/GridEditor.jsx` — **NOT IMPORTED ANYWHERE.** Dead code.
- The ACTUAL production editor is `InteractiveRender.jsx` + `CabinetEditBar.jsx` (desktop) and `BottomSheet.jsx` + `ActionRow.jsx` (mobile).
- Before fixing any editor file, verify it's actually imported in `App.jsx`.

### Desktop vs Mobile Editor Paths

- **Desktop** (≥768px): `InteractiveRender.jsx` renders the 3D SVG, `CabinetEditBar.jsx` is the bottom edit bar, right-click context menu is in `App.jsx`.
- **Mobile** (<768px): Same `InteractiveRender.jsx` for 3D, but `BottomSheet.jsx` replaces `CabinetEditBar.jsx`, and `ActionRow.jsx` has Split/Move/Merge/Delete buttons.
- **Any new editor feature must exist in BOTH paths** or the user will find it missing on one device.

## HARD CONSTRAINT — Project Manager Evaluation Standard

### Be brutally critical. No self-congratulation.

---

