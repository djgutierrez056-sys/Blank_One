"""Shared camera for the interactive 3D view: a rotatable oblique/dimetric
projection (azimuth spin + vertical tilt), deliberately kept affine (no true
perspective) so screen-space drag deltas can be exactly inverted back to
world (x, y) floor-plane deltas -- that invertibility is what lets furniture
be dragged directly in the 3D view without a full 3D picking/raycast engine.
"""
from __future__ import annotations

import math

from PySide6.QtCore import QPointF

MIN_TILT = 0.15
MAX_TILT = 1.0


class Camera:
    def __init__(self, azimuth: float = 30.0, tilt: float = 0.5):
        self.azimuth = azimuth  # degrees, spin around the vertical (Z) axis
        self.tilt = tilt  # vertical squish factor; lower = flatter/more top-down

    def project(self, x: float, y: float, z: float) -> QPointF:
        a = math.radians(self.azimuth)
        rx = x * math.cos(a) - y * math.sin(a)
        ry = x * math.sin(a) + y * math.cos(a)
        return QPointF(rx, ry * self.tilt - z)

    def inverse_delta(self, dscreen_x: float, dscreen_y: float) -> tuple[float, float]:
        """Invert a screen-space delta into a world (dx, dy) delta at a fixed
        z (z cancels out of the delta since it doesn't depend on x, y)."""
        a = math.radians(self.azimuth)
        cos_a, sin_a = math.cos(a), math.sin(a)
        dx = cos_a * dscreen_x + (sin_a / self.tilt) * dscreen_y
        dy = -sin_a * dscreen_x + (cos_a / self.tilt) * dscreen_y
        return dx, dy

    def world_point_at_z(self, screen_point: QPointF, anchor_world: tuple[float, float], z: float = 0.0) -> tuple[float, float]:
        """Given a screen point and a known world (x, y) anchor at height z,
        return the world (x, y) that screen point corresponds to at that same
        z. Used for rotate-handle dragging, where we need an absolute world
        position rather than just a delta."""
        anchor_screen = self.project(anchor_world[0], anchor_world[1], z)
        dx, dy = self.inverse_delta(screen_point.x() - anchor_screen.x(), screen_point.y() - anchor_screen.y())
        return (anchor_world[0] + dx, anchor_world[1] + dy)

    def rotate(self, d_azimuth: float, d_tilt: float) -> None:
        self.azimuth = (self.azimuth + d_azimuth) % 360
        self.tilt = max(MIN_TILT, min(MAX_TILT, self.tilt + d_tilt))
