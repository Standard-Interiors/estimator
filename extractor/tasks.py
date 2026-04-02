"""
Lightweight in-memory task runner for background extraction jobs.
Tasks are stored in a dict keyed by task_id. No persistence — tasks
are lost on server restart (which is fine since extractions are
saved to the DB on completion).
"""

import uuid
import threading
from datetime import datetime, timezone


class Task:
    __slots__ = ("id", "room_id", "status", "progress", "steps",
                 "result", "error", "created_at", "completed_at")

    def __init__(self, room_id: str):
        self.id = uuid.uuid4().hex[:16]
        self.room_id = room_id
        self.status = "pending"
        self.progress = "Starting..."
        self.steps = []  # list of { step, status, message, duration_ms }
        self.result = None
        self.error = None
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.completed_at = None

    def update(self, status: str, progress: str, step: str = None):
        self.status = status
        self.progress = progress
        if step:
            # Update existing step or add new one
            existing = next((s for s in self.steps if s["step"] == step), None)
            if existing:
                existing["status"] = status
                existing["message"] = progress
            else:
                self.steps.append({"step": step, "status": status, "message": progress})

    def complete(self, result: dict):
        self.status = "done"
        self.progress = "Complete"
        self.result = result
        self.completed_at = datetime.now(timezone.utc).isoformat()

    def fail(self, error: str):
        self.status = "failed"
        self.progress = f"Failed: {error}"
        self.error = error
        self.completed_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self, include_result: bool = True):
        d = {
            "task_id": self.id,
            "room_id": self.room_id,
            "status": self.status,
            "progress": self.progress,
            "steps": self.steps,
            "error": self.error,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }
        if include_result and self.result is not None:
            d["result"] = self.result
        return d


# In-memory store
_tasks: dict[str, Task] = {}
_lock = threading.Lock()


def create_task(room_id: str) -> Task:
    task = Task(room_id)
    with _lock:
        _tasks[task.id] = task
    return task


def get_task(task_id: str) -> Task | None:
    return _tasks.get(task_id)


def run_in_background(task: Task, fn, *args, **kwargs):
    """Run fn(task, *args, **kwargs) in a daemon thread."""
    def _worker():
        try:
            fn(task, *args, **kwargs)
        except Exception as e:
            task.fail(str(e))

    t = threading.Thread(target=_worker, daemon=True)
    t.start()
