"""
Structured extraction pipeline — breaks cabinet extraction into discrete,
retriable steps:

  Step 1: count_cabinets     — cheap Gemini call, count every box
  Step 2: generate_wireframe — Gemini image gen, photo → wireframe
  Step 3: extract_dimensions — main extraction, uses count + wireframe + photo
  Step 4: solve_to_standard  — pure code, snap widths to standard sizes
  Step 5: validate           — pure code, check structural integrity
"""

import json
import re
import time
from typing import Optional

STANDARD_WIDTHS = [9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48]

# ---------------------------------------------------------------------------
# Step 1: Count cabinets
# ---------------------------------------------------------------------------
COUNT_PROMPT = """You are a cabinet counting system for professional cabinetmakers.
Look at this photo and count every SEPARATE cabinet box you can see.

RULES:
- Every vertical seam = a separate cabinet. Two single-door units side by side = TWO cabinets.
- Narrow pullouts (9") are still cabinets — don't skip them.
- Short stackers above the fridge are cabinets — don't skip them.
- Appliances (fridge, range, dishwasher) are NOT cabinets — they are gaps/openings.
- Count base cabinets (floor-mounted) and wall cabinets (upper) separately.

Respond with ONLY valid JSON:
{"base_count": <number>, "wall_count": <number>, "tall_count": <number>, "descriptions": [{"id": "B1", "row": "base", "brief": "single door left of sink"}, ...]}

List every cabinet left-to-right. Base cabinets: B1, B2... Wall cabinets: W1, W2... Tall: T1, T2...
The "brief" is 3-5 words describing what you see (e.g. "double door under counter", "narrow pullout next to range")."""


EXTRACT_PROMPT_TEMPLATE = """You are a cabinet specification extraction system for professional cabinetmakers. Analyze these images and extract a COMPLETE structured specification.

IMPORTANT: There are exactly {base_count} base cabinets, {wall_count} wall cabinets, and {tall_count} tall cabinets in this photo. You MUST account for ALL of them. Do not merge adjacent cabinets. Do not skip narrow ones.

Here are the cabinets that were identified:
{descriptions}

RULES:
- Base cabinets get IDs: B1, B2, B3... left to right
- Wall cabinets get IDs: W1, W2, W3... left to right
- Tall cabinets get IDs: T1, T2...
- Use standard cabinet widths ONLY: 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 42, 48 inches
- Standard base height: 34.5", base depth: 24", wall depth: 12"
- Identify appliance openings (range, fridge, dishwasher) — gaps with no cabinet
- For each cabinet, describe the front face top-to-bottom as sections
- Determine which wall cabinets align (left edge) above which base cabinets
- EVERY cabinet MUST have: id, type, label, row, width, height, depth, face.sections[]

FACE SECTION TYPES:
- "drawer": horizontal drawer front (specify height in inches, usually 6)
- "door": cabinet door (count: 1 for single, 2 for double; hinge_side: left/right/both)
- "false_front": non-functional panel like above a sink (specify height)
- "glass_door": door with glass panel
- "open": no door, open shelf

CABINET TYPES: base, base_sink, base_drawer_bank, base_pullout, base_spice, wall, wall_bridge, wall_stacker, tall_pantry, tall_oven

Respond with ONLY valid JSON:
{{"base_layout":[{{"ref":"B1"}},{{"type":"appliance","id":"range","label":"Range","width":30}}],"wall_layout":[{{"ref":"W1"}}],"alignment":[{{"wall":"W1","base":"B1"}}],"cabinets":[{{"id":"B1","type":"base","label":"description","row":"base","width":18,"height":34.5,"depth":24,"face":{{"sections":[{{"type":"drawer","count":1,"height":6}},{{"type":"door","count":1,"hinge_side":"left"}}]}}}}]}}"""


def _gemini_client(api_key):
    from google import genai
    return genai.Client(api_key=api_key)


def _get_mime(data: bytes) -> str:
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'image/png'
    if data[:2] == b'\xff\xd8':
        return 'image/jpeg'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'image/webp'
    return 'image/png'


