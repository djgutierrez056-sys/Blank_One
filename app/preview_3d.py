"""Lightweight 3D-ish preview: extrudes the current floor's walls and
furniture into boxes and renders them with a simple, adjustable-azimuth
oblique projection. This is a static preview, not a full 3D engine/walkthrough
-- no lighting, no true perspective, no camera pitch -- but it gives a quick
sense of the layout's volume without pulling in an OpenGL/Qt3D dependency.
"""
from __future__ import annotations

import math

from PySide6.QtCore import QPointF, QRectF, Qt, QTimer
from PySide6.QtGui import QBrush, QColor, QPainter, QPolygonF
from PySide6.QtWidgets import (
    QDialog,
    QGraphicsScene,
    QGraphicsView,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSlider,
    QVBoxLayout,
)

from app.models import Floor

WALL_HEIGHT_MM = 2400.0
FURNITURE_HEIGHT_MM = 900.0
FLOOR_Z = 0.0


def _project(x: float, y: float, z: float, azimuth_deg: float) -> QPointF:
    """Oblique/dimetric-style projection: rotate around Z by azimuth, then
    flatten with a fixed elevation squish. Not a true isometric matrix, but
    close enough in spirit for a lightweight preview."""
    a = math.radians(azimuth_deg)
    rx = x * math.cos(a) - y * math.sin(a)
    ry = x * math.sin(a) + y * math.cos(a)
    screen_x = rx
    screen_y = ry * 0.5 - z
    return QPointF(screen_x, screen_y)


class Preview3DDialog(QDialog):
    def __init__(self, floor: Floor, parent=None):
        super().__init__(parent)
        self.floor = floor
        self.azimuth = 30.0
        self.setWindowTitle(f"3D Preview -- {floor.name}")
        self.resize(900, 650)

        self.scene3d = QGraphicsScene()
        self.view = QGraphicsView(self.scene3d)
        self.view.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.view.scale(0.12, 0.12)

        slider_row = QHBoxLayout()
        slider_row.addWidget(QLabel("Rotate:"))
        self.slider = QSlider(Qt.Orientation.Horizontal)
        self.slider.setRange(0, 359)
        self.slider.setValue(int(self.azimuth))
        self.slider.valueChanged.connect(self._on_azimuth_changed)
        slider_row.addWidget(self.slider)
        refresh_button = QPushButton("Refresh")
        refresh_button.clicked.connect(self._rebuild)
        slider_row.addWidget(refresh_button)

        note = QLabel(
            "Lightweight extruded preview (walls + furniture as boxes) -- not a full 3D walkthrough."
        )
        note.setStyleSheet("color: #777777;")

        layout = QVBoxLayout(self)
        layout.addWidget(self.view)
        layout.addLayout(slider_row)
        layout.addWidget(note)

        self._rebuild()
        QTimer.singleShot(0, self._rebuild)  # re-fit once the dialog has its real, laid-out size

    def _on_azimuth_changed(self, value: int) -> None:
        self.azimuth = float(value)
        self._rebuild()

    def _add_rotated_box(
        self, cx: float, cy: float, angle_rad: float, length: float, depth: float,
        z0: float, height: float, color: QColor,
    ) -> None:
        """Draw a box centered at (cx,cy), rotated by angle_rad in plan, from
        z0 to z0+height, as its top face plus two camera-facing side faces
        (drawn back-to-front for a rough painter's-algorithm depth order)."""
        hl, hd = length / 2, depth / 2
        cos_a, sin_a = math.cos(angle_rad), math.sin(angle_rad)

        def rot(lx: float, ly: float) -> tuple[float, float]:
            return (cx + lx * cos_a - ly * sin_a, cy + lx * sin_a + ly * cos_a)

        bottom = [rot(-hl, -hd), rot(hl, -hd), rot(hl, hd), rot(-hl, hd)]
        bottom3 = [(x, y, z0) for x, y in bottom]
        top3 = [(x, y, z0 + height) for x, y in bottom]

        top_poly = QPolygonF([_project(*p, self.azimuth) for p in top3])
        self.scene3d.addPolygon(top_poly, QColor("#333333"), QBrush(color.lighter(115)))

        for i, shade in ((0, 0.85), (1, 0.7)):
            side = [bottom3[i], bottom3[(i + 1) % 4], top3[(i + 1) % 4], top3[i]]
            poly = QPolygonF([_project(*p, self.azimuth) for p in side])
            self.scene3d.addPolygon(poly, QColor("#333333"), QBrush(color.darker(int(100 / shade))))

    def _rebuild(self) -> None:
        self.scene3d.clear()

        for wall in self.floor.walls:
            length = math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1)
            if length == 0:
                continue
            angle = math.atan2(wall.y2 - wall.y1, wall.x2 - wall.x1)
            cx, cy = (wall.x1 + wall.x2) / 2, (wall.y1 + wall.y2) / 2
            self._add_rotated_box(cx, cy, angle, length, wall.thickness, FLOOR_Z, WALL_HEIGHT_MM, QColor("#8a8a8a"))

        for item in self.floor.items:
            angle = math.radians(item.rotation)
            self._add_rotated_box(
                item.x, item.y, angle, item.width, item.height, FLOOR_Z, FURNITURE_HEIGHT_MM, QColor(item.color)
            )

        if self.floor.walls:
            xs = [w.x1 for w in self.floor.walls] + [w.x2 for w in self.floor.walls]
            ys = [w.y1 for w in self.floor.walls] + [w.y2 for w in self.floor.walls]
            margin = 1000
            ground = [
                (min(xs) - margin, min(ys) - margin, FLOOR_Z),
                (max(xs) + margin, min(ys) - margin, FLOOR_Z),
                (max(xs) + margin, max(ys) + margin, FLOOR_Z),
                (min(xs) - margin, max(ys) + margin, FLOOR_Z),
            ]
            poly = QPolygonF([_project(*p, self.azimuth) for p in ground])
            ground_item = self.scene3d.addPolygon(poly, QColor("#cccccc"), QBrush(QColor("#f0f0e8")))
            ground_item.setZValue(-1000)

        bounds = self.scene3d.itemsBoundingRect()
        self.scene3d.setSceneRect(bounds.adjusted(-500, -500, 500, 500))
        if not bounds.isEmpty():
            self.view.fitInView(bounds.adjusted(-300, -300, 300, 300), Qt.AspectRatioMode.KeepAspectRatio)
