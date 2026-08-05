"""Save/load Project instances to JSON files."""
from __future__ import annotations

import json
from pathlib import Path

from app.models import Project


def save_project(project: Project, path: str | Path) -> None:
    path = Path(path)
    path.write_text(json.dumps(project.to_dict(), indent=2), encoding="utf-8")


def load_project(path: str | Path) -> Project:
    path = Path(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    return Project.from_dict(data)
