"""Data model for the layout designer, independent of any Qt graphics classes.

All lengths are stored in millimeters. Graphics items render these models and
write changes back into them; save/load only ever touches this module.

A Project holds one or more Floors (e.g. "Ground Floor", "Upstairs", "Yard");
each Floor owns its own walls/items/room labels/background, and only one
Floor is edited in the canvas at a time.
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
    curve_offset: float = 0.0  # mm, perpendicular bulge of the midpoint; 0 = straight

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Wall":
        data = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
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
    locked: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PlacedItem":
        data = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
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
        data = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        return cls(**data)


@dataclass
class Floor:
    id: int
    name: str = "Ground Floor"
    walls: list[Wall] = field(default_factory=list)
    items: list[PlacedItem] = field(default_factory=list)
    room_labels: list[RoomLabel] = field(default_factory=list)
    background_color: str = "#fafafa"

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "walls": [w.to_dict() for w in self.walls],
            "items": [i.to_dict() for i in self.items],
            "room_labels": [r.to_dict() for r in self.room_labels],
            "background_color": self.background_color,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Floor":
        return cls(
            id=data.get("id", next_id()),
            name=data.get("name", "Floor"),
            walls=[Wall.from_dict(w) for w in data.get("walls", [])],
            items=[PlacedItem.from_dict(i) for i in data.get("items", [])],
            room_labels=[RoomLabel.from_dict(r) for r in data.get("room_labels", [])],
            background_color=data.get("background_color", "#fafafa"),
        )


@dataclass
class Project:
    name: str = "Untitled"
    floors: list[Floor] = field(default_factory=lambda: [Floor(id=next_id())])
    active_floor_index: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "floors": [f.to_dict() for f in self.floors],
            "active_floor_index": self.active_floor_index,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Project":
        if "floors" in data:
            floors = [Floor.from_dict(f) for f in data["floors"]]
        else:
            # Backward compatibility with single-floor project files saved
            # before multi-floor support existed.
            floors = [Floor.from_dict({
                "id": next_id(),
                "name": "Ground Floor",
                "walls": data.get("walls", []),
                "items": data.get("items", []),
                "room_labels": data.get("room_labels", []),
                "background_color": data.get("background_color", "#fafafa"),
            })]
        if not floors:
            floors = [Floor(id=next_id())]
        active = data.get("active_floor_index", 0)
        active = max(0, min(active, len(floors) - 1))
        return cls(name=data.get("name", "Untitled"), floors=floors, active_floor_index=active)
