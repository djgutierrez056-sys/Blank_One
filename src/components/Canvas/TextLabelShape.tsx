import { useRef } from 'react';
import type Konva from 'konva';
import { Text } from 'react-konva';
import type { TextLabel } from '../../state/types';
import { usePlannerStore } from '../../state/store';
import { snapValue } from '../../utils/geometry';

interface Props {
  textLabel: TextLabel;
  isSelected: boolean;
  isEditing: boolean;
  gridSnapPx: number;
  onSelect: (id: string, additive: boolean) => void;
  onEditRequest: (id: string) => void;
  registerRef: (id: string, node: Konva.Node | null) => void;
  toolMode: string;
}

export function TextLabelShape({ textLabel, isSelected, isEditing, gridSnapPx, onSelect, onEditRequest, registerRef, toolMode }: Props) {
  const updateEntity = usePlannerStore((s) => s.updateEntity);
  const beginChange = usePlannerStore((s) => s.beginChange);
  const nodeRef = useRef<Konva.Text>(null);

  return (
    <Text
      ref={(node) => {
        nodeRef.current = node;
        registerRef(textLabel.id, node);
      }}
      x={textLabel.x}
      y={textLabel.y}
      width={textLabel.width}
      rotation={textLabel.rotation}
      text={textLabel.text}
      fontSize={textLabel.fontSize}
      fontFamily="system-ui"
      fill={textLabel.color}
      visible={!isEditing}
      draggable={toolMode === 'select' && !textLabel.locked}
      stroke={isSelected ? '#4f7cff' : undefined}
      strokeWidth={isSelected ? 0.6 : 0}
      onClick={(e) => onSelect(textLabel.id, e.evt.shiftKey)}
      onTap={() => onSelect(textLabel.id, false)}
      onDblClick={() => onEditRequest(textLabel.id)}
      onDblTap={() => onEditRequest(textLabel.id)}
      onDragStart={() => beginChange()}
      onDragEnd={(e) => {
        updateEntity(textLabel.id, {
          x: snapValue(e.target.x(), gridSnapPx),
          y: snapValue(e.target.y(), gridSnapPx),
        });
      }}
      onTransformStart={() => beginChange()}
      onTransformEnd={() => {
        const node = nodeRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        node.scaleX(1);
        node.scaleY(1);
        updateEntity(textLabel.id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(30, textLabel.width * scaleX),
          rotation: node.rotation(),
        });
      }}
    />
  );
}
