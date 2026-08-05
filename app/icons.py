"""Simple vector "architectural symbol" line-art for each catalog item type,
drawn on top of an item's colored body rect instead of leaving it blank.
Everything here is plain QPainter primitives (no image assets) so it scales
cleanly at any zoom level.
"""
from __future__ import annotations

import math
from typing import Callable

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QBrush, QColor, QPainter, QPen

LINE_COLOR = QColor("#333333")


def _inset(rect: QRectF, frac: float = 0.12) -> QRectF:
    m = min(rect.width(), rect.height()) * frac
    return rect.adjusted(m, m, -m, -m)


def _line_pen(width: float = 10.0) -> QPen:
    pen = QPen(LINE_COLOR, width)
    pen.setCosmetic(False)
    return pen


def _bed(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.08)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    pillow_h = r.height() * 0.22
    p.drawRect(QRectF(r.left(), r.top(), r.width(), pillow_h))
    fold_y = r.top() + r.height() * 0.55
    p.drawLine(QPointF(r.left(), fold_y), QPointF(r.right(), fold_y))


def _dresser(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen())
    n = 3
    for i in range(1, n):
        y = r.top() + r.height() * i / n
        p.drawLine(QPointF(r.left(), y), QPointF(r.right(), y))


def _toilet(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    tank_h = r.height() * 0.28
    p.drawRect(QRectF(r.left(), r.top(), r.width(), tank_h))
    bowl = QRectF(r.left() + r.width() * 0.1, r.top() + tank_h, r.width() * 0.8, r.height() - tank_h)
    p.drawEllipse(bowl)


def _sink(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.12)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawRoundedRect(r, r.width() * 0.15, r.height() * 0.15)
    basin = r.adjusted(r.width() * 0.18, r.height() * 0.18, -r.width() * 0.18, -r.height() * 0.18)
    p.drawEllipse(basin)


def _bathtub(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.06)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawRoundedRect(r, r.width() * 0.2, r.height() * 0.35)
    inner = r.adjusted(r.width() * 0.1, r.height() * 0.15, -r.width() * 0.1, -r.height() * 0.15)
    p.drawRoundedRect(inner, inner.width() * 0.2, inner.height() * 0.3)


def _drum_appliance(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    side = min(r.width(), r.height()) * 0.65
    drum = QRectF(0, 0, side, side)
    drum.moveCenter(r.center())
    p.drawEllipse(drum)
    knob_r = side * 0.08
    p.drawEllipse(QPointF(r.center().x(), r.top() + knob_r * 1.5), knob_r, knob_r)


def _fridge(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.08)
    p.setPen(_line_pen())
    mid_x = r.center().x()
    p.drawLine(QPointF(mid_x, r.top()), QPointF(mid_x, r.bottom()))


def _stove(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.12)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    burner_r = min(r.width(), r.height()) * 0.16
    for dx in (-1, 1):
        for dy in (-1, 1):
            cx = r.center().x() + dx * r.width() * 0.25
            cy = r.center().y() + dy * r.height() * 0.25
            p.drawEllipse(QPointF(cx, cy), burner_r, burner_r)


def _table(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawRoundedRect(r, r.width() * 0.05, r.height() * 0.05)


def _sofa(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.08)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    back_h = r.height() * 0.25
    p.drawRect(QRectF(r.left(), r.top(), r.width(), back_h))
    n = 3
    for i in range(1, n):
        x = r.left() + r.width() * i / n
        p.drawLine(QPointF(x, r.top() + back_h), QPointF(x, r.bottom()))


def _door(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    radius = r.height() * 3.0
    hinge = QPointF(r.left(), r.center().y())
    leaf_end = QPointF(r.left(), r.center().y() - radius)
    p.drawLine(hinge, leaf_end)
    arc_rect = QRectF(hinge.x() - radius, hinge.y() - radius, radius * 2, radius * 2)
    p.drawArc(arc_rect, 90 * 16, 90 * 16)


def _window(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(6))
    mid_y = r.center().y()
    p.drawLine(QPointF(r.left(), mid_y), QPointF(r.right(), mid_y))
    for x in (r.left(), r.right()):
        p.drawLine(QPointF(x, r.top()), QPointF(x, r.bottom()))


def _pool(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.06)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawRoundedRect(r, r.width() * 0.15, r.height() * 0.15)
    for frac in (0.35, 0.5, 0.65):
        y = r.top() + r.height() * frac
        path_start = QPointF(r.left() + r.width() * 0.15, y)
        p.drawLine(path_start, QPointF(r.right() - r.width() * 0.15, y))


def _garden_bed(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen(6))
    p.setBrush(Qt.BrushStyle.NoBrush)
    cols, rows = 3, 2
    for i in range(cols):
        for j in range(rows):
            cx = r.left() + r.width() * (i + 0.5) / cols
            cy = r.top() + r.height() * (j + 0.5) / rows
            rad = min(r.width() / cols, r.height() / rows) * 0.25
            p.drawEllipse(QPointF(cx, cy), rad, rad)


def _tree(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    canopy = _inset(r, 0.05)
    p.drawEllipse(canopy)
    inner = _inset(r, 0.25)
    p.drawEllipse(inner)
    p.drawEllipse(QPointF(r.center().x(), r.center().y()), r.width() * 0.06, r.width() * 0.06)


def _shrub(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(6))
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawEllipse(_inset(r, 0.1))


def _patio(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.05)
    p.setPen(_line_pen(4))
    step = min(r.width(), r.height()) / 4
    x = r.left() - r.height()
    while x < r.right():
        p.drawLine(QPointF(x, r.bottom()), QPointF(x + r.height(), r.top()))
        x += step


def _walkway(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(4))
    n = 5
    for i in range(1, n):
        y = r.top() + r.height() * i / n
        p.drawLine(QPointF(r.left(), y), QPointF(r.right(), y))


def _shed(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.08)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    roof_h = r.height() * 0.3
    p.drawLine(QPointF(r.left(), r.top() + roof_h), QPointF(r.center().x(), r.top()))
    p.drawLine(QPointF(r.center().x(), r.top()), QPointF(r.right(), r.top() + roof_h))
    p.drawLine(QPointF(r.left(), r.top() + roof_h), QPointF(r.right(), r.top() + roof_h))


def _fence(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(6))
    n = max(2, int(r.width() / (r.height() * 1.2)))
    for i in range(n + 1):
        x = r.left() + r.width() * i / n
        p.drawLine(QPointF(x, r.top()), QPointF(x, r.bottom()))


def _grill(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    body = _inset(r, 0.15)
    p.drawEllipse(body)
    p.drawLine(QPointF(r.center().x(), body.top()), QPointF(r.center().x(), r.top()))


def _mailbox(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(6))
    p.setBrush(Qt.BrushStyle.NoBrush)
    box = _inset(r, 0.2)
    p.drawRoundedRect(box, box.width() * 0.3, box.height() * 0.3)
    p.drawLine(QPointF(r.center().x(), box.bottom()), QPointF(r.center().x(), r.bottom()))


def _driveway(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.05)
    p.setPen(_line_pen(4))
    step = min(r.width(), r.height()) / 3
    x = r.left() - r.height()
    while x < r.right():
        p.drawLine(QPointF(x, r.bottom()), QPointF(x + r.height(), r.top()))
        x += step


def _hot_tub(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawEllipse(r)
    inner = _inset(r, 0.25)
    p.drawEllipse(inner)


def _firepit(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.12)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawEllipse(r)
    cx, cy = r.center().x(), r.center().y()
    for dx, dy in ((0, -1), (-0.6, 0.6), (0.6, 0.6)):
        p.drawLine(QPointF(cx, cy), QPointF(cx + dx * r.width() * 0.3, cy + dy * r.height() * 0.3))


def _playground(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawLine(QPointF(r.left(), r.bottom()), QPointF(r.left(), r.top()))
    p.drawLine(QPointF(r.right(), r.bottom()), QPointF(r.right(), r.top()))
    p.drawLine(QPointF(r.left(), r.top()), QPointF(r.right(), r.top()))
    mid_x = r.center().x()
    p.drawLine(QPointF(mid_x, r.top()), QPointF(mid_x, r.top() + r.height() * 0.5))


def _garden_path(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(4))
    p.setBrush(Qt.BrushStyle.NoBrush)
    n = 5
    stone_h = r.height() / n * 0.55
    for i in range(n):
        cy = r.top() + r.height() * (i + 0.5) / n
        stone = QRectF(r.left(), cy - stone_h / 2, r.width(), stone_h)
        p.drawEllipse(stone)


def _compost_bin(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawRect(r)
    p.drawLine(r.topLeft(), r.bottomRight())
    p.drawLine(r.topRight(), r.bottomLeft())


def _rain_barrel(p: QPainter, r: QRectF) -> None:
    r = _inset(r, 0.1)
    p.setPen(_line_pen())
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawEllipse(r)
    inner = _inset(r, 0.3)
    p.drawEllipse(inner)


def _stairs(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(6))
    n = 6
    for i in range(1, n):
        y = r.top() + r.height() * i / n
        p.drawLine(QPointF(r.left(), y), QPointF(r.right(), y))
    p.drawLine(QPointF(r.left(), r.top()), QPointF(r.right(), r.top()))


def _closet(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(6))
    p.setBrush(Qt.BrushStyle.NoBrush)
    p.drawLine(r.topLeft(), r.bottomRight())


def _counter(p: QPainter, r: QRectF) -> None:
    p.setPen(_line_pen(6))
    inset = r.height() * 0.15
    p.drawLine(QPointF(r.left(), r.top() + inset), QPointF(r.right(), r.top() + inset))


ICON_DRAWERS: dict[str, Callable[[QPainter, QRectF], None]] = {
    "bed": _bed,
    "dresser": _dresser,
    "nightstand": _dresser,
    "toilet": _toilet,
    "sink": _sink,
    "bathtub": _bathtub,
    "washer": _drum_appliance,
    "dryer": _drum_appliance,
    "fridge": _fridge,
    "stove": _stove,
    "table": _table,
    "sofa": _sofa,
    "door": _door,
    "window": _window,
    "pool": _pool,
    "garden_bed": _garden_bed,
    "tree": _tree,
    "shrub": _shrub,
    "patio": _patio,
    "deck": _patio,
    "porch": _patio,
    "walkway": _walkway,
    "shed": _shed,
    "fence": _fence,
    "grill": _grill,
    "mailbox": _mailbox,
    "driveway": _driveway,
    "hot_tub": _hot_tub,
    "firepit": _firepit,
    "playground": _playground,
    "garden_path": _garden_path,
    "compost_bin": _compost_bin,
    "rain_barrel": _rain_barrel,
    "stairs": _stairs,
    "closet": _closet,
    "counter": _counter,
}


def draw_icon(painter: QPainter, rect: QRectF, item_type: str) -> None:
    drawer = ICON_DRAWERS.get(item_type)
    if drawer is None:
        return
    painter.save()
    drawer(painter, rect)
    painter.restore()
