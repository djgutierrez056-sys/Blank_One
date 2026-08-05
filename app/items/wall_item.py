"""Interactive graphics item for a wall segment (straight or curved).

Walls are stored as absolute scene-coordinate endpoints (mm) plus an optional
perpendicular "curve_offset" that bulges the midpoint into a quadratic-bezier
curve. The item itself stays at scene position (0, 0) with no rotation -- all
geometry is expressed directly in scene/local coordinates, which keeps
endpoint dragging simple.
"""
from __future__ import annotations

import math
from enum import Enum, auto

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (
    QGraphicsItem,
    QGraphicsSceneMouseEvent,
    QStyleOptionGraphicsItem,
    QWidget,
)

from app.models import Wall
from app.units import format_length

HANDLE_RADIUS = 90.0  # mm
MAX_CURVE_OFFSET = 8000.0  # mm, sanity cap on how far a wall can bulge


class DragMode(Enum):
    NONE = auto()
    END1 = auto()
    END2 = auto()
    BODY = auto()
    CURVE = auto()


def _snap(value: float, grid: float) -> float:
    if grid <= 0:
        return value
    return round(value / grid) * grid


class WallItem(QGraphicsItem):
    def __init__(self, model: Wall, grid_snap_mm: float = 50.0):
        super().__init__()
        self.model = model
        self.grid_snap_mm = grid_snap_mm
        self.setFlags(QGraphicsItem.GraphicsItemFlag.ItemIsSelectable)
        self._drag_mode = DragMode.NONE
        self._drag_start_mouse = QPointF()
        self._drag_start_p1 = QPointF()
        self._drag_start_p2 = QPointF()
        self._before_snapshot: dict | None = None
        self.setZValue(5)

    def sync_from_model(self) -> None:
        self.prepareGeometryChange()
        self.update()

    def _snapshot(self) -> dict:
        return {
            "x1": self.model.x1, "y1": self.model.y1,
            "x2": self.model.x2, "y2": self.model.y2,
            "curve_offset": self.model.curve_offset,
        }

    def p1(self) -> QPointF:
        return QPointF(self.model.x1, self.model.y1)

    def p2(self) -> QPointF:
        return QPointF(self.model.x2, self.model.y2)

    def _perp_unit(self) -> tuple[float, float]:
        p1, p2 = self.p1(), self.p2()
        dx, dy = p2.x() - p1.x(), p2.y() - p1.y()
        length = math.hypot(dx, dy) or 1.0
        return (-dy / length, dx / length)

    def _midpoint(self) -> QPointF:
        p1, p2 = self.p1(), self.p2()
        return QPointF((p1.x() + p2.x()) / 2, (p1.y() + p2.y()) / 2)

    def control_point(self) -> QPointF:
        mid = self._midpoint()
        nx, ny = self._perp_unit()
        return QPointF(mid.x() + nx * self.model.curve_offset, mid.y() + ny * self.model.curve_offset)

    def is_curved(self) -> bool:
        return abs(self.model.curve_offset) > 1e-6

    def boundingRect(self) -> QRectF:
        margin = self.model.thickness / 2 + HANDLE_RADIUS + 20
        pts = [self.p1(), self.p2()]
        if self.is_curved():
            pts.append(self.control_point())
        xs, ys = [p.x() for p in pts], [p.y() for p in pts]
        x_min, x_max = min(xs) - margin, max(xs) + margin
        y_min, y_max = min(ys) - margin, max(ys) + margin
        return QRectF(x_min, y_min, x_max - x_min, y_max - y_min)

    def _thick_path(self) -> QPainterPath:
        p1, p2 = self.p1(), self.p2()
        nx, ny = self._perp_unit()
        t = self.model.thickness / 2
        path = QPainterPath()
        if not self.is_curved():
            path.moveTo(p1.x() + nx * t, p1.y() + ny * t)
            path.lineTo(p2.x() + nx * t, p2.y() + ny * t)
            path.lineTo(p2.x() - nx * t, p2.y() - ny * t)
            path.lineTo(p1.x() - nx * t, p1.y() - ny * t)
            path.closeSubpath()
            return path
        control = self.control_point()
        path.moveTo(p1.x() + nx * t, p1.y() + ny * t)
        path.quadTo(QPointF(control.x() + nx * t, control.y() + ny * t), QPointF(p2.x() + nx * t, p2.y() + ny * t))
        path.lineTo(p2.x() - nx * t, p2.y() - ny * t)
        path.quadTo(QPointF(control.x() - nx * t, control.y() - ny * t), QPointF(p1.x() - nx * t, p1.y() - ny * t))
        path.closeSubpath()
        return path

    def shape(self) -> QPainterPath:
        return self._thick_path()

    def paint(self, painter: QPainter, option: QStyleOptionGraphicsItem, widget: QWidget | None = None) -> None:
        painter.setBrush(QBrush(QColor("#5a5a5a")))
        painter.setPen(QPen(QColor("#333333"), 8))
        painter.drawPath(self._thick_path())

        p1, p2 = self.p1(), self.p2()
        length = math.hypot(p2.x() - p1.x(), p2.y() - p1.y())
        mid = self._midpoint()
        angle = math.degrees(math.atan2(p2.y() - p1.y(), p2.x() - p1.x()))
        painter.save()
        painter.translate(mid)
        if 90 < angle % 360 < 270:
            angle += 180
        painter.rotate(angle)
        painter.setPen(QPen(QColor("#222222")))
        text_rect = QRectF(-400, -self.model.thickness / 2 - 220, 800, 200)
        painter.drawText(text_rect, Qt.AlignmentFlag.AlignCenter, format_length(length))
        painter.restore()

        if self.isSelected():
            painter.setPen(QPen(QColor("#2b6cb0"), 6, Qt.PenStyle.DashLine))
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawPath(self._thick_path())
            painter.setPen(QPen(QColor("#2b6cb0"), 6))
            painter.setBrush(QBrush(QColor("#ffffff")))
            for p in (self.p1(), self.p2()):
                painter.drawEllipse(p, HANDLE_RADIUS, HANDLE_RADIUS)
            painter.setBrush(QBrush(QColor("#e07a3f")))
            painter.drawEllipse(self.control_point(), HANDLE_RADIUS, HANDLE_RADIUS)

    def _handle_at(self, pos: QPointF) -> DragMode:
        if self.isSelected():
            if (pos - self.p1()).manhattanLength() <= HANDLE_RADIUS * 1.5:
                return DragMode.END1
            if (pos - self.p2()).manhattanLength() <= HANDLE_RADIUS * 1.5:
                return DragMode.END2
            if (pos - self.control_point()).manhattanLength() <= HANDLE_RADIUS * 1.5:
                return DragMode.CURVE
        if self.shape().contains(pos):
            return DragMode.BODY
        return DragMode.NONE

    def mousePressEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        self.setSelected(True)
        mode = self._handle_at(event.pos())
        if mode == DragMode.NONE:
            event.ignore()
            return
        self._before_snapshot = self._snapshot()
        self._drag_mode = mode
        self._drag_start_mouse = event.scenePos()
        self._drag_start_p1 = self.p1()
        self._drag_start_p2 = self.p2()
        event.accept()

    def mouseMoveEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        if self._drag_mode == DragMode.NONE:
            event.ignore()
            return
        self.prepareGeometryChange()
        delta = event.scenePos() - self._drag_start_mouse
        grid = self.grid_snap_mm
        if self._drag_mode == DragMode.END1:
            self.model.x1 = _snap(self._drag_start_p1.x() + delta.x(), grid)
            self.model.y1 = _snap(self._drag_start_p1.y() + delta.y(), grid)
        elif self._drag_mode == DragMode.END2:
            self.model.x2 = _snap(self._drag_start_p2.x() + delta.x(), grid)
            self.model.y2 = _snap(self._drag_start_p2.y() + delta.y(), grid)
        elif self._drag_mode == DragMode.BODY:
            dx = _snap(self._drag_start_p1.x() + delta.x(), grid) - self._drag_start_p1.x()
            dy = _snap(self._drag_start_p1.y() + delta.y(), grid) - self._drag_start_p1.y()
            self.model.x1 = self._drag_start_p1.x() + dx
            self.model.y1 = self._drag_start_p1.y() + dy
            self.model.x2 = self._drag_start_p2.x() + dx
            self.model.y2 = self._drag_start_p2.y() + dy
        elif self._drag_mode == DragMode.CURVE:
            p1, p2 = self._drag_start_p1, self._drag_start_p2
            mid = QPointF((p1.x() + p2.x()) / 2, (p1.y() + p2.y()) / 2)
            dx, dy = p2.x() - p1.x(), p2.y() - p1.y()
            length = math.hypot(dx, dy) or 1.0
            nx, ny = -dy / length, dx / length
            mouse = event.scenePos()
            offset = (mouse.x() - mid.x()) * nx + (mouse.y() - mid.y()) * ny
            self.model.curve_offset = max(-MAX_CURVE_OFFSET, min(MAX_CURVE_OFFSET, offset))
        self.update()

    def mouseReleaseEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        self._drag_mode = DragMode.NONE
        if self._before_snapshot is not None:
            after = self._snapshot()
            if after != self._before_snapshot and self.scene() is not None:
                from app.commands import ModifyModelCommand

                self.scene().undo_stack.push(ModifyModelCommand(self, self._before_snapshot, after, "Modify wall"))
            self._before_snapshot = None
