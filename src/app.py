# app.py - Updated for Video Generation Focus
import os
import asyncio
import uuid
import base64
import json
import requests
from datetime import datetime
from typing import Optional, List, Dict
import sqlite3
from contextlib import contextmanager

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google.auth import default

from fastapi.responses import Response

from cabinet_measurement_service import (
    CabinetMeasurementAssistant,
    MeasurementEntry,
    PhotoAnalysisResult,
    PHOTO_CAPTURE_GUIDE,
)
from cabinet_solver import (
    CabinetWidthSolver,
    SectionEstimate,
    SolverResult,
    group_by_proportions,
)
from cabinet_elevation_drawing import generate_elevation_svg

# Your actual Google Cloud configuration
PROJECT_ID = "fashion-460613"
LOCATION = "us-central1"
MODEL_ID = "veo-2.0-generate-001"

app = FastAPI(title="Fashion Video Generator API", version="1.0.0")

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create videos directory
os.makedirs("generated_videos", exist_ok=True)


# Data models
class VideoGenerationRequest(BaseModel):
    person_description: str
    situation_description: str
    negative_prompt: Optional[str] = None
    duration: int = 8
    aspect_ratio: str = "9:16"


class VideoOperation(BaseModel):
    operation_id: str
    status: str  # "processing", "completed", "error"
    operation_name: str
    created_at: str
    person_description: str
    situation_description: str
    full_prompt: str
    video_file: Optional[str] = None
    video_url: Optional[str] = None


class VeoVideoGenerator:
    """Handles Veo API interactions for video generation"""

    def __init__(self):
        # Use default credentials (gcloud auth)
        self.credentials, _ = default()
        self.project_id = PROJECT_ID
        self.base_url = f"https://{LOCATION}-aiplatform.googleapis.com/v1"

    def _get_access_token(self) -> str:
        """Get fresh access token"""
        self.credentials.refresh(requests.Request())
        return self.credentials.token

    def _encode_image_to_base64(self, image_bytes: bytes) -> str:
        """Convert image bytes to base64"""
        return base64.b64encode(image_bytes).decode('utf-8')

    async def generate_video(
            self,
            person_description: str,
            situation_description: str,
            image_bytes: Optional[bytes] = None,
            duration: int = 8,
            aspect_ratio: str = "9:16",
            negative_prompt: Optional[str] = None
    ) -> Dict:
        """Generate video using Veo API - matches your successful curl command"""

        # Create comprehensive fashion prompt
        full_prompt = f"{person_description} {situation_description}, professional lighting, cinematic style, high fashion photography, detailed clothing textures"

        # Build request payload (exactly like your curl command)
        instance = {"prompt": full_prompt}

        # Add image if provided
        if image_bytes:
            instance["image"] = {
                "bytesBase64Encoded": self._encode_image_to_base64(image_bytes),
                "mimeType": "image/jpeg"
            }

        payload = {
            "instances": [instance],
            "parameters": {
                "aspectRatio": aspect_ratio,
                "durationSeconds": duration,
                "enhancePrompt": True,
                "personGeneration": "allow_adult",
                "sampleCount": 1
            }
        }

        if negative_prompt:
            payload["parameters"]["negativePrompt"] = negative_prompt

        # Make API request (same URL as your curl)
        url = f"{self.base_url}/projects/{self.project_id}/locations/{LOCATION}/publishers/google/models/{MODEL_ID}:predictLongRunning"

        headers = {
            "Authorization": f"Bearer {self._get_access_token()}",
            "Content-Type": "application/json"
        }

        response = requests.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Veo API error: {response.text}"
            )

        result = response.json()

        # Return the operation info with the full prompt
        return {
            "operation_name": result["name"],
            "full_prompt": full_prompt
        }

    async def check_operation_status(self, operation_name: str) -> Dict:
        """Check status of video generation operation"""

        url = f"{self.base_url}/projects/{self.project_id}/locations/{LOCATION}/publishers/google/models/{MODEL_ID}:fetchPredictOperation"

        headers = {
            "Authorization": f"Bearer {self._get_access_token()}",
            "Content-Type": "application/json"
        }

        payload = {"operationName": operation_name}

        response = requests.post(url, headers=headers, json=payload)

        if response.status_code != 200:
            raise HTTPException(
                status_code=response.status_code,
                detail=f"Operation status error: {response.text}"
            )

        return response.json()

    def save_video_from_base64(self, video_base64: str, operation_id: str) -> str:
        """Save base64 video to file"""
        try:
            # Decode base64 video
            video_bytes = base64.b64decode(video_base64)

            # Create filename
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"fashion_video_{operation_id}_{timestamp}.mp4"
            filepath = os.path.join("generated_videos", filename)

            # Save video file
            with open(filepath, "wb") as f:
                f.write(video_bytes)

            print(f"✅ Video saved: {filepath}")
            return filepath

        except Exception as e:
            print(f"❌ Error saving video: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save video: {e}")


