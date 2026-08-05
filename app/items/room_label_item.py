"""Draggable, editable text label used to name a room or yard area.

Unlike furniture, a room label carries no width/height/rotation -- it is
just text you place and can double-click to rename in place.
"""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QFont
from PySide6.QtWidgets import QGraphicsItem, QGraphicsSceneMouseEvent, QGraphicsTextItem

from app.models import RoomLabel


class RoomLabelItem(QGraphicsTextItem):
    def __init__(self, model: RoomLabel):
        super().__init__(model.text)
        self.model = model
        self.setFlags(
            QGraphicsItem.GraphicsItemFlag.ItemIsMovable
            | QGraphicsItem.GraphicsItemFlag.ItemIsSelectable
            | QGraphicsItem.GraphicsItemFlag.ItemSendsGeometryChanges
        )
        self.setDefaultTextColor(QColor("#3a3a3a"))
        font = QFont()
        font.setBold(True)
        font.setPointSizeF(model.font_size)
        self.setFont(font)
        self.setTextInteractionFlags(Qt.TextInteractionFlag.NoTextInteraction)
        self.setZValue(20)
        self.setPos(model.x, model.y)
        self._before_move: dict | None = None
        self._before_text: str | None = None

    def sync_from_model(self) -> None:
        self.prepareGeometryChange()
        if self.toPlainText() != self.model.text:
            self.setPlainText(self.model.text)
        self.setPos(self.model.x, self.model.y)
        self.update()

    # -- editing text ---------------------------------------------------
    def mouseDoubleClickEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        self._before_text = self.model.text
        self.setTextInteractionFlags(Qt.TextInteractionFlag.TextEditorInteraction)
        self.setFocus(Qt.FocusReason.MouseFocusReason)
        super().mouseDoubleClickEvent(event)

    def focusOutEvent(self, event) -> None:
        self.setTextInteractionFlags(Qt.TextInteractionFlag.NoTextInteraction)
        cursor = self.textCursor()
        cursor.clearSelection()
        self.setTextCursor(cursor)

        new_text = self.toPlainText().strip() or "Room"
        if new_text != self.toPlainText():
            self.setPlainText(new_text)
        self.model.text = new_text

        if self._before_text is not None and new_text != self._before_text and self.scene() is not None:
            from app.commands import ModifyModelCommand

            self.scene().undo_stack.push(
                ModifyModelCommand(self, {"text": self._before_text}, {"text": new_text}, "Rename room label")
            )
        self._before_text = None
        super().focusOutEvent(event)

    # -- moving -----------------------------------------------------------
    def mousePressEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        self._before_move = {"x": self.model.x, "y": self.model.y}
        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event: QGraphicsSceneMouseEvent) -> None:
        super().mouseReleaseEvent(event)
        if self._before_move is not None:
            after = {"x": self.model.x, "y": self.model.y}
            if after != self._before_move and self.scene() is not None:
                from app.commands import ModifyModelCommand

                self.scene().undo_stack.push(ModifyModelCommand(self, self._before_move, after, "Move room label"))
            self._before_move = None

    def itemChange(self, change, value):
        if change == QGraphicsItem.GraphicsItemChange.ItemPositionHasChanged:
            self.model.x = self.pos().x()
            self.model.y = self.pos().y()
        return super().itemChange(change, value)
