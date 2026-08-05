"""Main application window: menu/toolbar, item palette, and the design canvas."""
from __future__ import annotations

import json
from pathlib import Path

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction, QPainter, QWheelEvent
from PySide6.QtWidgets import (
    QDockWidget,
    QFileDialog,
    QGraphicsView,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QToolBar,
    QVBoxLayout,
    QWidget,
)

from app.io import load_project, save_project
from app.models import Project
from app.scene import DesignScene

CATALOG_PATH = Path(__file__).parent / "catalog.json"


class DesignView(QGraphicsView):
    def __init__(self, scene: DesignScene):
        super().__init__(scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.RubberBandDrag)
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorViewCenter)
        self.scale(0.15, 0.15)  # start zoomed out since scene units are mm

    def wheelEvent(self, event: QWheelEvent) -> None:
        factor = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
        self.scale(factor, factor)


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Yard & Home Layout Designer")
        self.resize(1200, 800)

        self.current_path: Path | None = None
        self.scene = DesignScene(Project())
        self.view = DesignView(self.scene)
        self.setCentralWidget(self.view)

        self._build_toolbar()
        self._build_item_palette()
        self._build_menu()

    # -- UI construction ----------------------------------------------------
    def _build_toolbar(self) -> None:
        toolbar = QToolBar("Tools", self)
        self.addToolBar(toolbar)

        select_action = QAction("Select", self)
        select_action.setCheckable(True)
        select_action.setChecked(True)
        select_action.triggered.connect(lambda: self._set_mode("select"))

        wall_action = QAction("Draw Wall", self)
        wall_action.setCheckable(True)
        wall_action.triggered.connect(lambda: self._set_mode("draw_wall"))

        self._mode_actions = {"select": select_action, "draw_wall": wall_action}
        toolbar.addAction(select_action)
        toolbar.addAction(wall_action)

        toolbar.addSeparator()
        delete_action = QAction("Delete Selected", self)
        delete_action.setShortcut("Delete")
        delete_action.triggered.connect(self.scene.remove_selected)
        toolbar.addAction(delete_action)

    def _build_item_palette(self) -> None:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        self.palette_list = QListWidget()
        for entry in catalog:
            text = f"{entry['label']}  ({entry['category']})"
            list_item = QListWidgetItem(text)
            list_item.setData(Qt.ItemDataRole.UserRole, entry)
            self.palette_list.addItem(list_item)
        self.palette_list.itemDoubleClicked.connect(self._on_palette_item_chosen)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.addWidget(self.palette_list)

        dock = QDockWidget("Item Library (double-click to place)", self)
        dock.setWidget(container)
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, dock)

    def _build_menu(self) -> None:
        file_menu = self.menuBar().addMenu("&File")

        new_action = QAction("New", self)
        new_action.triggered.connect(self._new_project)
        file_menu.addAction(new_action)

        open_action = QAction("Open...", self)
        open_action.setShortcut("Ctrl+O")
        open_action.triggered.connect(self._open_project)
        file_menu.addAction(open_action)

        save_action = QAction("Save", self)
        save_action.setShortcut("Ctrl+S")
        save_action.triggered.connect(self._save_project)
        file_menu.addAction(save_action)

        save_as_action = QAction("Save As...", self)
        save_as_action.triggered.connect(self._save_project_as)
        file_menu.addAction(save_as_action)

    # -- actions --------------------------------------------------------------
    def _set_mode(self, mode: str) -> None:
        self.scene.set_mode(mode)
        for name, action in self._mode_actions.items():
            action.setChecked(name == mode)
        self.view.setDragMode(
            QGraphicsView.DragMode.NoDrag if mode == "draw_wall" else QGraphicsView.DragMode.RubberBandDrag
        )

    def _on_palette_item_chosen(self, list_item: QListWidgetItem) -> None:
        entry = list_item.data(Qt.ItemDataRole.UserRole)
        center = self.view.mapToScene(self.view.viewport().rect().center())
        self.scene.add_furniture(
            item_type=entry["type"],
            label=entry["label"],
            width=entry["width"],
            height=entry["height"],
            color=entry["color"],
            pos=center,
        )
        self._set_mode("select")

    def _new_project(self) -> None:
        self.current_path = None
        self.scene.rebuild_from_project(Project())

    def _open_project(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Open Layout", "", "Layout Files (*.json)")
        if not path:
            return
        try:
            project = load_project(path)
        except Exception as exc:  # noqa: BLE001 - surface any load error to the user
            QMessageBox.critical(self, "Open failed", str(exc))
            return
        self.current_path = Path(path)
        self.scene.rebuild_from_project(project)

    def _save_project(self) -> None:
        if self.current_path is None:
            self._save_project_as()
            return
        save_project(self.scene.project, self.current_path)

    def _save_project_as(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Save Layout As", "layout.json", "Layout Files (*.json)")
        if not path:
            return
        self.current_path = Path(path)
        save_project(self.scene.project, self.current_path)