def _parse_json(raw: str) -> dict:
    """Extract JSON object from potentially messy AI response.

    Tries multiple strategies:
    1. Direct parse after stripping markdown fences
    2. Substring between first { and last }
    3. Fix common errors (trailing commas, unquoted keys)

    Raises ValueError with raw response preview on failure so
    callers can log the problematic response for debugging.
    """
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    clean = clean.strip()

    # Strategy 1: try parsing as-is
    try:
        return json.loads(clean)
    except json.JSONDecodeError:
        pass

    # Strategy 2: find first { to last }
    start = clean.find("{")
    end = clean.rfind("}") + 1
    if start < 0 or end <= start:
        raise ValueError(f"No JSON object found in response. Raw (first 500 chars): {clean[:500]}")

    substring = clean[start:end]
    try:
        return json.loads(substring)
    except json.JSONDecodeError as e1:
        # Strategy 3: remove trailing commas before } or ]
        fixed = re.sub(r",(\s*[}\]])", r"\1", substring)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError as e2:
            # Give up — raise with useful debugging info
            raise ValueError(
                f"Invalid JSON from AI: {e2.msg} at line {e2.lineno} col {e2.colno}. "
                f"Raw response (first 500 chars): {clean[:500]}"
            ) from e2


class StepResult:
    """Result of a single pipeline step."""
    __slots__ = ("step", "data", "duration_ms", "error")

    def __init__(self, step: str, data=None, duration_ms: int = 0, error: str = None):
        self.step = step
        self.data = data
        self.duration_ms = duration_ms
        self.error = error

    @property
    def ok(self):
        return self.error is None

    def to_dict(self):
        return {
            "step": self.step,
            "data": self.data,
            "duration_ms": self.duration_ms,
            "error": self.error,
        }


def step_count_cabinets(photo_bytes: bytes, api_key: str,
                        model: str = "gemini-3.1-pro-preview") -> StepResult:
    """Step 1: Count every cabinet box in the photo."""
    from google.genai import types

    t0 = time.time()
    try:
        client = _gemini_client(api_key)
        mime = _get_mime(photo_bytes)

        # Retry on JSON parse failure — AI sometimes returns malformed JSON.
        last_error = None
        last_raw = None
        for attempt in range(3):
            try:
                temp = 0.1 + (attempt * 0.15)
                resp = client.models.generate_content(
                    model=model,
                    contents=[
                        types.Part.from_bytes(data=photo_bytes, mime_type=mime),
                        types.Part.from_text(text="Count every separate cabinet box in this photo."),
                    ],
                    config=types.GenerateContentConfig(
                        system_instruction=COUNT_PROMPT,
                        max_output_tokens=4096,
                        temperature=temp,
                        response_mime_type="application/json",
                    ),
                )
                last_raw = resp.text
                data = _parse_json(resp.text)
                data.setdefault("base_count", 0)
                data.setdefault("wall_count", 0)
                data.setdefault("tall_count", 0)
                data.setdefault("descriptions", [])
                return StepResult("count", data, int((time.time() - t0) * 1000))
            except (ValueError, json.JSONDecodeError) as e:
                last_error = e
                print(f"[count] attempt {attempt+1} failed: {e}", flush=True)
                if last_raw:
                    print(f"[count] raw response (first 1000 chars): {last_raw[:1000]}", flush=True)
                continue
        err_msg = f"AI returned invalid response after 3 attempts. Last error: {last_error}"
        return StepResult("count", None, int((time.time() - t0) * 1000), err_msg)
    except Exception as e:
        return StepResult("count", None, int((time.time() - t0) * 1000), str(e))


def step_generate_wireframe(photo_bytes: bytes, api_key: str) -> StepResult:
    """Step 2: Generate a 2.5D wireframe from the photo."""
    from google.genai import types

    t0 = time.time()
    try:
        client = _gemini_client(api_key)
        mime = _get_mime(photo_bytes)
        resp = client.models.generate_content(
            model='gemini-3-pro-image-preview',
            contents=[
                types.Part.from_bytes(data=photo_bytes, mime_type=mime),
                "create a SIMPLE 2.5D wire frame of the cabinets in this photo",
            ],
            config=types.GenerateContentConfig(
                response_modalities=['TEXT', 'IMAGE'],
            ),
        )
        for part in resp.candidates[0].content.parts:
            if hasattr(part, 'inline_data') and part.inline_data and part.inline_data.data:
                return StepResult("wireframe", part.inline_data.data, int((time.time() - t0) * 1000))
        raise ValueError("No image in wireframe response")
    except Exception as e:
        return StepResult("wireframe", None, int((time.time() - t0) * 1000), str(e))


