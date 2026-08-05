"""QGraphicsScene subclass: grid background, wall drawing mode, item management.

Scene coordinates are millimeters. The scene edits one Floor's data at a time
via add/remove helpers so save/load and the graphics items never drift out of
sync; switching floors calls rebuild_from_floor() with a different Floor.
"""
from __future__ import annotations

from PySide6.QtCore import QLineF, QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QKeyEvent, QPainter, QPen, QPolygonF, QUndoStack
from PySide6.QtWidgets import QGraphicsLineItem, QGraphicsScene, QGraphicsSceneMouseEvent

from app.commands import AddItemCommand, DeleteItemsCommand, ModifyModelCommand
from app.items.furniture_item import FurnitureItem
from app.items.room_label_item import RoomLabelItem
from app.items.wall_item import WallItem
from app.models import Floor, PlacedItem, RoomLabel, Wall, next_id
from app.units import format_area

MINOR_GRID_MM = 100.0
MAJOR_GRID_MM = 1000.0
GRID_SNAP_MM = 50.0
NUDGE_KEYS = {
    Qt.Key.Key_Left: (-1, 0),
    Qt.Key.Key_Right: (1, 0),
    Qt.Key.Key_Up: (0, -1),
    Qt.Key.Key_Down: (0, 1),
}


