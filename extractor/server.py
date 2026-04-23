#!/usr/bin/env python3
"""
Cabinet Spec Tool API server.
- POST /api/extract — AI extraction (existing)
- /api/projects/* — Project CRUD
- /api/rooms/* — Room CRUD + auto-save
- /api/rooms/:id/images — Image upload
- /api/rooms/:id/extract — Extract + save to room
- /images/* — Static file serving for uploads
"""
import os
import json
import time
import uuid
from pathlib import Path
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from extract_cabinets import extract_from_bytes, extract_from_photo, PROMPT
from pipeline import run_pipeline
import db
import tasks

# ---------------------------------------------------------------------------
# Load .env (needed when run via CMD in Docker, not just __main__)
# ---------------------------------------------------------------------------
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().strip().splitlines():
        if "=" in line and not line.startswith("#"):
            key, val = line.split("=", 1)
            if not os.environ.get(key.strip()):
                os.environ[key.strip()] = val.strip()

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI(title="Cabinet Spec Tool API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000",
        "https://cabinet-estimator.fly.dev",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database on startup
@app.on_event("startup")
def startup():
    db.init_db()

# Static file serving for uploaded images
app.mount("/images", StaticFiles(directory=str(db.IMAGE_DIR)), name="images")


# ===========================================================================
# EXISTING — Extraction endpoint (unchanged API, kept for backwards compat)
# ===========================================================================
@app.post("/api/extract")
async def extract_cabinets_raw(
    photo: UploadFile = File(...),
    model: str = "gemini-3.1-pro-preview"
):
    """Extract cabinet spec from photo: auto-generates wireframe, then extracts."""
    photo_bytes = await photo.read()
    if len(photo_bytes) < 100:
        raise HTTPException(400, "Image too small or empty")

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "API key not set")

    try:
        spec = extract_from_photo(photo_bytes, api_key, model=model)
    except Exception as e:
        raise HTTPException(500, f"Extraction failed: {str(e)}")

    spec.pop("_wireframe_bytes", None)
    return spec


# ===========================================================================
# PROJECTS
# ===========================================================================
@app.get("/api/projects")
async def list_projects():
    return db.list_projects()


@app.post("/api/projects")
async def create_project(body: dict):
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Project name is required")
    return db.create_project(name=name, notes=body.get("notes"))


@app.get("/api/projects/{pid}")
async def get_project(pid: str):
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@app.patch("/api/projects/{pid}")
async def update_project(pid: str, body: dict):
    allowed = {"name", "status", "notes"}
    updates = {k: v for k, v in body.items() if k in allowed}
    if "status" in updates and updates["status"] not in ("draft", "in_progress", "finalized"):
        raise HTTPException(400, "Invalid status")
    p = db.update_project(pid, **updates)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@app.delete("/api/projects/{pid}")
async def delete_project(pid: str):
    db.delete_project(pid)
    return {"ok": True}


@app.post("/api/projects/{pid}/duplicate")
async def duplicate_project(pid: str):
    try:
        p = db.duplicate_project(pid)
    except ValueError as e:
        raise HTTPException(400, str(e))
    if not p:
        raise HTTPException(404, "Project not found")
    return p


