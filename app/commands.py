"""QUndoCommand subclasses for undo/redo support.

Kept intentionally generic: most edits (move/resize/rotate) are captured as a
before/after snapshot of the model's plain fields rather than one command
class per gesture.
"""
from __future__ import annotations

from PySide6.QtGui import QUndoCommand


class ModifyModelCommand(QUndoCommand):
    """Undo/redo a move/resize/rotate on a single wall or furniture item."""

    def __init__(self, graphics_item, before: dict, after: dict, text: str = "Modify"):
        super().__init__(text)
        self.graphics_item = graphics_item
        self.before = before
        self.after = after

    def _apply(self, state: dict) -> None:
        model = self.graphics_item.model
        for key, value in state.items():
            setattr(model, key, value)
        self.graphics_item.sync_from_model()

    def redo(self) -> None:
        self._apply(self.after)

    def undo(self) -> None:
        self._apply(self.before)


class AddItemCommand(QUndoCommand):
    """Add a WallItem or FurnitureItem (and its model) to the scene/project."""

    def __init__(self, scene, model, graphics_item, collection: list, text: str = "Add"):
        super().__init__(text)
        self.scene = scene
        self.model = model
        self.graphics_item = graphics_item
        self.collection = collection

    def redo(self) -> None:
        if self.model not in self.collection:
            self.collection.append(self.model)
        if self.graphics_item.scene() is None:
            self.scene.addItem(self.graphics_item)

    def undo(self) -> None:
        if self.model in self.collection:
            self.collection.remove(self.model)
        if self.graphics_item.scene() is not None:
            self.scene.removeItem(self.graphics_item)


class DeleteItemsCommand(QUndoCommand):
    """Delete one or more WallItem/FurnitureItem graphics items + their models."""

    def __init__(self, scene, entries: list[tuple[object, object, list]], text: str = "Delete"):
        # entries: list of (model, graphics_item, collection)
        super().__init__(text)
        self.scene = scene
        self.entries = entries

    def redo(self) -> None:
        for model, gfx, collection in self.entries:
            if model in collection:
                collection.remove(model)
            if gfx.scene() is not None:
                self.scene.removeItem(gfx)

    def undo(self) -> None:
        for model, gfx, collection in self.entries:
            if model not in collection:
                collection.append(model)
            if gfx.scene() is None:
                self.scene.addItem(gfx)
