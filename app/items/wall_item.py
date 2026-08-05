"""Interactive graphics item for a wall segment.

Walls are stored as absolute scene-coordinate endpoints (mm). The item itself
stays at scene position (0, 0) with no rotation -- all geometry is expressed
directly in scene/local coordinates, which keeps endpoint dragging simple.
"""
from __future__ import annotations

import math
from enum import Enum, auto

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QPainter, QPainterPath, QPen, QPolygonF
from PySide6.QtWidgets import (
    QGraphicsItem,
    QGraphicsSceneMouseEvent,
    QStyleOptionGraphicsItem,
    QWidget,
)

from app.models import Wall
from app.units import format_length

HANDLE_RADIUS = 90.0  # mm


class DragMode(Enum):
    NONE = auto()
    END1 = auto()
    END2 = auto()
    BODY = auto()


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
        return {"x1": self.model.x1, "y1": self.model.y1, "x2": self.model.x2, "y2": self.model.y2}

    def p1(self) -> QPointF:
        return QPointF(self.model.x1, self.model.y1)

    def p2(self) -> QPointF:
        return QPointF(self.model.x2, self.model.y2)

    def boundingRect(self) -> QRectF:
        margin = self.model.thickness / 2 + HANDLE_RADIUS + 20
        p1, p2 = self.p1(), self.p2()
        x_min, x_max = min(p1.x(), p2.x()) - margin, max(p1.x(), p2.x()) + margin
        y_min, y_max = min(p1.y(), p2.y()) - margin, max(p1.y(), p2.y()) + margin
        return QRectF(x_min, y_min, x_max - x_min, y_max - y_min)

    def _thick_polygon(self) -> QPolygonF:
        p1, p2 = self.p1(), self.p2()
        dx, dy = p2.x() - p1.x(), p2.y() - p1.y()
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length * self.model.thickness / 2, dx / length * self.model.thickness / 2
        return QPolygonF([
            QPointF(p1.x() + nx, p1.y() + ny),
            QPointF(p2.x() + nx, p2.y() + ny),
            QPointF(p2.x() - nx, p2.y() - ny),
            QPointF(p1.x() - nx, p1.y() - ny),
        ])

    def shape(self) -> QPainterPath:
        path = QPainterPath()
        path.addPolygon(self._thick_polygon())
        return path

    def paint(self, painter: QPainter, option: QStyleOptionGraphicsItem, widget: QWidget | None = None) -> None:
        painter.setBrush(QBrush(QColor("#5a5a5a")))
        painter.setPen(QPen(QColor("#333333"), 8))
        painter.drawPolygon(self._thick_polygon())

        p1, p2 = self.p1(), self.p2()
        length = math.hypot(p2.x() - p1.x(), p2.y() - p1.y())
        mid = QPointF((p1.x() + p2.x()) / 2, (p1.y() + p2.y()) / 2)
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
            painter.drawPolygon(self._thick_polygon())
            painter.setPen(QPen(QColor("#2b6cb0"), 6))
            painter.setBrush(QBrush(QColor("#ffffff")))
            for p in (self.p1(), self.p2()):
                painter.drawEllipse(p, HANDLE_RADIUS, HANDLE_RADIUS)

    def _handle_at(self, pos: QPointF) -> DragMode:
        if self.isSelected():
            if (pos - self.p1()).manhattanLength() <= HANDLE_RADIUS * 1.5:
                return DragMode.END1
            if (pos - self.p2()).manhattanLength() <= HANDLE_RADIUS * 1.5:
                return DragMode.END2
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
        self.update()

    def mouseReleaseEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        self._drag_mode = DragMode.NONE
        if self._before_snapshot is not None:
            after = self._snapshot()
            if after != self._before_snapshot and self.scene() is not None:
                from app.commands import ModifyModelCommand

                self.scene().undo_stack.push(ModifyModelCommand(self, self._before_snapshot, after, "Modify wall"))
            self._before_snapshot = None
