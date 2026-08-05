"""Data model for the layout designer, independent of any Qt graphics classes.

All lengths are stored in millimeters. Graphics items render these models and
write changes back into them; save/load only ever touches this module.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from itertools import count
from typing import Any

_id_counter = count(1)


def next_id() -> int:
    return next(_id_counter)


@dataclass
class Wall:
    id: int
    x1: float
    y1: float
    x2: float
    y2: float
    thickness: float = 150.0  # mm

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Wall":
        return cls(**data)


@dataclass
class PlacedItem:
    id: int
    item_type: str  # catalog key, e.g. "bed", "door"
    label: str
    x: float  # mm, center position
    y: float  # mm, center position
    width: float  # mm
    height: float  # mm
    rotation: float = 0.0  # degrees
    color: str = "#cccccc"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PlacedItem":
        return cls(**data)


@dataclass
class RoomLabel:
    id: int
    text: str
    x: float  # mm, center position
    y: float  # mm, center position
    font_size: float = 350.0  # mm-equivalent scene-unit font size

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RoomLabel":
        return cls(**data)


@dataclass
class Project:
    name: str = "Untitled"
    walls: list[Wall] = field(default_factory=list)
    items: list[PlacedItem] = field(default_factory=list)
    room_labels: list[RoomLabel] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "walls": [w.to_dict() for w in self.walls],
            "items": [i.to_dict() for i in self.items],
            "room_labels": [r.to_dict() for r in self.room_labels],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Project":
        return cls(
            name=data.get("name", "Untitled"),
            walls=[Wall.from_dict(w) for w in data.get("walls", [])],
            items=[PlacedItem.from_dict(i) for i in data.get("items", [])],
            room_labels=[RoomLabel.from_dict(r) for r in data.get("room_labels", [])],
        )
