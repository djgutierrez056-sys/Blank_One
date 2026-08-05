"""Detect enclosed room polygons from a floor's wall network.

Walls form a planar straight-line graph (nodes = endpoints, edges = walls).
Its bounded faces are the rooms. We find every face -- bounded and the one
unbounded outer face -- via the standard "next edge in rotational order"
half-edge traversal used for planar subdivisions: at each vertex, edges are
sorted by angle, and the face boundary always turns onto the next edge
clockwise from the one it arrived on. Each directed edge belongs to exactly
one face this way, so tracing every unvisited directed edge recovers all
faces. The single largest-area face is the unbounded outer boundary and is
dropped; what's left (above a minimum size, to drop degenerate dangling-wall
faces) are the rooms.

Curved walls are approximated by their straight chord for graph topology --
good enough for topology/area purposes, not for exact curved-room area.
"""
from __future__ import annotations

import math

from PySide6.QtCore import QPointF
from PySide6.QtGui import QPolygonF

from app.geometry import closest_point_on_segment
from app.models import Wall

MIN_ROOM_AREA_SQ_MM = 200_000.0  # ~0.2 m^2, filters degenerate/dangling-wall faces
TOUCH_TOLERANCE = 5.0  # mm, how close a point must be to a wall to count as touching it


def _node_key(x: float, y: float) -> tuple[int, int]:
    return (round(x), round(y))


def _signed_area(points: list[tuple[float, float]]) -> float:
    area = 0.0
    n = len(points)
    for i in range(n):
        x1, y1 = points[i]
        x2, y2 = points[(i + 1) % n]
        area += x1 * y2 - x2 * y1
    return area / 2.0


def _split_walls_at_t_junctions(walls: list[Wall]) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """A wall whose endpoint touches the *interior* of another wall (a T
    junction) doesn't automatically split that wall in the data model -- they
    stay two independent segments. Split them here (graph-only, the Wall
    models are untouched) so the face-tracing graph has a real vertex there."""
    all_endpoints = []
    for w in walls:
        all_endpoints.append((w.x1, w.y1))
        all_endpoints.append((w.x2, w.y2))

    edges: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for w in walls:
        x1, y1, x2, y2 = w.x1, w.y1, w.x2, w.y2
        length = math.hypot(x2 - x1, y2 - y1)
        if length == 0:
            continue
        interior_points = []
        for (px, py) in all_endpoints:
            if _node_key(px, py) in (_node_key(x1, y1), _node_key(x2, y2)):
                continue
            _closest, dist = closest_point_on_segment(QPointF(px, py), QPointF(x1, y1), QPointF(x2, y2))
            if dist <= TOUCH_TOLERANCE:
                t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / (length * length)
                if 0.02 < t < 0.98:
                    interior_points.append((t, (px, py)))

        seen_keys = set()
        ordered_points = []
        for _t, pt in sorted(interior_points):
            key = _node_key(*pt)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            ordered_points.append(pt)

        chain = [(x1, y1)] + ordered_points + [(x2, y2)]
        for i in range(len(chain) - 1):
            edges.append((chain[i], chain[i + 1]))
    return edges


def find_room_polygons(walls: list[Wall]) -> list[tuple[QPolygonF, float]]:
    coords: dict[tuple[int, int], tuple[float, float]] = {}
    adjacency: dict[tuple[int, int], set[tuple[int, int]]] = {}

    for (x1, y1), (x2, y2) in _split_walls_at_t_junctions(walls):
        a = _node_key(x1, y1)
        b = _node_key(x2, y2)
        if a == b:
            continue
        coords[a] = (x1, y1)
        coords[b] = (x2, y2)
        adjacency.setdefault(a, set()).add(b)
        adjacency.setdefault(b, set()).add(a)

    if not adjacency:
        return []

    # Neighbors of each node sorted by angle, for rotational face-tracing.
    sorted_neighbors: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for node, neighbors in adjacency.items():
        nx, ny = coords[node]
        ordered = sorted(
            neighbors,
            key=lambda nb: math.atan2(coords[nb][1] - ny, coords[nb][0] - nx),
        )
        sorted_neighbors[node] = ordered

    def next_directed_edge(u: tuple[int, int], v: tuple[int, int]) -> tuple[int, int] | None:
        """Given we just walked u->v, return the next node w such that v->w
        continues the current face boundary (the edge clockwise-next from
        the one we arrived on, i.e. the reverse edge v->u)."""
        entries = sorted_neighbors[v]
        try:
            idx = entries.index(u)
        except ValueError:
            return None
        return entries[(idx - 1) % len(entries)]

    visited: set[tuple[tuple[int, int], tuple[int, int]]] = set()
    faces: list[list[tuple[int, int]]] = []

    for a, neighbors in adjacency.items():
        for b in neighbors:
            if (a, b) in visited:
                continue
            face_nodes = [a]
            u, v = a, b
            safety = 0
            while (u, v) not in visited and safety < 10000:
                visited.add((u, v))
                face_nodes.append(v)
                w = next_directed_edge(u, v)
                if w is None:
                    break
                u, v = v, w
                safety += 1
                if (u, v) == (a, b):
                    break
            faces.append(face_nodes)

    scored = []
    for nodes in faces:
        pts = [coords[n] for n in nodes]
        if len(pts) < 4:  # need at least 3 distinct points + closing repeat
            continue
        area = abs(_signed_area(pts))
        scored.append((pts, area))

    if len(scored) <= 1:
        return []

    # The outer unbounded face traces around the whole exterior and is (for
    # a single connected building outline) the largest by area -- drop it.
    scored.sort(key=lambda f: f[1], reverse=True)
    interior = scored[1:]

    results = []
    for pts, area in interior:
        if area < MIN_ROOM_AREA_SQ_MM:
            continue
        polygon = QPolygonF([QPointF(x, y) for x, y in pts])
        results.append((polygon, area))
    return results
