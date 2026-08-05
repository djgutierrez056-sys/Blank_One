"""Reusable template library: named groups of walls/items/room labels that can
be saved from a selection and placed again in any project. Stored as one JSON
file in the user's home directory so templates persist across projects.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

TEMPLATES_PATH = Path.home() / ".blank_one_templates.json"


class TemplateLibrary:
    def __init__(self, path: Path | None = None):
        self.path = path or TEMPLATES_PATH
        self._templates: dict[str, list[tuple[str, dict]]] = {}
        self.load()

    def load(self) -> None:
        if not self.path.exists():
            self._templates = {}
            return
        try:
            raw: dict[str, Any] = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            self._templates = {}
            return
        self._templates = {
            name: [(kind, data) for kind, data in entries]
            for name, entries in raw.items()
        }

    def save(self) -> None:
        self.path.write_text(json.dumps(self._templates, indent=2), encoding="utf-8")

    def names(self) -> list[str]:
        return sorted(self._templates.keys())

    def get(self, name: str) -> list[tuple[str, dict]]:
        return [(kind, dict(data)) for kind, data in self._templates.get(name, [])]

    def save_template(self, name: str, entries: list[tuple[str, dict]]) -> None:
        self._templates[name] = [(kind, dict(data)) for kind, data in entries]
        self.save()

    def delete_template(self, name: str) -> None:
        self._templates.pop(name, None)
        self.save()
