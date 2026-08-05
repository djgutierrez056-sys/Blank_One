"""Interactive 3D scene: walls and furniture rendered as extruded boxes under
a rotatable oblique camera (see camera3d.py). Furniture can be clicked,
dragged (translated on the floor plane), and rotated directly in this view --
walls stay in the 2D plan for precise drawing/dimensioning, matching how a
Sims-style "live in it" view differs from the blueprint you build from.

Because the camera projection is affine (no true perspective), a screen-space
drag delta inverts exactly back to a world (x, y) delta -- that's what makes
direct 3D dragging possible here without ray-casting/picking machinery.
"""
from __future__ import annotations

import math
from enum import Enum, auto

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QPainter, QPainterPath, QPen
from PySide6.QtWidgets import (
    QGraphicsItem,
    QGraphicsScene,
    QGraphicsSceneMouseEvent,
    QStyleOptionGraphicsItem,
    QWidget,
)

from app.camera3d import Camera
from app.commands import AddItemCommand, DeleteItemsCommand
from app.models import Floor, PlacedItem, Wall, next_id

WALL_HEIGHT_MM = 2400.0
FURNITURE_HEIGHT_MM = 900.0
ROTATE_HANDLE_HEIGHT_MM = 500.0  # above the box top
HANDLE_RADIUS_MM = 120.0


def _rotated_box_corners(cx: float, cy: float, angle_rad: float, length: float, depth: float, z0: float, height: float):
    hl, hd = length / 2, depth / 2
    cos_a, sin_a = math.cos(angle_rad), math.sin(angle_rad)

    def rot(lx: float, ly: float) -> tuple[float, float]:
        return (cx + lx * cos_a - ly * sin_a, cy + lx * sin_a + ly * cos_a)

    bottom = [rot(-hl, -hd), rot(hl, -hd), rot(hl, hd), rot(-hl, hd)]
    bottom3 = [(x, y, z0) for x, y in bottom]
    top3 = [(x, y, z0 + height) for x, y in bottom]
    return bottom3, top3


class DragMode(Enum):
    NONE = auto()
    MOVE = auto()
    ROTATE = auto()


