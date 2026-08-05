"""Small geometry helpers shared by graphics items."""
from __future__ import annotations

import math

from PySide6.QtCore import QPointF


def closest_point_on_segment(p: QPointF, a: QPointF, b: QPointF) -> tuple[QPointF, float]:
    """Return (closest point on segment a-b to p, distance from p to that point)."""
    ax, ay, bx, by, px, py = a.x(), a.y(), b.x(), b.y(), p.x(), p.y()
    dx, dy = bx - ax, by - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        closest = QPointF(ax, ay)
    else:
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
        closest = QPointF(ax + t * dx, ay + t * dy)
    distance = math.hypot(px - closest.x(), py - closest.y())
    return closest, distance