class DesignScene(QGraphicsScene):
    def __init__(self, floor: Floor | None = None, undo_stack: QUndoStack | None = None):
        super().__init__()
        self.floor = floor or Floor(id=next_id())
        self.setSceneRect(QRectF(-20000, -20000, 40000, 40000))
        self.mode = "select"  # "select" | "draw_wall"
        self._pending_wall_start: QPointF | None = None
        self._preview_line: QGraphicsLineItem | None = None
        self.undo_stack = undo_stack or QUndoStack(self)
        self._clipboard: list[tuple[str, dict]] = []
        self.active_guides: list[QLineF] = []
        self.detected_rooms: list[tuple[QPolygonF, float]] = []
        self.rebuild_from_floor(self.floor, undo_stack=self.undo_stack)

    # -- floor sync -----------------------------------------------------
    def rebuild_from_floor(self, floor: Floor, undo_stack: QUndoStack | None = None) -> None:
        """Switch the scene to edit a different Floor. Pass the Floor's own
        persistent QUndoStack (owned by MainWindow's QUndoGroup) so undo
        history survives switching floors and back; omitting it starts a
        fresh, throwaway stack."""
        self.clear()
        self._preview_line = None
        self.floor = floor
        self.undo_stack = undo_stack or QUndoStack(self)
        self.detected_rooms = []
        for wall in floor.walls:
            self.addItem(WallItem(wall, GRID_SNAP_MM))
        for placed in floor.items:
            self.addItem(FurnitureItem(placed, GRID_SNAP_MM))
        for room_label in floor.room_labels:
            self.addItem(RoomLabelItem(room_label))

    def add_room_label(self, pos: QPointF, text: str = "Room") -> RoomLabelItem:
        model = RoomLabel(id=next_id(), text=text, x=pos.x(), y=pos.y())
        gfx = RoomLabelItem(model)
        self.undo_stack.push(AddItemCommand(self, model, gfx, self.floor.room_labels, "Add room label"))
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
        self.undo_stack.push(AddItemCommand(self, model, gfx, self.floor.items, "Add item"))
        return gfx

    def remove_selected(self) -> None:
        entries = []
        for gfx in list(self.selectedItems()):
            if isinstance(gfx, FurnitureItem):
                entries.append((gfx.model, gfx, self.floor.items))
            elif isinstance(gfx, WallItem):
                entries.append((gfx.model, gfx, self.floor.walls))
            elif isinstance(gfx, RoomLabelItem):
                entries.append((gfx.model, gfx, self.floor.room_labels))
        if entries:
            self.undo_stack.push(DeleteItemsCommand(self, entries, "Delete"))

    # -- clipboard ----------------------------------------------------------
    def copy_selection(self) -> None:
        clipboard: list[tuple[str, dict]] = []
        for gfx in self.selectedItems():
            if isinstance(gfx, FurnitureItem):
                clipboard.append(("item", gfx.model.to_dict()))
            elif isinstance(gfx, RoomLabelItem):
                clipboard.append(("label", gfx.model.to_dict()))
            elif isinstance(gfx, WallItem):
                clipboard.append(("wall", gfx.model.to_dict()))
        if clipboard:
            self._clipboard = clipboard

    def paste(self, offset: float = 250.0) -> None:
        if not self._clipboard:
            return
        self.undo_stack.beginMacro("Paste")
        new_items = []
        for kind, data in self._clipboard:
            data = dict(data)
            data["id"] = next_id()
            if kind == "item":
                data["x"] += offset
                data["y"] += offset
                model = PlacedItem.from_dict(data)
                gfx = FurnitureItem(model, GRID_SNAP_MM)
                self.undo_stack.push(AddItemCommand(self, model, gfx, self.floor.items, "Paste item"))
            elif kind == "label":
                data["x"] += offset
                data["y"] += offset
                model = RoomLabel.from_dict(data)
                gfx = RoomLabelItem(model)
                self.undo_stack.push(AddItemCommand(self, model, gfx, self.floor.room_labels, "Paste label"))
            elif kind == "wall":
                data["x1"] += offset
                data["y1"] += offset
                data["x2"] += offset
                data["y2"] += offset
                model = Wall.from_dict(data)
                gfx = WallItem(model, GRID_SNAP_MM)
                self.undo_stack.push(AddItemCommand(self, model, gfx, self.floor.walls, "Paste wall"))
            else:
                continue
            new_items.append(gfx)
        self.undo_stack.endMacro()
        self.clearSelection()
        for gfx in new_items:
            gfx.setSelected(True)

    def duplicate_selection(self) -> None:
        self.copy_selection()
        self.paste()

    def paste_entries(self, entries: list[tuple[str, dict]], anchor: QPointF) -> list:
        """Paste externally-supplied (kind, model-dict) entries (e.g. from a
        template) centered on `anchor`. Returns the new graphics items."""
        if not entries:
            return []
        xs, ys = [], []
        for kind, data in entries:
            if kind == "wall":
                xs += [data["x1"], data["x2"]]
                ys += [data["y1"], data["y2"]]
            else:
                xs.append(data["x"])
                ys.append(data["y"])
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        dx, dy = anchor.x() - cx, anchor.y() - cy

        self.undo_stack.beginMacro("Place Template")
        new_items = []
        for kind, data in entries:
            data = dict(data)
            data["id"] = next_id()
            if kind == "item":
                data["x"] += dx
                data["y"] += dy
                model = PlacedItem.from_dict(data)
                gfx = FurnitureItem(model, GRID_SNAP_MM)
                self.undo_stack.push(AddItemCommand(self, model, gfx, self.floor.items, "Place template item"))
            elif kind == "label":
                data["x"] += dx
                data["y"] += dy
                model = RoomLabel.from_dict(data)
                gfx = RoomLabelItem(model)
                self.undo_stack.push(AddItemCommand(self, model, gfx, self.floor.room_labels, "Place template label"))
            elif kind == "wall":
                data["x1"] += dx
                data["y1"] += dy
                data["x2"] += dx
                data["y2"] += dy
                model = Wall.from_dict(data)
                gfx = WallItem(model, GRID_SNAP_MM)
                self.undo_stack.push(AddItemCommand(self, model, gfx, self.floor.walls, "Place template wall"))
            else:
                continue
            new_items.append(gfx)
        self.undo_stack.endMacro()
        self.clearSelection()
        for gfx in new_items:
            gfx.setSelected(True)
        return new_items

    # -- keyboard nudge -------------------------------------------------------
    def _nudge_selected(self, dx: float, dy: float) -> None:
        selected = [g for g in self.selectedItems() if isinstance(g, (FurnitureItem, RoomLabelItem, WallItem))]
        if not selected:
            return
        self.undo_stack.beginMacro("Nudge")
        for gfx in selected:
            if isinstance(gfx, (FurnitureItem, RoomLabelItem)):
                if isinstance(gfx, FurnitureItem) and gfx.model.locked:
                    continue
                before = {"x": gfx.model.x, "y": gfx.model.y}
                after = {"x": before["x"] + dx, "y": before["y"] + dy}
                self.undo_stack.push(ModifyModelCommand(gfx, before, after, "Nudge"))
            elif isinstance(gfx, WallItem):
                before = {"x1": gfx.model.x1, "y1": gfx.model.y1, "x2": gfx.model.x2, "y2": gfx.model.y2}
                after = {"x1": before["x1"] + dx, "y1": before["y1"] + dy,
                          "x2": before["x2"] + dx, "y2": before["y2"] + dy}
                self.undo_stack.push(ModifyModelCommand(gfx, before, after, "Nudge"))
        self.undo_stack.endMacro()

    # -- room detection ---------------------------------------------------
    def detect_rooms(self) -> int:
        """Recompute enclosed-room polygons from the wall network and store
        them for drawForeground() to render. Returns the number found."""
        from app.room_detection import find_room_polygons

        self.detected_rooms = find_room_polygons(self.floor.walls)
        self.update()
        return len(self.detected_rooms)

    def clear_detected_rooms(self) -> None:
        self.detected_rooms = []
        self.update()

    # -- grid background ---------------------------------------------------
    def drawBackground(self, painter: QPainter, rect: QRectF) -> None:
        painter.fillRect(rect, QColor(self.floor.background_color))
        self._draw_grid(painter, rect, MINOR_GRID_MM, QColor("#e5e5e5"), 4)
        self._draw_grid(painter, rect, MAJOR_GRID_MM, QColor("#c9c9c9"), 8)

    def drawForeground(self, painter: QPainter, rect: QRectF) -> None:
        """Draw detected-room overlays (if any), fill wall-corner joints so
        segments read as one continuous wall, and draw active alignment
        guides while an item is being dragged."""
        if self.detected_rooms:
            painter.setPen(QPen(QColor("#2b6cb0"), 8, Qt.PenStyle.DashDotLine))
            painter.setBrush(QBrush(QColor(43, 108, 176, 40)))
            font = painter.font()
            font.setPointSizeF(220)
            font.setBold(True)
            painter.setFont(font)
            for polygon, area_sq_mm in self.detected_rooms:
                painter.drawPolygon(polygon)
                centroid = polygon.boundingRect().center()
                painter.setPen(QColor("#1a3a5c"))
                painter.drawText(centroid, format_area(area_sq_mm))
                painter.setPen(QPen(QColor("#2b6cb0"), 8, Qt.PenStyle.DashDotLine))

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

        if self.active_guides:
            pen = QPen(QColor("#e07a3f"), 6, Qt.PenStyle.DashLine)
            painter.setPen(pen)
            painter.setBrush(Qt.BrushStyle.NoBrush)
            for line in self.active_guides:
                painter.drawLine(line)

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
                self.undo_stack.push(AddItemCommand(self, wall, wall_gfx, self.floor.walls, "Draw wall"))
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
        if event.key() in NUDGE_KEYS and self.focusItem() is None:
            dx, dy = NUDGE_KEYS[event.key()]
            step = GRID_SNAP_MM * (5 if event.modifiers() & Qt.KeyboardModifier.ShiftModifier else 1)
            self._nudge_selected(dx * step, dy * step)
            event.accept()
            return
        super().keyPressEvent(event)
