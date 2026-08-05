"""QGraphicsScene subclass: grid background, wall drawing mode, item management.

Scene coordinates are millimeters. The scene owns the authoritative Project
data via add/remove helpers so save/load and the graphics items never drift
out of sync.
"""
from __future__ import annotations

from PySide6.QtCore import QLineF, QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QKeyEvent, QPainter, QPen, QUndoStack
from PySide6.QtWidgets import QGraphicsLineItem, QGraphicsScene, QGraphicsSceneMouseEvent

from app.commands import AddItemCommand, DeleteItemsCommand
from app.items.furniture_item import FurnitureItem
from app.items.room_label_item import RoomLabelItem
from app.items.wall_item import WallItem
from app.models import PlacedItem, Project, RoomLabel, Wall, next_id

MINOR_GRID_MM = 100.0
MAJOR_GRID_MM = 1000.0
GRID_SNAP_MM = 50.0


class DesignScene(QGraphicsScene):
    def __init__(self, project: Project | None = None):
        super().__init__()
        self.project = project or Project()
        self.setSceneRect(QRectF(-20000, -20000, 40000, 40000))
        self.mode = "select"  # "select" | "draw_wall"
        self._pending_wall_start: QPointF | None = None
        self._preview_line: QGraphicsLineItem | None = None
        self.undo_stack = QUndoStack(self)
        self.rebuild_from_project(self.project)

    # -- project sync -----------------------------------------------------
    def rebuild_from_project(self, project: Project) -> None:
        self.clear()
        self._preview_line = None
        self.project = project
        self.undo_stack = QUndoStack(self)
        for wall in project.walls:
            self.addItem(WallItem(wall, GRID_SNAP_MM))
        for placed in project.items:
            self.addItem(FurnitureItem(placed, GRID_SNAP_MM))
        for room_label in project.room_labels:
            self.addItem(RoomLabelItem(room_label))

    def add_room_label(self, pos: QPointF, text: str = "Room") -> RoomLabelItem:
        model = RoomLabel(id=next_id(), text=text, x=pos.x(), y=pos.y())
        gfx = RoomLabelItem(model)
        self.undo_stack.push(AddItemCommand(self, model, gfx, self.project.room_labels, "Add room label"))
        return gfx

    def add_furniture(self, item_type: str, label: str, width: float, height: float, color: str, pos: QPointF) -> FurnitureItem:
        model = PlacedItem(
            id=next_id(),
            item_type=item_type,
            label=label,
            x=round(pos.x() / GRID_SNAP_MM) * GRID_SNAP_MM,
            y=round(pos.y() / GRID_SNAP_MM) * GRID_SNAP_MM,
            width=width,
            height=height,
            color=color,
        )
        gfx = FurnitureItem(model, GRID_SNAP_MM)
        self.undo_stack.push(AddItemCommand(self, model, gfx, self.project.items, "Add item"))
        return gfx

    def remove_selected(self) -> None:
        entries = []
        for gfx in list(self.selectedItems()):
            if isinstance(gfx, FurnitureItem):
                entries.append((gfx.model, gfx, self.project.items))
            elif isinstance(gfx, WallItem):
                entries.append((gfx.model, gfx, self.project.walls))
            elif isinstance(gfx, RoomLabelItem):
                entries.append((gfx.model, gfx, self.project.room_labels))
        if entries:
            self.undo_stack.push(DeleteItemsCommand(self, entries, "Delete"))

    # -- grid background ---------------------------------------------------
    def drawBackground(self, painter: QPainter, rect: QRectF) -> None:
        painter.fillRect(rect, QColor("#fafafa"))
        self._draw_grid(painter, rect, MINOR_GRID_MM, QColor("#e5e5e5"), 4)
        self._draw_grid(painter, rect, MAJOR_GRID_MM, QColor("#c9c9c9"), 8)

    def drawForeground(self, painter: QPainter, rect: QRectF) -> None:
        """Fill the notch left where two wall segments' square-cut ends meet,
        so corners read as one continuous wall instead of two butted boxes."""
        joints: dict[tuple[float, float], list[float]] = {}
        for gfx in self.items():
            if not isinstance(gfx, WallItem):
                continue
            for pt in (gfx.p1(), gfx.p2()):
                key = (round(pt.x()), round(pt.y()))
                joints.setdefault(key, []).append(gfx.model.thickness)

        painter.setPen(Qt.PenStyle.NoPen)
        painter.setBrush(QBrush(QColor("#5a5a5a")))
        for (x, y), thicknesses in joints.items():
            if len(thicknesses) < 2:
                continue
            radius = max(thicknesses) / 2 * 1.5
            painter.drawEllipse(QPointF(x, y), radius, radius)

    @staticmethod
    def _draw_grid(painter: QPainter, rect: QRectF, step: float, color: QColor, width: int) -> None:
        pen = QPen(color)
        pen.setWidth(width)
        pen.setCosmetic(True)
        painter.setPen(pen)
        left = int(rect.left()) - (int(rect.left()) % int(step))
        top = int(rect.top()) - (int(rect.top()) % int(step))
        x = left
        while x < rect.right():
            painter.drawLine(QLineF(x, rect.top(), x, rect.bottom()))
            x += step
        y = top
        while y < rect.bottom():
            painter.drawLine(QLineF(rect.left(), y, rect.right(), y))
            y += step

    # -- wall drawing mode --------------------------------------------------
    def set_mode(self, mode: str) -> None:
        self.mode = mode
        self._pending_wall_start = None
        if self._preview_line is not None:
            self.removeItem(self._preview_line)
            self._preview_line = None

    def _snap_point(self, pos: QPointF) -> QPointF:
        return QPointF(
            round(pos.x() / GRID_SNAP_MM) * GRID_SNAP_MM,
            round(pos.y() / GRID_SNAP_MM) * GRID_SNAP_MM,
        )

    def mousePressEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        if self.mode == "draw_wall" and event.button() == Qt.MouseButton.LeftButton:
            snapped = self._snap_point(event.scenePos())
            if self._pending_wall_start is None:
                self._pending_wall_start = snapped
                self._preview_line = QGraphicsLineItem(QLineF(snapped, snapped))
                self._preview_line.setPen(QPen(QColor("#2b6cb0"), 30, Qt.PenStyle.DashLine))
                self._preview_line.setZValue(100)
                self.addItem(self._preview_line)
            else:
                wall = Wall(id=next_id(), x1=self._pending_wall_start.x(), y1=self._pending_wall_start.y(),
                            x2=snapped.x(), y2=snapped.y())
                wall_gfx = WallItem(wall, GRID_SNAP_MM)
                self.undo_stack.push(AddItemCommand(self, wall, wall_gfx, self.project.walls, "Draw wall"))
                if self._preview_line is not None:
                    self.removeItem(self._preview_line)
                    self._preview_line = None
                self._pending_wall_start = snapped
                self._preview_line = QGraphicsLineItem(QLineF(snapped, snapped))
                self._preview_line.setPen(QPen(QColor("#2b6cb0"), 30, Qt.PenStyle.DashLine))
                self._preview_line.setZValue(100)
                self.addItem(self._preview_line)
            event.accept()
            return
        if self.mode == "draw_wall" and event.button() == Qt.MouseButton.RightButton:
            self.set_mode("draw_wall")  # cancels pending start
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        if self.mode == "draw_wall" and self._pending_wall_start is not None and self._preview_line is not None:
            snapped = self._snap_point(event.scenePos())
            self._preview_line.setLine(QLineF(self._pending_wall_start, snapped))
            event.accept()
            return
        super().mouseMoveEvent(event)

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self.set_mode(self.mode if self.mode != "draw_wall" else "select")
            event.accept()
            return
        if event.key() in (Qt.Key.Key_Delete, Qt.Key.Key_Backspace) and self.focusItem() is None:
            # focusItem() is set while a room label is being edited in place --
            # in that case Delete/Backspace must edit the text, not delete the item.
            self.remove_selected()
            event.accept()
            return
        super().keyPressEvent(event)