# Initialize components
video_generator = VeoVideoGenerator()
operations_store: Dict[str, VideoOperation] = {}


# Initialize on startup
@app.on_event("startup")
async def startup_event():
    print(f"🎬 Fashion Video Generator API started!")
    print(f"📊 Project: {PROJECT_ID}")
    print(f"🌍 Location: {LOCATION}")
    print(f"🤖 Model: {MODEL_ID}")
    print(f"📁 Videos will be saved to: ./generated_videos/")


# API Endpoints
@app.get("/")
async def root():
    return {
        "message": "Fashion Video Generator API",
        "version": "1.0.0",
        "project": PROJECT_ID,
        "model": MODEL_ID,
        "description": "Generate fashion videos by describing a person and situation"
    }


@app.post("/generate-video")
async def generate_fashion_video(
        person_description: str = Form(..., description="Describe the person and their outfit"),
        situation_description: str = Form(..., description="Describe the situation/setting"),
        image: Optional[UploadFile] = File(None, description="Optional reference image"),
        negative_prompt: Optional[str] = Form(None, description="What to avoid in the video"),
        duration: int = Form(8, description="Video duration in seconds (5-8)"),
        aspect_ratio: str = Form("9:16", description="Video aspect ratio (9:16 or 16:9)")
):
    """
    Generate a fashion video based on person and situation descriptions

    Example:
    - person_description: "A fashionable woman wearing an elegant black dress and white sneakers"
    - situation_description: "walking confidently down a modern city street"
    """

    try:
        # Read image if provided
        image_bytes = None
        if image:
            image_bytes = await image.read()

        # Generate video (same as your successful curl command)
        operation_result = await video_generator.generate_video(
            person_description=person_description,
            situation_description=situation_description,
            image_bytes=image_bytes,
            duration=duration,
            aspect_ratio=aspect_ratio,
            negative_prompt=negative_prompt
        )

        # Store operation
        operation_id = str(uuid.uuid4())
        video_op = VideoOperation(
            operation_id=operation_id,
            status="processing",
            operation_name=operation_result["operation_name"],
            created_at=datetime.now().isoformat(),
            person_description=person_description,
            situation_description=situation_description,
            full_prompt=operation_result["full_prompt"]
        )

        operations_store[operation_id] = video_op

        return {
            "operation_id": operation_id,
            "status": "processing",
            "message": "Video generation started successfully! 🎬",
            "full_prompt": operation_result["full_prompt"],
            "estimated_completion": "2-5 minutes",
            "check_status_url": f"/status/{operation_id}"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@app.get("/status/{operation_id}")
async def check_video_status(operation_id: str):
    """Check video generation status and return results"""

    if operation_id not in operations_store:
        raise HTTPException(status_code=404, detail="Operation not found")

    video_op = operations_store[operation_id]

    try:
        # Check operation status
        result = await video_generator.check_operation_status(video_op.operation_name)

        if result.get("done", False):
            # Video is complete!
            response_data = result.get("response", {})

            # Handle base64 video response (like your curl result)
            if "videos" in response_data and response_data["videos"]:
                video_base64 = response_data["videos"][0]["bytesBase64Encoded"]

                # Save video to file
                video_filepath = video_generator.save_video_from_base64(video_base64, operation_id)

                # Update operation
                video_op.status = "completed"
                video_op.video_file = video_filepath
                operations_store[operation_id] = video_op

                return {
                    "operation_id": operation_id,
                    "status": "completed",
                    "message": "Video generation completed! 🎉",
                    "person_description": video_op.person_description,
                    "situation_description": video_op.situation_description,
                    "full_prompt": video_op.full_prompt,
                    "video_file": video_filepath,
                    "download_url": f"/download-video/{operation_id}",
                    "watch_url": f"/watch-video/{operation_id}"
                }

            # Handle GCS URI response (if using cloud storage)
            elif "generatedSamples" in response_data:
                video_uri = response_data["generatedSamples"][0]["video"]["uri"]

                video_op.status = "completed"
                video_op.video_url = video_uri
                operations_store[operation_id] = video_op

                return {
                    "operation_id": operation_id,
                    "status": "completed",
                    "message": "Video generation completed! 🎉",
                    "person_description": video_op.person_description,
                    "situation_description": video_op.situation_description,
                    "full_prompt": video_op.full_prompt,
                    "video_uri": video_uri
                }

            else:
                raise HTTPException(status_code=500, detail="No video data in response")

        else:
            return {
                "operation_id": operation_id,
                "status": "processing",
                "message": "Video still generating... ⏳",
                "progress": "This usually takes 2-5 minutes",
                "person_description": video_op.person_description,
                "situation_description": video_op.situation_description,
                "full_prompt": video_op.full_prompt
            }

    except Exception as e:
        video_op.status = "error"
        operations_store[operation_id] = video_op
        raise HTTPException(status_code=500, detail=f"Status check failed: {str(e)}")


@app.get("/download-video/{operation_id}")
async def download_video(operation_id: str):
    """Download the generated video file"""

    if operation_id not in operations_store:
        raise HTTPException(status_code=404, detail="Operation not found")

    video_op = operations_store[operation_id]

    if video_op.status != "completed" or not video_op.video_file:
        raise HTTPException(status_code=400, detail="Video not ready or not found")

    if not os.path.exists(video_op.video_file):
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(
        video_op.video_file,
        media_type='video/mp4',
        filename=f"fashion_video_{operation_id}.mp4"
    )


@app.get("/watch-video/{operation_id}")
async def watch_video(operation_id: str):
    """Stream the video for watching in browser"""

    if operation_id not in operations_store:
        raise HTTPException(status_code=404, detail="Operation not found")

    video_op = operations_store[operation_id]

    if video_op.status != "completed" or not video_op.video_file:
        raise HTTPException(status_code=400, detail="Video not ready or not found")

    if not os.path.exists(video_op.video_file):
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(video_op.video_file, media_type='video/mp4')


@app.get("/operations")
async def list_operations():
    """List all video operations"""
    return {
        "operations": [
            {
                "operation_id": op_id,
                "status": op.status,
                "created_at": op.created_at,
                "person_description": op.person_description,
                "situation_description": op.situation_description,
                "video_file": op.video_file,
                "video_url": op.video_url
            }
            for op_id, op in operations_store.items()
        ]
    }


@app.delete("/operations/{operation_id}")
async def delete_operation(operation_id: str):
    """Delete an operation and its video file"""

    if operation_id not in operations_store:
        raise HTTPException(status_code=404, detail="Operation not found")

    video_op = operations_store[operation_id]

    # Delete video file if exists
    if video_op.video_file and os.path.exists(video_op.video_file):
        os.remove(video_op.video_file)

    # Remove from store
    del operations_store[operation_id]

    return {"message": f"Operation {operation_id} deleted successfully"}


# ===== CABINET MEASUREMENT ENDPOINTS =====

# In-memory store for cabinet analysis sessions
cabinet_sessions: Dict[str, dict] = {}


def _get_cabinet_assistant() -> CabinetMeasurementAssistant:
    """Get or create cabinet measurement assistant."""
    api_key = os.environ.get("OPENAI_API_KEY", "")
    return CabinetMeasurementAssistant(openai_api_key=api_key)


@app.get("/cabinet/guide")
async def get_photo_capture_guide():
    """Get instructions for taking good cabinet measurement photos."""
    return PHOTO_CAPTURE_GUIDE


@app.post("/cabinet/analyze")
async def analyze_cabinet_photo(
    photo: UploadFile = File(..., description="Kitchen photo"),
    known_references: Optional[str] = Form(
        None,
        description='JSON dict of known references, e.g. {"refrigerator_width": 30, "range_width": 30}',
    ),
):
    """
    Step 1: Upload a kitchen photo. Returns identified cabinet sections
    and a prioritized measurement checklist for the person on-site.
    """
    assistant = _get_cabinet_assistant()
    photo_bytes = await photo.read()

    refs = None
    if known_references:
        try:
            refs = json.loads(known_references)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="known_references must be valid JSON")

    try:
        analysis = await assistant.analyze_photo(photo_bytes, known_references=refs)
        checklist = assistant.generate_measurement_checklist(analysis)

        # Store session
        session_id = str(uuid.uuid4())
        cabinet_sessions[session_id] = {
            "analysis": analysis,
            "photo_bytes": photo_bytes,
            "measurements": [],
        }

        return {
            "session_id": session_id,
            "analysis": analysis.model_dump(),
            "checklist": checklist,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/cabinet/{session_id}/measurements")
async def submit_measurements(
    session_id: str,
    measurements: List[MeasurementEntry],
):
    """
    Step 2: Submit tape measurements. Returns cross-validation results
    that catch errors, transposed digits, and inconsistencies.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    assistant = _get_cabinet_assistant()

    # Accumulate measurements
    session["measurements"].extend(measurements)

    # Cross-validate
    validation = await assistant.cross_validate(
        analysis=session["analysis"],
        measurements=session["measurements"],
        photo_bytes=session["photo_bytes"],
    )

    session["validation"] = validation

    return {
        "session_id": session_id,
        "validation": validation.model_dump(),
        "measurements_received": len(session["measurements"]),
    }


@app.post("/cabinet/{session_id}/fill-gaps")
async def fill_measurement_gaps(session_id: str):
    """
    Step 3: Estimate missing measurements using known tape measurements
    + photo analysis. Returns estimates with confidence scores.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    assistant = _get_cabinet_assistant()

    gap_fill = await assistant.fill_measurement_gaps(
        analysis=session["analysis"],
        measurements=session["measurements"],
        photo_bytes=session["photo_bytes"],
    )

    session["gap_fill"] = gap_fill

    return {
        "session_id": session_id,
        "gap_fill": gap_fill,
    }


@app.get("/cabinet/{session_id}/report")
async def get_measurement_report(session_id: str):
    """
    Step 4: Get the final measurement report. Shows all measured and
    estimated dimensions, validation status, and whether you're ready
    for production.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    assistant = _get_cabinet_assistant()

    # Run validation if not done yet
    validation = session.get("validation")
    if not validation:
        validation = await assistant.cross_validate(
            analysis=session["analysis"],
            measurements=session["measurements"],
            photo_bytes=session["photo_bytes"],
        )

    report = assistant.generate_final_report(
        analysis=session["analysis"],
        measurements=session["measurements"],
        validation=validation,
        gap_fill=session.get("gap_fill"),
    )

    return {
        "session_id": session_id,
        "report": report.model_dump(),
    }


# ===== STREAMLINED CABINET WORKFLOW (1-2 measurements) =====


def _analysis_to_sections(analysis: PhotoAnalysisResult) -> List[SectionEstimate]:
    """Convert PhotoAnalysisResult cabinet sections to SectionEstimate list for the solver."""
    # Calculate total estimated width for proportions
    total_est = sum(
        s.estimated_width for s in analysis.cabinet_sections
        if s.estimated_width and s.cabinet_type in ("base", "appliance_opening")
    )
    if total_est <= 0:
        total_est = 1.0

    sections = []
    for s in analysis.cabinet_sections:
        if s.cabinet_type not in ("base", "appliance_opening"):
            continue
        prop = s.pixel_proportion if s.pixel_proportion else (
            (s.estimated_width / total_est) if s.estimated_width else 0.1
        )
        sections.append(SectionEstimate(
            section_id=s.id,
            cabinet_type=s.cabinet_type,
            proportion=prop,
            raw_pixel_width=s.estimated_width or 0,
            is_appliance=s.is_appliance,
            appliance_type=s.appliance_type,
            filler_detected_left=s.filler_detected_left,
            filler_detected_right=s.filler_detected_right,
        ))
    return sections


def _analysis_to_wall_sections(analysis: PhotoAnalysisResult) -> List[SectionEstimate]:
    """Extract wall cabinet sections for the drawing."""
    total_est = sum(
        s.estimated_width for s in analysis.cabinet_sections
        if s.estimated_width and s.cabinet_type == "wall"
    )
    if total_est <= 0:
        total_est = 1.0

    sections = []
    for s in analysis.cabinet_sections:
        if s.cabinet_type != "wall":
            continue
        prop = s.pixel_proportion if s.pixel_proportion else (
            (s.estimated_width / total_est) if s.estimated_width else 0.1
        )
        sections.append(SectionEstimate(
            section_id=s.id,
            cabinet_type="wall",
            proportion=prop,
            raw_pixel_width=s.estimated_width or 0,
        ))
    return sections


class SolveRequest(BaseModel):
    total_run: float
    additional_measurements: Optional[Dict[str, float]] = None


@app.post("/cabinet/{session_id}/solve")
async def solve_cabinet_widths(session_id: str, request: SolveRequest):
    """
    The main action endpoint. User inputs total wall run (1 measurement)
    and optionally one more measurement. AI solves every cabinet width
    by snapping to standard factory sizes.

    Returns solved widths, fillers, confidence, and updated SVG drawing.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    analysis = session["analysis"]

    # Convert analysis to solver input
    base_sections = _analysis_to_sections(analysis)
    wall_sections = _analysis_to_wall_sections(analysis)

    if not base_sections:
        raise HTTPException(status_code=400, detail="No base cabinets found in analysis")

    # Group same-size cabinets
    groups = group_by_proportions(base_sections)

    # Solve
    solver = CabinetWidthSolver()
    result = solver.solve(
        total_run=request.total_run,
        sections=base_sections,
        groups=groups,
        known_measurements=request.additional_measurements,
    )

    # Generate SVG elevation drawing
    svg = generate_elevation_svg(
        solver_result=result,
        sections=base_sections,
        total_run=request.total_run,
        wall_sections=wall_sections if wall_sections else None,
        groups=groups,
        title="Cabinet Elevation — Solved",
    )

    # Store solver result in session
    session["solver_result"] = result
    session["solve_request"] = request
    session["base_sections"] = base_sections
    session["wall_sections"] = wall_sections
    session["groups"] = groups

    return {
        "session_id": session_id,
        "solved": {
            "cabinet_widths": [
                {
                    "section_id": cw.section_id,
                    "width": cw.standard_width,
                    "confidence": cw.confidence,
                    "source": cw.source,
                    "alternatives": cw.alternatives,
                }
                for cw in result.cabinet_widths
            ],
            "fillers": [
                {"position": f.position, "width": f.width, "confidence": f.confidence}
                for f in result.fillers
            ],
            "total_matches": result.total_matches,
            "confidence": result.confidence,
        },
        "needs_more_input": result.needs_user_input,
        "disambiguation_reason": result.disambiguation_reason,
        "svg": svg,
    }


@app.get("/cabinet/{session_id}/elevation")
async def get_elevation_drawing(session_id: str):
    """
    Get the current SVG elevation drawing.
    Works at any stage — before or after solving.
    Returns SVG that renders directly in the browser.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]
    analysis = session["analysis"]

    # If solved, use solver result
    if "solver_result" in session:
        svg = generate_elevation_svg(
            solver_result=session["solver_result"],
            sections=session["base_sections"],
            total_run=session["solve_request"].total_run,
            wall_sections=session.get("wall_sections"),
            groups=session.get("groups"),
            title="Cabinet Elevation — Solved",
        )
    else:
        # Pre-solve: generate from estimates only
        base_sections = _analysis_to_sections(analysis)
        wall_sections = _analysis_to_wall_sections(analysis)

        # Use estimated total run from photo
        est_total = sum(s.estimated_width or 0 for s in analysis.cabinet_sections
                        if s.cabinet_type in ("base", "appliance_opening"))
        if est_total <= 0:
            est_total = 120  # fallback

        # Create a dummy solver result with estimates
        from cabinet_solver import CabinetWidth as CW
        dummy_widths = [
            CW(section_id=s.section_id,
               standard_width=int(s.raw_pixel_width) if s.raw_pixel_width else 24,
               confidence=0.4, source="estimated", alternatives=[])
            for s in base_sections
        ]
        dummy_result = SolverResult(
            cabinet_widths=dummy_widths, fillers=[], total_matches=False,
            residual=0, confidence=0.3, needs_user_input="Measure total wall run",
            disambiguation_reason=None,
        )
        svg = generate_elevation_svg(
            solver_result=dummy_result,
            sections=base_sections,
            total_run=est_total,
            wall_sections=wall_sections if wall_sections else None,
            title="Cabinet Elevation — Estimated (measure total run to solve)",
        )

    return Response(content=svg, media_type="image/svg+xml")


@app.post("/cabinet/{session_id}/tap-measure")
async def tap_measure(session_id: str, section_id: str, dimension: str, value: float):
    """
    Mobile tap-to-update: user taps a cabinet on the drawing, inputs a measurement.
    AI propagates to same-group cabinets and re-solves.
    Returns updated SVG.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]

    if "solve_request" not in session:
        raise HTTPException(status_code=400, detail="Run /solve first with total_run")

    # Add to known measurements
    additional = session["solve_request"].additional_measurements or {}
    additional[section_id] = value
    session["solve_request"].additional_measurements = additional

    # Re-solve with the new anchor
    solver = CabinetWidthSolver()
    result = solver.solve(
        total_run=session["solve_request"].total_run,
        sections=session["base_sections"],
        groups=session.get("groups"),
        known_measurements=additional,
    )

    # Find which cabinets were updated by propagation
    propagated_to = []
    if session.get("groups"):
        for group in session["groups"]:
            if section_id in group.section_ids:
                propagated_to = [sid for sid in group.section_ids if sid != section_id]

    # Regenerate SVG
    svg = generate_elevation_svg(
        solver_result=result,
        sections=session["base_sections"],
        total_run=session["solve_request"].total_run,
        wall_sections=session.get("wall_sections"),
        groups=session.get("groups"),
        title="Cabinet Elevation — Updated",
    )

    session["solver_result"] = result

    return {
        "session_id": session_id,
        "updated_section": section_id,
        "propagated_to": propagated_to,
        "value": value,
        "needs_more_input": result.needs_user_input,
        "confidence": result.confidence,
        "svg": svg,
    }