class Box3DItem(QGraphicsItem):
    """One extruded box: either a static wall segment or a movable, rotatable
    furniture piece. Geometry is computed fresh from the model + camera on
    every paint/boundingRect call (cheap for typical item counts), so
    reproject() just has to invalidate the cached bounding rect."""

    def __init__(self, kind: str, model, camera: Camera, grid_snap_mm: float = 50.0, room_center: tuple[float, float] | None = None):
        super().__init__()
        self.kind = kind  # "wall" | "item"
        self.model = model
        self.camera = camera
        self.grid_snap_mm = grid_snap_mm
        self.room_center = room_center
        movable = kind == "item"
        flags = QGraphicsItem.GraphicsItemFlag.ItemIsSelectable
        self.setFlags(flags)
        self.setAcceptHoverEvents(movable)
        self._drag_mode = DragMode.NONE
        self._drag_start_screen = QPointF()
        self._drag_start_center = (0.0, 0.0)
        self._before_snapshot: dict | None = None
        self._update_depth()
        self._update_cutaway()

    def _outward_normal(self) -> tuple[float, float] | None:
        """Unit vector pointing from the room's center out through this
        wall, used to test whether the wall sits between the camera and the
        interior. None if there's no room_center to compare against."""
        if self.room_center is None:
            return None
        cx, cy, _angle, _l, _d, _z0, _h, _c = self._params()
        dx, dy = cx - self.room_center[0], cy - self.room_center[1]
        norm = math.hypot(dx, dy)
        if norm < 1e-6:
            return None
        return (dx / norm, dy / norm)

    def _update_cutaway(self) -> None:
        """Sims-style wall cutaway: fade out walls (and their corner posts)
        that sit between the camera and the room's interior, so the inside
        of an enclosed room stays visible instead of being hidden behind its
        own near walls -- correct occlusion alone makes a fully-walled room
        impossible to see into from any angle."""
        if self.kind != "wall":
            return
        normal = self._outward_normal()
        if normal is None:
            self.setOpacity(1.0)
            return
        a = math.radians(self.camera.azimuth)
        camera_dir = (math.sin(a), math.cos(a))
        facing = normal[0] * camera_dir[0] + normal[1] * camera_dir[1]
        self.setOpacity(0.12 if facing > 0.15 else 1.0)

    # -- geometry -----------------------------------------------------------
    def _params(self):
        if self.kind == "wall":
            w: Wall = self.model
            length = math.hypot(w.x2 - w.x1, w.y2 - w.y1)
            angle = math.atan2(w.y2 - w.y1, w.x2 - w.x1)
            cx, cy = (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2
            return cx, cy, angle, max(length, 1.0), w.thickness, 0.0, WALL_HEIGHT_MM, QColor("#8a8a8a")
        item: PlacedItem = self.model
        angle = math.radians(item.rotation)
        return item.x, item.y, angle, item.width, item.height, 0.0, FURNITURE_HEIGHT_MM, QColor(item.color)

    def _update_depth(self) -> None:
        """Painter's-algorithm z-order: objects further from the camera along
        its view direction must be drawn first (lower Z) so nearer objects
        correctly occlude them. A static Z per kind (the original approach)
        ignores camera angle entirely, so a piece of furniture on the far
        side of the room could render in front of a wall that should be
        blocking it -- exactly the "floating" look this fixes. Recomputed on
        every reproject() since it depends on the current azimuth."""
        cx, cy, _angle, _l, _d, _z0, _h, _c = self._params()
        a = math.radians(self.camera.azimuth)
        depth = cx * math.sin(a) + cy * math.cos(a)
        self.setZValue(depth)

    def reproject(self) -> None:
        self.prepareGeometryChange()
        self._update_depth()
        self._update_cutaway()
        self.update()

    def sync_from_model(self) -> None:
        self.reproject()

    def _face_polygons(self):
        cx, cy, angle, length, depth, z0, height, color = self._params()
        bottom3, top3 = _rotated_box_corners(cx, cy, angle, length, depth, z0, height)
        proj = self.camera.project
        top_face = [proj(*p) for p in top3]
        side_a = [proj(*bottom3[0]), proj(*bottom3[1]), proj(*top3[1]), proj(*top3[0])]
        side_b = [proj(*bottom3[1]), proj(*bottom3[2]), proj(*top3[2]), proj(*top3[1])]
        return top_face, side_a, side_b, color

    def boundingRect(self) -> QRectF:
        top_face, side_a, side_b, _color = self._face_polygons()
        all_pts = top_face + side_a + side_b
        xs = [p.x() for p in all_pts]
        ys = [p.y() for p in all_pts]
        margin = HANDLE_RADIUS_MM + ROTATE_HANDLE_HEIGHT_MM
        return QRectF(min(xs) - margin, min(ys) - margin, max(xs) - min(xs) + 2 * margin, max(ys) - min(ys) + 2 * margin)

    def shape(self) -> QPainterPath:
        top_face, side_a, side_b, _color = self._face_polygons()
        path = QPainterPath()
        path.setFillRule(Qt.FillRule.WindingFill)
        for face in (top_face, side_a, side_b):
            sub = QPainterPath()
            sub.moveTo(face[0])
            for p in face[1:]:
                sub.lineTo(p)
            sub.closeSubpath()
            path.addPath(sub)
        return path

    def _rotate_handle_screen(self) -> QPointF:
        cx, cy, _angle, _l, _d, z0, height, _c = self._params()
        return self.camera.project(cx, cy, z0 + height + ROTATE_HANDLE_HEIGHT_MM)

    # -- painting -------------------------------------------------------
    def paint(self, painter: QPainter, option: QStyleOptionGraphicsItem, widget: QWidget | None = None) -> None:
        top_face, side_a, side_b, color = self._face_polygons()
        pen = QPen(QColor("#2b6cb0") if self.isSelected() else QColor("#333333"), 10 if self.isSelected() else 6)
        painter.setPen(pen)

        painter.setBrush(QBrush(color.lighter(115)))
        painter.drawPolygon(top_face)
        painter.setBrush(QBrush(color.darker(int(100 / 0.85))))
        painter.drawPolygon(side_a)
        painter.setBrush(QBrush(color.darker(int(100 / 0.7))))
        painter.drawPolygon(side_b)

        if self.isSelected() and self.kind == "item":
            painter.setPen(QPen(QColor("#e07a3f"), 6))
            painter.setBrush(QBrush(QColor("#e07a3f")))
            painter.drawEllipse(self._rotate_handle_screen(), HANDLE_RADIUS_MM, HANDLE_RADIUS_MM)

    # -- interaction ------------------------------------------------------
    def _snapshot(self) -> dict:
        if self.kind == "wall":
            return {"x1": self.model.x1, "y1": self.model.y1, "x2": self.model.x2, "y2": self.model.y2}
        return {"x": self.model.x, "y": self.model.y, "rotation": self.model.rotation}

    def mousePressEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        if self.kind != "item":
            event.ignore()
            return
        self.setSelected(True)
        self._before_snapshot = self._snapshot()
        if self.isSelected() and (event.scenePos() - self._rotate_handle_screen()).manhattanLength() <= HANDLE_RADIUS_MM * 1.5:
            self._drag_mode = DragMode.ROTATE
        else:
            self._drag_mode = DragMode.MOVE
        self._drag_start_screen = event.scenePos()
        self._drag_start_center = (self.model.x, self.model.y)
        event.accept()

    def mouseMoveEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        if self._drag_mode == DragMode.NONE:
            event.ignore()
            return
        self.prepareGeometryChange()
        if self._drag_mode == DragMode.MOVE:
            delta = event.scenePos() - self._drag_start_screen
            dx, dy = self.camera.inverse_delta(delta.x(), delta.y())
            new_x = self._drag_start_center[0] + dx
            new_y = self._drag_start_center[1] + dy
            if self.grid_snap_mm > 0:
                new_x = round(new_x / self.grid_snap_mm) * self.grid_snap_mm
                new_y = round(new_y / self.grid_snap_mm) * self.grid_snap_mm
            self.model.x, self.model.y = new_x, new_y
            self._update_depth()
        elif self._drag_mode == DragMode.ROTATE:
            world_x, world_y = self.camera.world_point_at_z(event.scenePos(), (self.model.x, self.model.y), z=0.0)
            angle = math.degrees(math.atan2(world_y - self.model.y, world_x - self.model.x))
            self.model.rotation = angle % 360
        self.update()

    def mouseReleaseEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        self._drag_mode = DragMode.NONE
        if self._before_snapshot is not None:
            after = self._snapshot()
            if after != self._before_snapshot and self.scene() is not None:
                from app.commands import ModifyModelCommand

                self.scene().undo_stack.push(ModifyModelCommand(self, self._before_snapshot, after, "Move in 3D"))
            self._before_snapshot = None


class WallJointItem(Box3DItem):
    """Fills the gap where two wall boxes' square-cut ends meet at a corner
    (each wall is an independent box, same as in the 2D view's corner-joint
    fix) -- a small non-interactive post at the shared point, sized to the
    thickest joining wall."""

    def __init__(self, cx: float, cy: float, size: float, camera: Camera, room_center: tuple[float, float] | None = None):
        self._cx, self._cy, self._size = cx, cy, size
        super().__init__("wall", None, camera, room_center=room_center)

    def _params(self):
        return self._cx, self._cy, 0.0, self._size, self._size, 0.0, WALL_HEIGHT_MM, QColor("#8a8a8a")


class GroundPlaneItem(QGraphicsItem):
    """Non-interactive backdrop plane so there's a visible floor/ground to
    orbit around even before any walls exist."""

    def __init__(self, camera: Camera, half_extent: float = 6000.0):
        super().__init__()
        self.camera = camera
        self.half_extent = half_extent
        self.setZValue(-1000)

    def set_extent(self, half_extent: float) -> None:
        self.half_extent = half_extent
        self.reproject()

    def reproject(self) -> None:
        self.prepareGeometryChange()
        self.update()

    def _corners(self):
        e = self.half_extent
        return [self.camera.project(x, y, 0) for x, y in ((-e, -e), (e, -e), (e, e), (-e, e))]

    def boundingRect(self) -> QRectF:
        pts = self._corners()
        xs, ys = [p.x() for p in pts], [p.y() for p in pts]
        return QRectF(min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))

    def paint(self, painter: QPainter, option: QStyleOptionGraphicsItem, widget: QWidget | None = None) -> None:
        painter.setPen(QPen(QColor("#d8d8d0"), 4))
        painter.setBrush(QBrush(QColor("#f2f1e8")))
        painter.drawPolygon(self._corners())


