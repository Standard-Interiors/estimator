# Cabinet Measurement from Photos: Feasibility Study

## Context

You need a tool that measures cabinet dimensions from photos using known reference objects (e.g., a 30" fridge). Target: **±0.25 inches accuracy, 95% of the time**. You are cabinet makers — precision matters.

---

## TL;DR Verdict

**±0.25" at 95% confidence from a single photo: Not achievable with current technology.**

| Approach | Achievable Accuracy | 95% Confidence? | Practical? |
|----------|-------------------|-----------------|------------|
| Single photo + reference object | ±0.5–0.75" | ~70-80% | Yes |
| Single photo, perfect conditions | ±0.3–0.5" | ~80-85% | Somewhat |
| Multi-photo (3-5 angles) + reference | ±0.15–0.25" | ~90-95% | Yes |
| Multi-photo (5-10) + SfM reconstruction | ±0.05–0.15" | ~95%+ | Yes, but slower |
| LiDAR phone scan (iPhone Pro/iPad Pro) | ±0.25" | ~90-95% | Easiest |

---

## Analysis of Your Photo

Looking at the kitchen photo you provided, here are the specific challenges:

1. **Camera angle**: The photo is taken at a slight downward angle, not perpendicular to the cabinets — this introduces 3-8% perspective error
2. **Depth variation**: Upper cabinets are at a different depth plane than lower cabinets — different scaling factors apply
3. **Fridge reference uncertainty**: "Standard" top-freezer fridges are 28", 29.5", 30", or 33" wide depending on model. That's already ±1.5" of reference uncertainty before we even start measuring
4. **Multiple planes**: The L-shaped counter means cabinets are on two different walls/angles
5. **Lighting**: Acceptable but shadows could affect edge detection

---

## Why ±0.25" from a Single Photo Is Not Feasible

### Error Budget Analysis (measuring a 36" cabinet run)

| Error Source | Magnitude | Can Fix? |
|---|---|---|
| Reference object uncertainty (fridge width varies ±1.5") | ±1.0–1.5" | Only if you know exact model |
| Lens distortion (smartphone barrel distortion) | ±0.5–1.0" | Yes, with calibration |
| Perspective angle (5° off perpendicular) | ±0.3–0.7" | Partially |
| Pixel quantization (at typical distances) | ±0.1–0.3" | Higher resolution helps |
| Depth plane differences (upper vs lower cabinets) | ±0.2–0.5" | Only with depth estimation |
| Edge detection ambiguity (cabinet borders) | ±0.1–0.25" | Somewhat |
| **Total combined error (RSS)** | **±1.3–2.1"** | |
| **Best case after corrections** | **±0.3–0.5"** | |

The math simply doesn't work for ±0.25" from one photo. Each error source compounds.

### The Fundamental Problem

A single 2D photo loses all depth information. When the fridge and a cabinet are at different distances from the camera (even 6 inches apart), the pixel-to-inch ratio changes. At typical kitchen distances (6-10 feet), a 6" depth difference causes ~1-3% measurement error — that's ±0.36-1.08" on a 36" measurement.

---

## What CAN Work: Recommended Approaches

### Option A: Multi-Photo Pipeline (Best accuracy-to-effort ratio)

**How it works:**
1. User takes 3-5 photos from different positions/angles
2. Structure from Motion (SfM) reconstructs 3D model
3. Known reference object (fridge, or better: a tape measure placed in frame) provides scale
4. Measure directly on 3D model

**Expected accuracy:** ±0.1–0.25" at 90-95% confidence
**Tech stack:** OpenCV + COLMAP/OpenSfM + Open3D + Claude Vision for object identification
**User effort:** Take 3-5 photos (30 seconds)

### Option B: Guided Single-Photo with Constraints (Fastest, good enough for estimates)

**How it works:**
1. User takes ONE photo, perpendicular to cabinet face
2. A known reference (tape measure or calibration card) MUST be in the frame, at the same depth as cabinets
3. Claude Vision identifies cabinet boundaries and reference
4. OpenCV corrects distortion and computes measurements
5. System reports measurements with confidence intervals

**Expected accuracy:** ±0.3–0.5" at 80-85% confidence
**Limitation:** Only measures one face/wall at a time. Cannot handle depth differences.

### Option C: LiDAR Phone Approach (Simplest path to ±0.25")

**How it works:**
1. Use iPhone Pro or iPad Pro with LiDAR sensor
2. Scan the kitchen with built-in Measure app or RoomPlan API
3. Extract cabinet dimensions from 3D room scan

**Expected accuracy:** ±0.25" at ~90-95%
**Limitation:** Requires specific hardware (iPhone 12 Pro or newer)

---

## Implementation Plan (Option A — Recommended)

### What We'd Build

A Python service (extending the existing FastAPI app) that:

1. **Accepts 3-5 kitchen photos** via API endpoint
2. **Identifies reference objects** using Claude Vision (fridge, countertop height, door frames)
3. **Reconstructs 3D geometry** using OpenSfM or COLMAP
4. **Segments cabinets** using SAM (Segment Anything Model)
5. **Computes dimensions** from the scaled 3D point cloud
6. **Returns measurements** with confidence intervals

### Files to Create/Modify

- `src/cabinet_measurement_service.py` — Core measurement pipeline
- `src/app.py` — Add new API endpoints for cabinet measurement
- `requirements.txt` — Add OpenCV, Open3D, segment-anything dependencies

### Reusable Infrastructure from Existing Codebase

- **Claude Vision API integration** (`src/photo_analysis_service.py`) — Already has Anthropic client setup, image encoding, vision prompting
- **Image validation & enhancement** (`src/photo_analysis_service.py`) — Resolution checks, contrast/sharpness enhancement
- **FastAPI server structure** (`src/app.py`) — Endpoint patterns, async handling
- **Pydantic models** — Validation patterns for measurement data

### Key Dependencies

```
opencv-python>=4.8
numpy
segment-anything  # Meta's SAM for cabinet segmentation
open3d            # 3D point cloud processing
opensfm           # Structure from Motion (or pycolmap)
anthropic         # Already in use
Pillow            # Already in use
```

### Verification Plan

1. Take 3-5 photos of a cabinet with known dimensions (measured by tape)
2. Run through pipeline
3. Compare computed vs actual measurements
4. Target: ±0.25" on 90%+ of measurements
5. Report confidence intervals alongside each measurement

---

## Practical Recommendations for Your Business

1. **Don't rely on fridge width as reference** — fridges vary too much (28"–36"). Instead, have your installer place a **24" level or tape measure** in the frame. It's a $0 cost addition that eliminates the biggest error source.

2. **Standardize photo-taking protocol:**
   - Take 3-5 photos from different positions
   - One photo perpendicular to each wall of cabinets
   - Include a known reference (tape measure) in at least one photo
   - Use the widest angle lens available
   - Stand 6-10 feet back

3. **Start with Option B** (single-photo with tape measure reference) for quick wins — it's simpler to build and gets you to ±0.5". Then upgrade to Option A (multi-photo) for the ±0.25" target.

4. **Consider LiDAR** if your team uses iPhone Pros — it's the fastest path to ±0.25" with zero custom software development.

---

## Summary

| Question | Answer |
|----------|--------|
| Can we hit ±0.25" from one photo? | **No** — best case is ±0.3-0.5" |
| Can we hit ±0.25" from multiple photos? | **Yes** — with 3-5 photos + reference object |
| Can we hit ±0.25" at 95% confidence? | **Yes** — with multi-photo SfM or LiDAR |
| Is the fridge a good reference? | **No** — too much width variation. Use a tape measure. |
| Should we build this? | **Yes, but set expectations correctly and use multi-photo approach** |
