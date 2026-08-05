"""QGraphicsView for the interactive 3D scene: left-drag on empty space (or
the ground plane) orbits the camera, left-drag on a furniture box moves/
rotates it (handled by Box3DItem itself), and the wheel zooms -- the same
"click background to orbit, click object to manipulate it" convention games
like the Sims use for a fixed-angle, rotatable camera.
"""
from __future__ import annotations

from PySide6.QtCore import QPoint, Qt
from PySide6.QtGui import QMouseEvent, QPainter, QWheelEvent
from PySide6.QtWidgets import QGraphicsView

from app.scene_3d import Interactive3DScene

ORBIT_AZIMUTH_SENSITIVITY = 0.3
ORBIT_TILT_SENSITIVITY = 0.004


class Interactive3DView(QGraphicsView):
    def __init__(self, scene: Interactive3DScene):
        super().__init__(scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.NoDrag)
        self.scale(0.13, 0.13)
        self._orbiting = False
        self._orbit_last = QPoint()

    def _is_orbitable_target(self, pos) -> bool:
        item = self.itemAt(pos)
        ground = self.scene().ground_item
        return item is None or item is ground

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton and self._is_orbitable_target(event.pos()):
            self._orbiting = True
            self._orbit_last = event.pos()
            self.setCursor(Qt.CursorShape.ClosedHandCursor)
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if self._orbiting:
            delta = event.pos() - self._orbit_last
            self._orbit_last = event.pos()
            self.scene().camera.rotate(delta.x() * ORBIT_AZIMUTH_SENSITIVITY, -delta.y() * ORBIT_TILT_SENSITIVITY)
            self.scene().rebuild_visuals()
            event.accept()
            return
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if self._orbiting and event.button() == Qt.MouseButton.LeftButton:
            self._orbiting = False
            self.setCursor(Qt.CursorShape.ArrowCursor)
            event.accept()
            return
        super().mouseReleaseEvent(event)

    def wheelEvent(self, event: QWheelEvent) -> None:
        factor = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
        self.scale(factor, factor)
