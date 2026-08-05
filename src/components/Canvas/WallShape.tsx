import { useRef } from 'react';
import type Konva from 'konva';
import { Group, Rect } from 'react-konva';
import type { Wall } from '../../state/types';
import { usePlannerStore } from '../../state/store';
import { snapAngle, snapValue } from '../../utils/geometry';

interface Props {
  wall: Wall;
  isSelected: boolean;
  gridSnapPx: number;
  onSelect: (id: string, additive: boolean) => void;
  registerRef: (id: string, node: Konva.Node | null) => void;
  toolMode: string;
}

export function WallShape({ wall, isSelected, gridSnapPx, onSelect, registerRef, toolMode }: Props) {
  const updateEntity = usePlannerStore((s) => s.updateEntity);
  const beginChange = usePlannerStore((s) => s.beginChange);
  const groupRef = useRef<Konva.Group>(null);

  return (
    <Group
      ref={(node) => {
        groupRef.current = node;
        registerRef(wall.id, node);
      }}
      x={wall.x}
      y={wall.y}
      rotation={wall.rotation}
      draggable={toolMode === 'select'}
      onClick={(e) => onSelect(wall.id, e.evt.shiftKey)}
      onTap={() => onSelect(wall.id, false)}
      onDragStart={() => beginChange()}
      onDragEnd={(e) => {
        updateEntity(wall.id, {
          x: snapValue(e.target.x(), gridSnapPx),
          y: snapValue(e.target.y(), gridSnapPx),
        });
      }}
      onTransformStart={() => beginChange()}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const newWidth = Math.max(gridSnapPx || 12, snapValue(wall.width * scaleX, gridSnapPx || 6));
        const newHeight = Math.max(4, wall.height * scaleY);
        node.scaleX(1);
        node.scaleY(1);
        updateEntity(wall.id, {
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
          rotation: snapAngle(node.rotation()),
        });
      }}
    >
      <Rect
        y={-wall.height / 2}
        width={wall.width}
        height={wall.height}
        fill={wall.color}
        stroke={isSelected ? '#4f7cff' : undefined}
        strokeWidth={isSelected ? 2 : 0}
        cornerRadius={1}
      />
    </Group>
  );
}