@app.post("/cabinet/{session_id}/confirm")
async def confirm_measurements(session_id: str):
    """
    User confirms the solved measurements look correct.
    Marks everything as verified and returns production-ready report.
    """
    if session_id not in cabinet_sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = cabinet_sessions[session_id]

    if "solver_result" not in session:
        raise HTTPException(status_code=400, detail="Run /solve first")

    result = session["solver_result"]

    report = {
        "status": "confirmed",
        "ready_for_production": result.total_matches and result.confidence >= 0.7,
        "total_run": session["solve_request"].total_run,
        "cabinets": [
            {
                "section_id": cw.section_id,
                "width": cw.standard_width,
                "source": "verified" if cw.source in ("solved", "measured", "appliance") else cw.source,
                "confidence": cw.confidence,
            }
            for cw in result.cabinet_widths
        ],
        "fillers": [
            {"position": f.position, "width": round(f.width, 4)}
            for f in result.fillers
        ],
        "confidence": result.confidence,
        "warnings": [],
    }

    if not result.total_matches:
        report["warnings"].append(
            f"Cabinet widths + fillers don't sum to total run. Residual: {result.residual}\""
        )
    if result.confidence < 0.7:
        report["warnings"].append(
            "Low confidence — consider measuring additional cabinets"
        )

    return {"session_id": session_id, "report": report}


if __name__ == "__main__":
    import uvicorn

    print("Starting Fashion + Cabinet Measurement API...")
    print(f"API docs: http://localhost:8000/docs")

    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )