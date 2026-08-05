"""Main application window: menu/toolbar, item palette, property panel, canvas."""
from __future__ import annotations

import json
from pathlib import Path

from PySide6.QtCore import QRectF, Qt
from PySide6.QtGui import QAction, QActionGroup, QColor, QMouseEvent, QPainter, QPixmap, QWheelEvent
from PySide6.QtPrintSupport import QPrinter
from PySide6.QtWidgets import (
    QColorDialog,
    QComboBox,
    QDockWidget,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QGraphicsView,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QToolBar,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from app.io import load_project, save_project
from app.items.furniture_item import FurnitureItem
from app.items.wall_item import WallItem
from app.models import Project
from app.scene import DesignScene
from app.units import DisplayUnits

CATALOG_PATH = Path(__file__).parent / "catalog.json"


class DesignView(QGraphicsView):
    def __init__(self, scene: DesignScene):
        super().__init__(scene)
        self.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.setDragMode(QGraphicsView.DragMode.RubberBandDrag)
        self.setTransformationAnchor(QGraphicsView.ViewportAnchor.AnchorUnderMouse)
        self.setResizeAnchor(QGraphicsView.ViewportAnchor.AnchorViewCenter)
        self.scale(0.15, 0.15)  # start zoomed out since scene units are mm
        self._panning = False
        self._pre_pan_drag_mode = QGraphicsView.DragMode.RubberBandDrag

    def wheelEvent(self, event: QWheelEvent) -> None:
        factor = 1.15 if event.angleDelta().y() > 0 else 1 / 1.15
        self.scale(factor, factor)

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.MiddleButton:
            self._panning = True
            self._pre_pan_drag_mode = self.dragMode()
            self.setDragMode(QGraphicsView.DragMode.ScrollHandDrag)
            fake = QMouseEvent(
                event.type(), event.position(), event.globalPosition(),
                Qt.MouseButton.LeftButton, Qt.MouseButton.LeftButton, event.modifiers(),
            )
            super().mousePressEvent(fake)
            return
        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if self._panning and event.button() == Qt.MouseButton.MiddleButton:
            fake = QMouseEvent(
                event.type(), event.position(), event.globalPosition(),
                Qt.MouseButton.LeftButton, Qt.MouseButton.LeftButton, event.modifiers(),
            )
            super().mouseReleaseEvent(fake)
            self.setDragMode(self._pre_pan_drag_mode)
            self._panning = False
            return
        super().mouseReleaseEvent(event)


class PropertyPanel(QWidget):
    """Shows/edits the selected item's label, size, rotation, and color."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._current: FurnitureItem | WallItem | None = None
        self._updating = False

        layout = QVBoxLayout(self)
        self.empty_label = QLabel("Select an item to edit its properties.")
        self.empty_label.setWordWrap(True)
        layout.addWidget(self.empty_label)

        self.group = QGroupBox("Selected Item")
        form = QFormLayout(self.group)

        self.label_edit = QLineEdit()
        self.label_edit.editingFinished.connect(self._apply_label)
        form.addRow("Label", self.label_edit)

        self.width_spin = QDoubleSpinBox()
        self.width_spin.setRange(50, 20000)
        self.width_spin.setSuffix(" mm")
        self.width_spin.valueChanged.connect(self._apply_size)
        form.addRow("Width", self.width_spin)

        self.height_spin = QDoubleSpinBox()
        self.height_spin.setRange(50, 20000)
        self.height_spin.setSuffix(" mm")
        self.height_spin.valueChanged.connect(self._apply_size)
        form.addRow("Height", self.height_spin)

        self.rotation_spin = QDoubleSpinBox()
        self.rotation_spin.setRange(0, 359.9)
        self.rotation_spin.setSuffix(" deg")
        self.rotation_spin.valueChanged.connect(self._apply_rotation)
        form.addRow("Rotation", self.rotation_spin)

        rotate_row = QWidget()
        rotate_layout = QHBoxLayout(rotate_row)
        rotate_layout.setContentsMargins(0, 0, 0, 0)
        rotate_left = QPushButton("Rotate -90°")
        rotate_left.clicked.connect(lambda: self._rotate_step(-90))
        rotate_right = QPushButton("Rotate +90°")
        rotate_right.clicked.connect(lambda: self._rotate_step(90))
        rotate_layout.addWidget(rotate_left)
        rotate_layout.addWidget(rotate_right)
        form.addRow(rotate_row)

        self.color_button = QPushButton("Choose Color")
        self.color_button.clicked.connect(self._choose_color)
        form.addRow("Color", self.color_button)

        layout.addWidget(self.group)
        layout.addStretch(1)
        self.group.setVisible(False)

    def set_selection(self, gfx) -> None:
        self._current = gfx
        is_furniture = isinstance(gfx, FurnitureItem)
        self.group.setVisible(gfx is not None)
        self.empty_label.setVisible(gfx is None)
        self.rotation_spin.setEnabled(is_furniture)
        self.color_button.setEnabled(is_furniture)
        self.label_edit.setEnabled(is_furniture)
        if gfx is None:
            return
        self._updating = True
        if is_furniture:
            self.label_edit.setText(gfx.model.label)
            self.width_spin.setValue(gfx.model.width)
            self.height_spin.setValue(gfx.model.height)
            self.rotation_spin.setValue(gfx.model.rotation % 360)
        elif isinstance(gfx, WallItem):
            import math

            self.label_edit.setText("Wall")
            length = math.hypot(gfx.model.x2 - gfx.model.x1, gfx.model.y2 - gfx.model.y1)
            self.width_spin.setValue(length)
            self.height_spin.setValue(gfx.model.thickness)
            self.rotation_spin.setValue(0)
        self._updating = False

    def refresh_values(self) -> None:
        if self._current is None or self._updating:
            return
        self.set_selection(self._current)

    def _apply_label(self) -> None:
        if self._updating or not isinstance(self._current, FurnitureItem):
            return
        self._current.model.label = self.label_edit.text()
        self._current.update()

    def _apply_size(self) -> None:
        if self._updating or self._current is None:
            return
        gfx = self._current
        if isinstance(gfx, FurnitureItem):
            gfx.prepareGeometryChange()
            gfx.model.width = self.width_spin.value()
            gfx.model.height = self.height_spin.value()
            gfx.update()
        elif isinstance(gfx, WallItem):
            import math

            angle = math.atan2(gfx.model.y2 - gfx.model.y1, gfx.model.x2 - gfx.model.x1)
            gfx.prepareGeometryChange()
            new_length = self.width_spin.value()
            gfx.model.x2 = gfx.model.x1 + new_length * math.cos(angle)
            gfx.model.y2 = gfx.model.y1 + new_length * math.sin(angle)
            gfx.model.thickness = self.height_spin.value()
            gfx.update()

    def _apply_rotation(self) -> None:
        if self._updating or not isinstance(self._current, FurnitureItem):
            return
        self._current.setRotation(self.rotation_spin.value())
        self._current.model.rotation = self.rotation_spin.value()
        self._current.update()

    def _rotate_step(self, degrees: float) -> None:
        if isinstance(self._current, FurnitureItem):
            self._current.rotate_by(degrees)
            self.refresh_values()

    def _choose_color(self) -> None:
        if not isinstance(self._current, FurnitureItem):
            return
        color = QColorDialog.getColor(QColor(self._current.model.color), self, "Choose Color")
        if color.isValid():
            self._current.model.color = color.name()
            self._current.update()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Yard & Home Layout Designer")
        self.resize(1300, 850)

        self.current_path: Path | None = None
        self.scene = DesignScene(Project())
        self.view = DesignView(self.scene)
        self.setCentralWidget(self.view)
        self.scene.selectionChanged.connect(self._on_selection_changed)
        self.scene.changed.connect(lambda _regions: self.property_panel.refresh_values())

        self._build_toolbar()
        self._build_item_palette()
        self._build_property_panel()
        self._build_menu()

    # -- UI construction ----------------------------------------------------
    def _build_toolbar(self) -> None:
        toolbar = QToolBar("Tools", self)
        self.addToolBar(toolbar)

        mode_group = QActionGroup(self)
        select_action = QAction("Select", self)
        select_action.setCheckable(True)
        select_action.setChecked(True)
        select_action.triggered.connect(lambda: self._set_mode("select"))

        wall_action = QAction("Draw Wall", self)
        wall_action.setCheckable(True)
        wall_action.triggered.connect(lambda: self._set_mode("draw_wall"))

        for action in (select_action, wall_action):
            mode_group.addAction(action)
            toolbar.addAction(action)
        self._mode_actions = {"select": select_action, "draw_wall": wall_action}

        toolbar.addSeparator()
        delete_action = QAction("Delete Selected", self)
        delete_action.setShortcut("Delete")
        delete_action.triggered.connect(self.scene.remove_selected)
        toolbar.addAction(delete_action)

        toolbar.addSeparator()
        self.undo_action = self.scene.undo_stack.createUndoAction(self, "Undo")
        self.undo_action.setShortcut("Ctrl+Z")
        self.redo_action = self.scene.undo_stack.createRedoAction(self, "Redo")
        self.redo_action.setShortcut("Ctrl+Shift+Z")
        toolbar.addAction(self.undo_action)
        toolbar.addAction(self.redo_action)

        toolbar.addSeparator()
        toolbar.addWidget(QLabel(" Units: "))
        unit_combo = QComboBox()
        unit_combo.addItems(["Metric", "Feet/Inches"])
        unit_combo.currentIndexChanged.connect(self._on_unit_changed)
        toolbar.addWidget(unit_combo)

    def _build_item_palette(self) -> None:
        catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
        categories: dict[str, list[dict]] = {}
        for entry in catalog:
            categories.setdefault(entry["category"], []).append(entry)

        self.palette_tree = QTreeWidget()
        self.palette_tree.setHeaderHidden(True)
        for category, entries in categories.items():
            cat_item = QTreeWidgetItem([category])
            cat_item.setFlags(cat_item.flags() & ~Qt.ItemFlag.ItemIsSelectable)
            for entry in entries:
                child = QTreeWidgetItem([entry["label"]])
                child.setData(0, Qt.ItemDataRole.UserRole, entry)
                cat_item.addChild(child)
            self.palette_tree.addTopLevelItem(cat_item)
        self.palette_tree.expandAll()
        self.palette_tree.itemDoubleClicked.connect(self._on_palette_item_chosen)

        container = QWidget()
        layout = QVBoxLayout(container)
        layout.addWidget(QLabel("Double-click to place at view center:"))
        layout.addWidget(self.palette_tree)

        dock = QDockWidget("Item Library", self)
        dock.setWidget(container)
        self.addDockWidget(Qt.DockWidgetArea.LeftDockWidgetArea, dock)

    def _build_property_panel(self) -> None:
        self.property_panel = PropertyPanel()
        dock = QDockWidget("Properties", self)
        dock.setWidget(self.property_panel)
        self.addDockWidget(Qt.DockWidgetArea.RightDockWidgetArea, dock)

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

        file_menu.addSeparator()
        export_png_action = QAction("Export PNG...", self)
        export_png_action.triggered.connect(self._export_png)
        file_menu.addAction(export_png_action)

        export_pdf_action = QAction("Export PDF...", self)
        export_pdf_action.triggered.connect(self._export_pdf)
        file_menu.addAction(export_pdf_action)

        edit_menu = self.menuBar().addMenu("&Edit")
        edit_menu.addAction(self.undo_action)
        edit_menu.addAction(self.redo_action)

    # -- actions --------------------------------------------------------------
    def _set_mode(self, mode: str) -> None:
        self.scene.set_mode(mode)
        for name, action in self._mode_actions.items():
            action.setChecked(name == mode)
        self.view.setDragMode(
            QGraphicsView.DragMode.NoDrag if mode == "draw_wall" else QGraphicsView.DragMode.RubberBandDrag
        )

    def _on_selection_changed(self) -> None:
        selected = self.scene.selectedItems()
        self.property_panel.set_selection(selected[0] if len(selected) == 1 else None)

    def _on_unit_changed(self, index: int) -> None:
        DisplayUnits.current = "metric" if index == 0 else "imperial"
        self.scene.update()

    def _on_palette_item_chosen(self, tree_item: QTreeWidgetItem, _column: int) -> None:
        entry = tree_item.data(0, Qt.ItemDataRole.UserRole)
        if entry is None:
            return  # a category header, not a placeable item
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

    def _export_bounds(self):
        bounds = self.scene.itemsBoundingRect()
        if bounds.isEmpty():
            bounds = self.view.sceneRect()
        margin = 300
        bounds.adjust(-margin, -margin, margin, margin)
        return bounds

    def _export_png(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Export PNG", "layout.png", "PNG Files (*.png)")
        if not path:
            return
        bounds = self._export_bounds()
        scale = 0.3  # px per mm
        image = QPixmap(max(1, int(bounds.width() * scale)), max(1, int(bounds.height() * scale)))
        image.fill(Qt.GlobalColor.white)
        painter = QPainter(image)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.scene.render(painter, image.rect().toRectF(), bounds)
        painter.end()
        image.save(path)

    def _export_pdf(self) -> None:
        path, _ = QFileDialog.getSaveFileName(self, "Export PDF", "layout.pdf", "PDF Files (*.pdf)")
        if not path:
            return
        printer = QPrinter(QPrinter.PrinterMode.HighResolution)
        printer.setOutputFormat(QPrinter.OutputFormat.PdfFormat)
        printer.setOutputFileName(path)
        painter = QPainter(printer)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        self.scene.render(painter, QRectF(printer.pageRect(QPrinter.Unit.DevicePixel)), self._export_bounds())
        painter.end()