# ===========================================================================
# ROOMS
# ===========================================================================
@app.post("/api/projects/{pid}/rooms")
async def create_room(pid: str, body: dict = None):
    if body is None:
        body = {}
    p = db.get_project(pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return db.create_room(
        project_id=pid,
        name=body.get("name"),
        room_name=body.get("room_name", ""),
        sort_order=body.get("sort_order", len(p.get("rooms", [])))
    )


@app.get("/api/rooms/{rid}")
async def get_room(rid: str):
    r = db.get_room(rid)
    if not r:
        raise HTTPException(404, "Room not found")
    return r


@app.patch("/api/rooms/{rid}")
async def update_room(rid: str, body: dict):
    allowed = {"name", "room_name", "sort_order"}
    updates = {k: v for k, v in body.items() if k in allowed}
    r = db.update_room(rid, **updates)
    if not r:
        raise HTTPException(404, "Room not found")
    return r


@app.patch("/api/rooms/{rid}/spec")
async def save_room_spec(rid: str, body: dict):
    """Auto-save endpoint with optimistic concurrency."""
    spec_json = body.get("spec_json")
    version = body.get("version", 0)
    if spec_json is None:
        raise HTTPException(400, "spec_json is required")
    spec_str = json.dumps(spec_json) if isinstance(spec_json, dict) else spec_json
    try:
        result = db.save_room_spec(rid, spec_str, version)
    except ValueError as e:
        if "conflict" in str(e).lower():
            raise HTTPException(409, str(e))
        raise HTTPException(404, str(e))
    return result


# Also accept POST for sendBeacon (which only supports POST)
@app.post("/api/rooms/{rid}/spec")
async def save_room_spec_post(rid: str, body: dict):
    return await save_room_spec(rid, body)


@app.delete("/api/rooms/{rid}")
async def delete_room(rid: str):
    db.delete_room(rid)
    return {"ok": True}


@app.post("/api/rooms/{rid}/duplicate")
async def duplicate_room(rid: str):
    r = db.duplicate_room(rid)
    if not r:
        raise HTTPException(404, "Room not found")
    return r


# ===========================================================================
# IMAGES
# ===========================================================================
def _get_mime(data: bytes) -> str:
    """Detect MIME type from magic bytes."""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return "image/png"
    if data[:3] == b'\xff\xd8\xff':
        return "image/jpeg"
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return "image/webp"
    # HEIC/HEIF detection (ftyp box with heic/heix/mif1 brands)
    if len(data) >= 12 and data[4:8] == b'ftyp':
        brand = data[8:12]
        if brand in (b'heic', b'heix', b'mif1', b'hevc'):
            return "image/heic"
    return "image/jpeg"  # fallback


def _convert_heic_to_jpeg(image_bytes: bytes) -> bytes:
    """Convert HEIC/HEIF image to JPEG bytes using Pillow."""
    from PIL import Image
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass
    img = Image.open(BytesIO(image_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    buf = BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _generate_thumbnail(image_bytes: bytes, max_width: int = 300) -> bytes | None:
    """Generate a JPEG thumbnail. Returns None if Pillow fails."""
    try:
        from PIL import Image, ImageOps
        img = Image.open(BytesIO(image_bytes))
        img.verify()  # Validate it's a real image
        img = Image.open(BytesIO(image_bytes))  # Re-open after verify
        # Apply EXIF orientation (iPhone photos are often rotated/mirrored)
        img = ImageOps.exif_transpose(img)
        if img.width > max_width:
            ratio = max_width / img.width
            img = img.resize((max_width, int(img.height * ratio)), Image.LANCZOS)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return buf.getvalue()
    except Exception:
        return None


@app.post("/api/rooms/{rid}/images")
async def upload_image(
    rid: str,
    image: UploadFile = File(...),
    type: str = Form(...)
):
    """Upload a photo or wireframe for a room."""
    if type not in ("photo", "wireframe"):
        raise HTTPException(400, "type must be 'photo' or 'wireframe'")

    room = db.get_room(rid)
    if not room:
        raise HTTPException(404, "Room not found")

    image_bytes = await image.read()
    if len(image_bytes) < 100:
        raise HTTPException(400, "Image too small or empty")
    if len(image_bytes) > 10_485_760:  # 10MB
        raise HTTPException(400, "Image too large (max 10MB)")

    mime = _get_mime(image_bytes)
    # Convert HEIC to JPEG so browsers can display it
    if mime == "image/heic":
        try:
            image_bytes = _convert_heic_to_jpeg(image_bytes)
            mime = "image/jpeg"
        except Exception as e:
            raise HTTPException(400, f"Failed to convert HEIC image: {e}")
    if mime not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(400, "Invalid image format")

    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[mime]
    file_id = uuid.uuid4().hex[:12]

    # Create directory structure
    project_id = room["project_id"]
    img_dir = db.IMAGE_DIR / project_id / rid
    img_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir = img_dir / "thumbs"
    thumb_dir.mkdir(exist_ok=True)

    # Apply EXIF orientation (iPhone photos are often rotated/mirrored)
    try:
        from PIL import Image, ImageOps
        img = Image.open(BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = BytesIO()
        fmt = "JPEG" if ext == "jpg" else ext.upper()
        img.save(buf, format=fmt, quality=92)
        image_bytes = buf.getvalue()
    except Exception:
        pass  # If EXIF fix fails, save original

    # Save full image
    file_path = f"{project_id}/{rid}/{file_id}.{ext}"
    full_path = db.IMAGE_DIR / file_path
    full_path.write_bytes(image_bytes)

    # Generate + save thumbnail
    thumb_path = None
    thumb_bytes = _generate_thumbnail(image_bytes)
    if thumb_bytes:
        thumb_path = f"{project_id}/{rid}/thumbs/{file_id}.jpg"
        (db.IMAGE_DIR / thumb_path).write_bytes(thumb_bytes)

    # Save to DB
    result = db.save_image(
        room_id=rid, img_type=type,
        filename=image.filename or f"{file_id}.{ext}",
        mime_type=mime, file_path=file_path, thumb_path=thumb_path
    )
    return result


# ===========================================================================
# ROOM EXTRACTION (project-aware)
# ===========================================================================
@app.post("/api/rooms/{rid}/extract")
async def extract_for_room(rid: str, pipeline: bool = Query(default=True)):
    """Run extraction in background. Returns task_id for polling."""
    room = db.get_room(rid)
    if not room:
        raise HTTPException(404, "Room not found")

    if not room.get("photo_id"):
        raise HTTPException(400, "Room has no photo. Upload one first.")

    api_key = os.environ.get("GOOGLE_API_KEY", "")
    if not api_key:
        raise HTTPException(500, "API key not set")

    # Load photo bytes
    with db.engine.connect() as conn:
        photo_row = conn.execute(
            db.images.select().where(db.images.c.id == room["photo_id"])
        ).mappings().first()

    if not photo_row:
        raise HTTPException(400, "Photo image not found in database")

    photo_path = db.IMAGE_DIR / photo_row["file_path"]
    if not photo_path.exists():
        raise HTTPException(400, "Photo image file missing from disk")

    photo_bytes = photo_path.read_bytes()
    model = "gemini-3.1-pro-preview"

    # Create task and run in background
    task = tasks.create_task(rid)
    if pipeline:
        tasks.run_in_background(task, _run_pipeline_task,
                                rid, room, photo_bytes, api_key, model)
    else:
        tasks.run_in_background(task, _run_legacy_task,
                                rid, room, photo_bytes, api_key, model)
    return {"task_id": task.id}


@app.get("/api/tasks/{task_id}")
async def get_task_status(task_id: str):
    """Poll task status. Returns result when done."""
    task = tasks.get_task(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task.to_dict()


def _save_conflict_result(latest_room: dict | None) -> dict:
    latest_version = latest_room.get("spec_version", 0) if latest_room else 0
    return {
        "_save_conflict": True,
        "_save_conflict_message": (
            "Extraction finished, but newer room changes were saved before the result "
            "could be applied. Reloaded the latest room instead."
        ),
        "_spec_version": latest_version,
    }


def _run_pipeline_task(task, rid, room, photo_bytes, api_key, model):
    """Background task: structured pipeline extraction with progress updates."""
    def on_progress(step, msg):
        task.update(step, msg, step=step)

    spec, step_results, wireframe_bytes = run_pipeline(
        photo_bytes, api_key, model=model, on_progress=on_progress)

    # Save per-step extraction records
    wireframe_id = room.get("wireframe_id")
    for r in step_results:
        raw = None
        if r.data and r.step not in ("wireframe",) and isinstance(r.data, dict):
            raw = json.dumps(r.data)
        db.save_extraction(
            room_id=rid,
            photo_id=room.get("photo_id"),
            wireframe_id=wireframe_id,
            model=model,
            raw_response=raw,
            extracted_spec=r.data if r.step == "extract" and isinstance(r.data, dict) else None,
            duration_ms=r.duration_ms,
            error_message=r.error,
            status="success" if r.ok else "failed",
            step=r.step,
        )

    if spec is None:
        failed = next((r for r in step_results if not r.ok), None)
        msg = failed.error if failed else "Pipeline failed"
        task.fail(msg)
        return

    # Save wireframe
    if wireframe_bytes:
        file_id = uuid.uuid4().hex[:12]
        project_id = room["project_id"]
        img_dir = db.IMAGE_DIR / project_id / rid
        img_dir.mkdir(parents=True, exist_ok=True)
        file_path = f"{project_id}/{rid}/{file_id}.png"
        (db.IMAGE_DIR / file_path).write_bytes(wireframe_bytes)
        thumb_path = None
        thumb_b = _generate_thumbnail(wireframe_bytes)
        if thumb_b:
            (img_dir / "thumbs").mkdir(exist_ok=True)
            thumb_path = f"{project_id}/{rid}/thumbs/{file_id}.jpg"
            (db.IMAGE_DIR / thumb_path).write_bytes(thumb_b)
        db.save_image(
            room_id=rid, img_type="wireframe",
            filename=f"auto_wireframe_{file_id}.png",
            mime_type="image/png", file_path=file_path, thumb_path=thumb_path
        )

    # Save spec to room
    spec_str = json.dumps(spec)
    latest_room = db.get_room(rid)
    if not latest_room:
        task.fail("Room not found")
        return

    started_version = room.get("spec_version", 0)
    latest_version = latest_room.get("spec_version", 0)
    if latest_version != started_version:
        task.complete(_save_conflict_result(latest_room))
        return

    try:
        save_result = db.save_room_spec(rid, spec_str, latest_version)
    except ValueError as e:
        if "conflict" in str(e).lower():
            task.complete(_save_conflict_result(db.get_room(rid) or latest_room))
            return
        task.fail(str(e))
        return
    spec["_spec_version"] = save_result.get("version", 1) if save_result else 1

    # Build safe pipeline metadata
    def _safe_step(r):
        d = {"step": r.step, "duration_ms": r.duration_ms, "error": r.error}
        if r.step == "count" and isinstance(r.data, dict):
            d["data"] = r.data
        elif r.step == "validate" and isinstance(r.data, dict):
            d["data"] = r.data
        return d
    spec["_pipeline"] = {
        "steps": [_safe_step(r) for r in step_results],
        "total_duration_ms": sum(r.duration_ms for r in step_results),
    }

    task.complete(spec)


def _run_legacy_task(task, rid, room, photo_bytes, api_key, model):
    """Background task: legacy single-call extraction."""
    task.update("extracting", "Generating wireframe & extracting cabinets...")

    start_time = time.time()
    try:
        spec = extract_from_photo(photo_bytes, api_key, model=model)
    except Exception as e:
        task.fail(str(e))
        return

    duration_ms = int((time.time() - start_time) * 1000)

    wireframe_id = room.get("wireframe_id")
    if "_wireframe_bytes" in spec:
        wireframe_bytes = spec.pop("_wireframe_bytes")
        file_id = uuid.uuid4().hex[:12]
        project_id = room["project_id"]
        img_dir = db.IMAGE_DIR / project_id / rid
        img_dir.mkdir(parents=True, exist_ok=True)
        file_path = f"{project_id}/{rid}/{file_id}.png"
        (db.IMAGE_DIR / file_path).write_bytes(wireframe_bytes)
        thumb_path = None
        thumb_b = _generate_thumbnail(wireframe_bytes)
        if thumb_b:
            (img_dir / "thumbs").mkdir(exist_ok=True)
            thumb_path = f"{project_id}/{rid}/thumbs/{file_id}.jpg"
            (db.IMAGE_DIR / thumb_path).write_bytes(thumb_b)
        db.save_image(
            room_id=rid, img_type="wireframe",
            filename=f"auto_wireframe_{file_id}.png",
            mime_type="image/png", file_path=file_path, thumb_path=thumb_path
        )

    db.save_extraction(
        room_id=rid, photo_id=room.get("photo_id"), wireframe_id=wireframe_id,
        model=model, raw_response=json.dumps(spec), extracted_spec=spec,
        duration_ms=duration_ms, status="success",
    )

    spec_str = json.dumps(spec)
    latest_room = db.get_room(rid)
    if not latest_room:
        task.fail("Room not found")
        return

    started_version = room.get("spec_version", 0)
    latest_version = latest_room.get("spec_version", 0)
    if latest_version != started_version:
        task.complete(_save_conflict_result(latest_room))
        return

    try:
        save_result = db.save_room_spec(rid, spec_str, latest_version)
    except ValueError as e:
        if "conflict" in str(e).lower():
            task.complete(_save_conflict_result(db.get_room(rid) or latest_room))
            return
        task.fail(str(e))
        return
    spec["_spec_version"] = save_result.get("version", 1) if save_result else 1
    task.complete(spec)


# ===========================================================================
# Health check
# ===========================================================================
@app.get("/health")
async def health():
    api_key = os.environ.get("GOOGLE_API_KEY", "")
    return {
        "status": "ok",
        "service": "cabinet-spec-tool",
        "api_key_set": bool(api_key),
    }


# ---------------------------------------------------------------------------
# Frontend SPA serving (production: built React app)
# ---------------------------------------------------------------------------
_frontend_dist = Path(__file__).parent.parent / "renderer" / "dist"
if _frontend_dist.exists():
    from fastapi.responses import FileResponse

    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="frontend-assets")

    # SPA fallback: serve index.html for any non-API, non-image route
    @app.get("/{path:path}")
    async def spa_fallback(path: str):
        # Serve actual files if they exist (favicon, icons, etc.)
        file_path = _frontend_dist / path
        if path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html for client-side routing
        return FileResponse(_frontend_dist / "index.html")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run(app, host="0.0.0.0", port=port)
