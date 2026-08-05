"""Interactive graphics item for a placed furniture/fixture (bed, door, etc.).

Supports move (drag body), resize (drag corner/edge handles when selected),
and rotate (drag the handle above the item, or Property Panel controls). All
geometry lives in the scene's millimeter coordinate space; the
model.PlacedItem is the source of truth and this item keeps it in sync on
every change. Door/window items additionally snap onto nearby walls.
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

from app.geometry import closest_point_on_segment
from app.models import PlacedItem
from app.units import format_length

HANDLE_SIZE = 90.0  # mm, visual size of resize handles
ROTATE_HANDLE_OFFSET = 350.0  # mm above the item's top edge
MIN_SIZE = 100.0  # mm, smallest a side can be resized to
WALL_SNAP_DISTANCE = 300.0  # mm, how close a door/window must be to snap onto a wall
WALL_HOSTED_TYPES = {"door", "window"}


class HandleKind(Enum):
    NONE = auto()
    TOP_LEFT = auto()
    TOP_RIGHT = auto()
    BOTTOM_LEFT = auto()
    BOTTOM_RIGHT = auto()
    TOP = auto()
    BOTTOM = auto()
    LEFT = auto()
    RIGHT = auto()
    ROTATE = auto()


class FurnitureItem(QGraphicsItem):
    def __init__(self, model: PlacedItem, grid_snap_mm: float = 50.0):
        super().__init__()
        self.model = model
        self.grid_snap_mm = grid_snap_mm
        self.setFlags(
            QGraphicsItem.GraphicsItemFlag.ItemIsMovable
            | QGraphicsItem.GraphicsItemFlag.ItemIsSelectable
            | QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges
        )
        self.setAcceptHoverEvents(True)
        self._active_handle = HandleKind.NONE
        self._drag_start_scene = QPointF()
        self._drag_start_rect = QRectF()
        self._drag_start_rotation = 0.0
        self._before_snapshot: dict | None = None
        self.setPos(model.x, model.y)
        self.setRotation(model.rotation)
        self.setZValue(10)

    def sync_from_model(self) -> None:
        """Re-apply model fields to this graphics item (used by undo/redo)."""
        self.prepareGeometryChange()
        self.setPos(self.model.x, self.model.y)
        self.setRotation(self.model.rotation)
        self.update()

    def _snapshot(self) -> dict:
        return {
            "x": self.model.x,
            "y": self.model.y,
            "width": self.model.width,
            "height": self.model.height,
            "rotation": self.model.rotation,
        }

    def _push_undo_if_changed(self) -> None:
        if self._before_snapshot is None:
            return
        after = self._snapshot()
        if after != self._before_snapshot and self.scene() is not None:
            from app.commands import ModifyModelCommand

            self.scene().undo_stack.push(ModifyModelCommand(self, self._before_snapshot, after, "Modify item"))
        self._before_snapshot = None

    # -- geometry -----------------------------------------------------
    def boundingRect(self) -> QRectF:
        w, h = self.model.width, self.model.height
        margin = HANDLE_SIZE + ROTATE_HANDLE_OFFSET
        return QRectF(-w / 2 - margin, -h / 2 - margin, w + 2 * margin, h + 2 * margin)

    def _body_rect(self) -> QRectF:
        w, h = self.model.width, self.model.height
        return QRectF(-w / 2, -h / 2, w, h)

    def shape(self) -> QPainterPath:
        path = QPainterPath()
        path.addRect(self._body_rect())
        if self.isSelected():
            for pos in self._handle_positions().values():
                path.addRect(QRectF(pos.x() - HANDLE_SIZE, pos.y() - HANDLE_SIZE, HANDLE_SIZE * 2, HANDLE_SIZE * 2))
        return path

    def _handle_positions(self) -> dict[HandleKind, QPointF]:
        r = self._body_rect()
        return {
            HandleKind.TOP_LEFT: r.topLeft(),
            HandleKind.TOP_RIGHT: r.topRight(),
            HandleKind.BOTTOM_LEFT: r.bottomLeft(),
            HandleKind.BOTTOM_RIGHT: r.bottomRight(),
            HandleKind.TOP: QPointF(r.center().x(), r.top()),
            HandleKind.BOTTOM: QPointF(r.center().x(), r.bottom()),
            HandleKind.LEFT: QPointF(r.left(), r.center().y()),
            HandleKind.RIGHT: QPointF(r.right(), r.center().y()),
            HandleKind.ROTATE: QPointF(r.center().x(), r.top() - ROTATE_HANDLE_OFFSET),
        }

    # -- painting -------------------------------------------------------
    def paint(self, painter: QPainter, option: QStyleOptionGraphicsItem, widget: QWidget | None = None) -> None:
        r = self._body_rect()
        painter.setBrush(QBrush(QColor(self.model.color)))
        pen = QPen(QColor("#333333"), 12 if not self.isSelected() else 24)
        painter.setPen(pen)
        painter.drawRect(r)

        painter.setPen(QPen(QColor("#222222")))
        font = painter.font()
        font.setPointSizeF(max(8.0, min(r.width(), r.height()) / 10))
        painter.setFont(font)
        painter.drawText(r, Qt.AlignmentFlag.AlignCenter, self.model.label)

        if self.isSelected():
            dim_text = f"{format_length(self.model.width)} x {format_length(self.model.height)}"
            dim_rect = QRectF(r.left(), r.bottom() + 10, r.width(), 200)
            small_font = painter.font()
            small_font.setPointSizeF(max(6.0, small_font.pointSizeF() * 0.7))
            painter.setFont(small_font)
            painter.drawText(dim_rect, Qt.AlignmentFlag.AlignHCenter | Qt.AlignmentFlag.AlignTop, dim_text)

            painter.setPen(QPen(QColor("#2b6cb0"), 6, Qt.PenStyle.DashLine))
            painter.setBrush(Qt.BrushStyle.NoBrush)
            painter.drawRect(r)
            handle_pen = QPen(QColor("#2b6cb0"), 6)
            handle_brush = QBrush(QColor("#ffffff"))
            painter.setPen(handle_pen)
            painter.setBrush(handle_brush)
            for kind, pos in self._handle_positions().items():
                if kind == HandleKind.ROTATE:
                    painter.drawEllipse(pos, HANDLE_SIZE / 2, HANDLE_SIZE / 2)
                    painter.drawLine(QPointF(r.center().x(), r.top()), pos)
                else:
                    painter.drawRect(QRectF(pos.x() - HANDLE_SIZE / 2, pos.y() - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE))

    # -- interaction ------------------------------------------------------
    def _handle_at(self, item_pos: QPointF) -> HandleKind:
        if not self.isSelected():
            return HandleKind.NONE
        for kind, pos in self._handle_positions().items():
            if (item_pos - pos).manhattanLength() <= HANDLE_SIZE * 1.5:
                return kind
        return HandleKind.NONE

    def mousePressEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        self._before_snapshot = self._snapshot()
        handle = self._handle_at(event.pos())
        if handle != HandleKind.NONE:
            self._active_handle = handle
            self._drag_start_scene = event.scenePos()
            self._drag_start_rect = self._body_rect()
            self._drag_start_rotation = self.rotation()
            event.accept()
            return
        self._active_handle = HandleKind.NONE
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        if self._active_handle == HandleKind.NONE:
            super().mouseMoveEvent(event)
            return
        if self._active_handle == HandleKind.ROTATE:
            center_scene = self.mapToScene(QPointF(0, 0))
            v = event.scenePos() - center_scene
            angle = math.degrees(math.atan2(v.y(), v.x())) + 90
            self.setRotation(angle)
            self.model.rotation = angle % 360
            self.update()
            return
        self._resize_to(event.scenePos())

    def mouseReleaseEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        self._active_handle = HandleKind.NONE
        super().mouseReleaseEvent(event)
        self._push_undo_if_changed()

    def rotate_by(self, degrees: float) -> None:
        """Rotate around the item's center; used by the property panel."""
        before = self._snapshot()
        angle = (self.rotation() + degrees) % 360
        self.setRotation(angle)
        self.model.rotation = angle
        self.update()
        after = self._snapshot()
        if self.scene() is not None and after != before:
            from app.commands import ModifyModelCommand

            self.scene().undo_stack.push(ModifyModelCommand(self, before, after, "Rotate item"))

    def _resize_to(self, scene_pos: QPointF) -> None:
        local = self.mapFromScene(scene_pos)
        r = QRectF(self._drag_start_rect)
        h = self._active_handle
        if h in (HandleKind.TOP_LEFT, HandleKind.TOP, HandleKind.LEFT, HandleKind.BOTTOM_LEFT):
            r.setLeft(local.x())
        if h in (HandleKind.TOP_RIGHT, HandleKind.TOP, HandleKind.RIGHT, HandleKind.BOTTOM_RIGHT):
            r.setRight(local.x())
        if h in (HandleKind.TOP_LEFT, HandleKind.TOP, HandleKind.TOP_RIGHT):
            r.setTop(local.y())
        if h in (HandleKind.BOTTOM_LEFT, HandleKind.BOTTOM, HandleKind.BOTTOM_RIGHT):
            r.setBottom(local.y())

        new_w = max(MIN_SIZE, r.width())
        new_h = max(MIN_SIZE, r.height())
        center_offset = r.center()

        self.prepareGeometryChange()
        self.model.width = new_w
        self.model.height = new_h
        # shift position so the anchored edge/corner stays put
        offset_scene = self.mapToScene(center_offset) - self.mapToScene(QPointF(0, 0))
        self.setPos(self.pos() + offset_scene)
        self.model.x = self.pos().x()
        self.model.y = self.pos().y()
        self.update()

    def _snap_to_wall(self, point: QPointF) -> QPointF | None:
        """For door/window items, snap onto the nearest nearby wall segment
        and align rotation to the wall's angle. Returns the snapped point, or
        None if no wall is within range."""
        from app.items.wall_item import WallItem

        if self.model.item_type not in WALL_HOSTED_TYPES or self.scene() is None:
            return None
        best_point, best_dist, best_angle = None, WALL_SNAP_DISTANCE, 0.0
        for gfx in self.scene().items():
            if not isinstance(gfx, WallItem):
                continue
            p1, p2 = gfx.p1(), gfx.p2()
            closest, dist = closest_point_on_segment(point, p1, p2)
            if dist <= best_dist:
                best_point, best_dist = closest, dist
                best_angle = math.degrees(math.atan2(p2.y() - p1.y(), p2.x() - p1.x()))
        if best_point is None:
            return None
        self.setRotation(best_angle)
        self.model.rotation = best_angle % 360
        return best_point

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionChange and self.scene() is not None:
            point: QPointF = value
            wall_point = self._snap_to_wall(point)
            if wall_point is not None:
                return wall_point
            snap = self.grid_snap_mm
            if snap > 0:
                point = QPointF(round(point.x() / snap) * snap, round(point.y() / snap) * snap)
            return point
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            self.model.x = self.pos().x()
            self.model.y = self.pos().y()
        return super().itemChange(change, value)