def step_extract_dimensions(wireframe_bytes: bytes, photo_bytes: bytes,
                            count_data: dict, api_key: str,
                            model: str = "gemini-3.1-pro-preview") -> StepResult:
    """Step 3: Extract full cabinet spec using count info + wireframe + photo."""
    from google.genai import types

    t0 = time.time()
    try:
        client = _gemini_client(api_key)

        # Build the count-aware prompt
        descriptions_text = "\n".join(
            f"  - {d['id']}: {d.get('brief', 'cabinet')}"
            for d in count_data.get("descriptions", [])
        )
        system_prompt = EXTRACT_PROMPT_TEMPLATE.format(
            base_count=count_data.get("base_count", 0),
            wall_count=count_data.get("wall_count", 0),
            tall_count=count_data.get("tall_count", 0),
            descriptions=descriptions_text or "  (none listed)",
        )

        photo_mime = _get_mime(photo_bytes)
        wire_mime = _get_mime(wireframe_bytes)
        parts = [
            types.Part.from_text(text="Original photo:"),
            types.Part.from_bytes(data=photo_bytes, mime_type=photo_mime),
            types.Part.from_text(text="Wireframe drawing:"),
            types.Part.from_bytes(data=wireframe_bytes, mime_type=wire_mime),
            types.Part.from_text(text="Extract the complete cabinet specification. Return ONLY JSON."),
        ]

        # Retry on JSON parse failure — AI sometimes returns malformed JSON.
        last_error = None
        last_raw = None
        for attempt in range(3):
            try:
                temp = 0.1 + (attempt * 0.15)  # slight temperature variation per retry
                resp = client.models.generate_content(
                    model=model,
                    contents=parts,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        max_output_tokens=16384,
                        temperature=temp,
                        response_mime_type="application/json",
                    ),
                )
                last_raw = resp.text
                spec = _parse_json(resp.text)
                if "cabinets" not in spec or not spec["cabinets"]:
                    raise ValueError("No cabinets found in extraction response")
                return StepResult("extract", spec, int((time.time() - t0) * 1000))
            except (ValueError, json.JSONDecodeError) as e:
                last_error = e
                print(f"[extract] attempt {attempt+1} failed: {e}", flush=True)
                if last_raw:
                    print(f"[extract] raw response (first 1000 chars): {last_raw[:1000]}", flush=True)
                continue
        # All retries exhausted
        err_msg = f"AI returned invalid response after 3 attempts. Last error: {last_error}"
        return StepResult("extract", None, int((time.time() - t0) * 1000), err_msg)
    except Exception as e:
        return StepResult("extract", None, int((time.time() - t0) * 1000), str(e))


def step_multipass_extract(wireframe_bytes: bytes, photo_bytes: bytes,
                           count_data: dict, api_key: str,
                           model: str = "gemini-3.1-pro-preview",
                           passes: int = 3,
                           on_progress=None) -> StepResult:
    """Step 3b: Run extraction multiple times and vote on dimensions.
    Returns the consensus spec with confidence annotations per cabinet."""
    from collections import Counter
    import copy

    temperatures = [0.1, 0.25, 0.4][:passes]
    all_runs = []
    t0 = time.time()

    for i, temp in enumerate(temperatures):
        if on_progress:
            on_progress("verify", f"Verification pass {i+1}/{passes}...")
        r = _extract_at_temperature(wireframe_bytes, photo_bytes, count_data,
                                     api_key, model, temp)
        if r.ok:
            all_runs.append(r.data)

    if not all_runs:
        return StepResult("verify", None, int((time.time() - t0) * 1000),
                          "All verification passes failed")

    # Use first successful run as the base spec
    spec = copy.deepcopy(all_runs[0])

    # Vote on widths across runs
    cab_widths = {}  # id → [width_from_run1, width_from_run2, ...]
    for run_spec in all_runs:
        for c in run_spec.get("cabinets", []):
            cab_widths.setdefault(c["id"], []).append(c.get("width", 24))

    for c in spec.get("cabinets", []):
        widths = cab_widths.get(c["id"], [c.get("width", 24)])
        counter = Counter(widths)
        mode_width, mode_count = counter.most_common(1)[0]

        c["width"] = mode_width
        unique_widths = sorted(set(widths))

        if mode_count == len(widths):
            # All runs agree
            c["confidence"] = "high"
        elif mode_count > 1:
            # Majority agree
            c["confidence"] = "medium"
            c["alternatives"] = [w for w in unique_widths if w != mode_width]
        else:
            # No agreement
            c["confidence"] = "low"
            c["alternatives"] = unique_widths

    data = {
        "spec": spec,
        "pass_count": len(all_runs),
        "total_passes": passes,
    }
    return StepResult("verify", data, int((time.time() - t0) * 1000))