class Interactive3DScene(QGraphicsScene):
    def __init__(self, floor: Floor, camera: Camera, undo_stack, grid_snap_mm: float = 50.0):
        super().__init__()
        self.floor = floor
        self.camera = camera
        self.undo_stack = undo_stack
        self.grid_snap_mm = grid_snap_mm
        self.ground_item: GroundPlaneItem | None = None
        self.rebuild_from_floor(floor, undo_stack)

    def rebuild_from_floor(self, floor: Floor, undo_stack) -> None:
        self.clear()
        self.floor = floor
        self.undo_stack = undo_stack
        room_center = self._room_center(floor.walls)
        self.ground_item = GroundPlaneItem(self.camera, self._ground_half_extent())
        self.addItem(self.ground_item)
        for wall in floor.walls:
            self.addItem(Box3DItem("wall", wall, self.camera, self.grid_snap_mm, room_center=room_center))
        for cx, cy, size in self._wall_joints(floor.walls):
            self.addItem(WallJointItem(cx, cy, size, self.camera, room_center=room_center))
        for item in floor.items:
            self.addItem(Box3DItem("item", item, self.camera, self.grid_snap_mm))

    @staticmethod
    def _room_center(walls: list[Wall]) -> tuple[float, float] | None:
        if not walls:
            return None
        xs = [w.x1 for w in walls] + [w.x2 for w in walls]
        ys = [w.y1 for w in walls] + [w.y2 for w in walls]
        return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)

    @staticmethod
    def _wall_joints(walls: list[Wall]) -> list[tuple[float, float, float]]:
        """Corner posts for both shared-endpoint (L) corners and T-junctions
        (one wall's endpoint touching another wall's interior, e.g. an
        interior dividing wall) -- without the latter, dividing walls show
        exactly the kind of visible gap reported."""
        from app.geometry import closest_point_on_segment

        groups: dict[tuple[int, int], list[float]] = {}
        for wall in walls:
            for x, y in ((wall.x1, wall.y1), (wall.x2, wall.y2)):
                key = (round(x), round(y))
                groups.setdefault(key, []).append(wall.thickness)
        joints = [(x, y, max(t)) for (x, y), t in groups.items() if len(t) >= 2]
        seen = {(round(x), round(y)) for x, y, _t in joints}

        for wall in walls:
            for ex, ey in ((wall.x1, wall.y1), (wall.x2, wall.y2)):
                key = (round(ex), round(ey))
                if key in seen:
                    continue
                for other in walls:
                    if other is wall:
                        continue
                    _closest, dist = closest_point_on_segment(
                        QPointF(ex, ey), QPointF(other.x1, other.y1), QPointF(other.x2, other.y2)
                    )
                    if dist <= 5.0:
                        seen.add(key)
                        joints.append((ex, ey, max(wall.thickness, other.thickness)))
                        break
        return joints

    def _ground_half_extent(self) -> float:
        pts_x, pts_y = [], []
        for w in self.floor.walls:
            pts_x += [w.x1, w.x2]
            pts_y += [w.y1, w.y2]
        for it in self.floor.items:
            pts_x.append(it.x)
            pts_y.append(it.y)
        if not pts_x:
            return 6000.0
        span = max(max(pts_x) - min(pts_x), max(pts_y) - min(pts_y))
        return max(4000.0, span)

    def remove_selected(self) -> None:
        """Only furniture (kind == "item") is ever selectable in 3D -- walls
        stay non-interactive here by design (see module docstring)."""
        entries = []
        for gfx in list(self.selectedItems()):
            if isinstance(gfx, Box3DItem) and gfx.kind == "item":
                entries.append((gfx.model, gfx, self.floor.items))
        if entries:
            self.undo_stack.push(DeleteItemsCommand(self, entries, "Delete"))

    def duplicate_selected(self, offset: float = 250.0) -> None:
        selected = [g for g in self.selectedItems() if isinstance(g, Box3DItem) and g.kind == "item"]
        if not selected:
            return
        self.undo_stack.beginMacro("Duplicate")
        new_boxes = []
        for gfx in selected:
            data = gfx.model.to_dict()
            data["id"] = next_id()
            data["x"] += offset
            data["y"] += offset
            model = PlacedItem.from_dict(data)
            new_gfx = Box3DItem("item", model, self.camera, self.grid_snap_mm)
            self.undo_stack.push(AddItemCommand(self, model, new_gfx, self.floor.items, "Duplicate item"))
            new_boxes.append(new_gfx)
        self.undo_stack.endMacro()
        self.clearSelection()
        for gfx in new_boxes:
            gfx.setSelected(True)

    def rebuild_visuals(self) -> None:
        """Camera changed (orbit/tilt/zoom) -- everything needs reprojecting,
        but the underlying model data is untouched."""
        for gfx in self.items():
            reproject = getattr(gfx, "reproject", None)
            if reproject is not None:
                reproject()
        self.update()