def _extract_at_temperature(wireframe_bytes, photo_bytes, count_data,
                            api_key, model, temperature):
    """Single extraction pass at a specific temperature."""
    from google.genai import types

    t0 = time.time()
    try:
        client = _gemini_client(api_key)
        descriptions_text = "\n".join(
            f"  - {d['id']}: {d.get('brief', 'cabinet')}"
            for d in count_data.get("descriptions", [])
        )
        system_prompt = EXTRACT_PROMPT_TEMPLATE.format(
            base_count=count_data.get("base_count", 0),
            wall_count=count_data.get("wall_count", 0),
            tall_count=count_data.get("tall_count", 0),
            descriptions=descriptions_text or "  (none listed)",
        )
        photo_mime = _get_mime(photo_bytes)
        wire_mime = _get_mime(wireframe_bytes)
        parts = [
            types.Part.from_text(text="Original photo:"),
            types.Part.from_bytes(data=photo_bytes, mime_type=photo_mime),
            types.Part.from_text(text="Wireframe drawing:"),
            types.Part.from_bytes(data=wireframe_bytes, mime_type=wire_mime),
            types.Part.from_text(text="Extract the complete cabinet specification. Return ONLY JSON."),
        ]
        last_error = None
        last_raw = None
        for attempt in range(2):
            try:
                resp = client.models.generate_content(
                    model=model,
                    contents=parts,
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        max_output_tokens=16384,
                        temperature=temperature,
                        response_mime_type="application/json",
                    ),
                )
                last_raw = resp.text
                spec = _parse_json(resp.text)
                if "cabinets" not in spec or not spec["cabinets"]:
                    raise ValueError("No cabinets found")
                return StepResult("verify_pass", spec, int((time.time() - t0) * 1000))
            except (ValueError, json.JSONDecodeError) as e:
                last_error = e
                print(f"[verify_pass T={temperature}] attempt {attempt+1} failed: {e}", flush=True)
                if last_raw:
                    print(f"[verify_pass] raw (first 500 chars): {last_raw[:500]}", flush=True)
                continue
        return StepResult("verify_pass", None, int((time.time() - t0) * 1000), str(last_error))
    except Exception as e:
        return StepResult("verify_pass", None, int((time.time() - t0) * 1000), str(e))


def step_solve_to_standard(spec: dict) -> StepResult:
    """Step 4: Fill defaults + round widths to shop precision (0.25").

    CRITICAL CHANGE (feature/editor-flexibility): previously this step SNAPPED
    widths to the nearest STANDARD_WIDTHS value (9,12,15,18,21,24,27,30,33,
    36,42,48). That silently destroyed correct AI output whenever a real
    cabinet was 20", 26", 31", etc. Cabinet makers measure real dimensions
    and the pipeline must preserve them. We keep the function name for
    backwards-compatibility with existing callers but it no longer snaps."""
    t0 = time.time()
    try:
        for c in spec.get("cabinets", []):
            # Round width to 0.25" shop precision (preserves real measurements).
            w = c.get("width", 24)
            try:
                c["width"] = round(float(w) * 4) / 4
            except (TypeError, ValueError):
                c["width"] = 24

            # Fill defaults (unchanged)
            c.setdefault("depth", 12 if c.get("row") == "wall" else 24)
            c.setdefault("height", 30 if c.get("row") == "wall" else 34.5)
            c.setdefault("face", {"sections": [{"type": "door", "count": 1}]})
            if not isinstance(c["face"].get("sections"), list):
                c["face"]["sections"] = [{"type": "door", "count": 1}]

        # Fill layout defaults if missing
        spec.setdefault("base_layout",
                        [{"ref": c["id"]} for c in spec["cabinets"] if c.get("row") == "base"])
        spec.setdefault("wall_layout",
                        [{"ref": c["id"]} for c in spec["cabinets"] if c.get("row") == "wall"])
        spec.setdefault("alignment", [])

        return StepResult("solve", spec, int((time.time() - t0) * 1000))
    except Exception as e:
        return StepResult("solve", None, int((time.time() - t0) * 1000), str(e))


def step_validate(spec: dict) -> StepResult:
    """Step 5: Validate spec integrity. Pure code."""
    t0 = time.time()
    warnings = []
    errors = []

    cabinet_ids = {c["id"] for c in spec.get("cabinets", [])}

    # Check layout refs point to real cabinets
    for layout_key in ("base_layout", "wall_layout"):
        for item in spec.get(layout_key, []):
            ref = item.get("ref")
            if ref and ref not in cabinet_ids:
                errors.append(f"Layout ref '{ref}' in {layout_key} has no matching cabinet")

    # Check alignment refs
    for a in spec.get("alignment", []):
        if a.get("wall") and a["wall"] not in cabinet_ids:
            errors.append(f"Alignment wall ref '{a['wall']}' not found")
        # base ref can be an appliance ID, so only warn
        base_ids = cabinet_ids | {
            item.get("id", "") for item in spec.get("base_layout", []) if "id" in item
        }
        if a.get("base") and a["base"] not in base_ids:
            warnings.append(f"Alignment base ref '{a['base']}' not found in cabinets or layout")

    # Check duplicate IDs
    seen = set()
    for c in spec.get("cabinets", []):
        if c["id"] in seen:
            errors.append(f"Duplicate cabinet ID: {c['id']}")
        seen.add(c["id"])

    # Check widths are within sane range (non-standard widths are allowed)
    for c in spec.get("cabinets", []):
        w = c.get("width", 0)
        if w < 3 or w > 120:
            warnings.append(f"{c['id']} has unusual width {w}\" (expected 3-120\")")

    # Check required fields
    for c in spec.get("cabinets", []):
        for field in ("id", "type", "row", "width", "height", "depth"):
            if field not in c:
                errors.append(f"Cabinet {c.get('id', '?')} missing required field '{field}'")

    data = {"valid": len(errors) == 0, "warnings": warnings, "errors": errors}
    return StepResult("validate", data, int((time.time() - t0) * 1000))


# ---------------------------------------------------------------------------
# Full pipeline orchestrator
# ---------------------------------------------------------------------------
def run_pipeline(photo_bytes: bytes, api_key: str,
                 model: str = "gemini-3.1-pro-preview",
                 on_progress=None) -> tuple[Optional[dict], list[StepResult], Optional[bytes]]:
    """
    Run the full 5-step extraction pipeline.

    Args:
        photo_bytes: Raw photo image bytes
        api_key: Gemini API key
        model: Model name for text extraction
        on_progress: Optional callback(step_name, message) for progress updates

    Returns:
        (spec_or_None, list_of_StepResults)
    """
    results = []

    def _progress(step, msg):
        if on_progress:
            on_progress(step, msg)

    # Step 1: Count
    _progress("count", "Counting cabinets...")
    r1 = step_count_cabinets(photo_bytes, api_key, model=model)
    results.append(r1)
    if not r1.ok:
        _progress("count", f"Count failed: {r1.error}")
        return None, results, None

    total = r1.data["base_count"] + r1.data["wall_count"] + r1.data["tall_count"]
    _progress("count", f"Found {total} cabinets ({r1.data['base_count']} base, {r1.data['wall_count']} wall, {r1.data['tall_count']} tall)")

    # Step 2: Wireframe
    _progress("wireframe", "Generating wireframe...")
    r2 = step_generate_wireframe(photo_bytes, api_key)
    results.append(r2)
    if not r2.ok:
        _progress("wireframe", f"Wireframe failed: {r2.error}")
        return None, results, None

    _progress("wireframe", "Wireframe generated")

    # Step 3: Extract dimensions
    _progress("extract", "Extracting dimensions...")
    r3 = step_extract_dimensions(r2.data, photo_bytes, r1.data, api_key, model=model)
    results.append(r3)
    if not r3.ok:
        _progress("extract", f"Extraction failed: {r3.error}")
        return None, results, None

    extracted_count = len(r3.data.get("cabinets", []))
    _progress("extract", f"Extracted {extracted_count} cabinets")

    # Step 3b: Multi-pass verification (vote on dimensions)
    _progress("verify", "Verifying dimensions (multi-pass)...")
    r3b = step_multipass_extract(r2.data, photo_bytes, r1.data, api_key,
                                 model=model, passes=3, on_progress=on_progress)
    results.append(r3b)
    if r3b.ok:
        # Use the consensus spec (with confidence annotations)
        verified_spec = r3b.data["spec"]
        _progress("verify", f"Verified across {r3b.data['pass_count']} passes")
    else:
        # Fall back to single extraction result
        verified_spec = r3.data
        _progress("verify", f"Verification failed, using single pass: {r3b.error}")

    # Step 4: Solve to standard sizes
    _progress("solve", "Solving to standard sizes...")
    r4 = step_solve_to_standard(verified_spec)
    results.append(r4)
    if not r4.ok:
        _progress("solve", f"Solve failed: {r4.error}")
        return None, results, None

    _progress("solve", "Defaults filled, widths rounded to shop precision")

    # Step 5: Validate
    _progress("validate", "Validating spec...")
    r5 = step_validate(r4.data)
    results.append(r5)

    if r5.data.get("warnings"):
        _progress("validate", f"Valid with {len(r5.data['warnings'])} warnings")
    else:
        _progress("validate", "Validation passed")

    spec = r4.data
    # Return wireframe bytes separately — don't pollute the spec dict
    # (it's shared across step results and can't be JSON-serialized)
    return spec, results, r2.data
