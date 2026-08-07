import { useRef } from 'react';
import type Konva from 'konva';
import { Group, Rect } from 'react-konva';
import type { Wall } from '../../state/types';
import { getActivePage, usePlannerStore } from '../../state/store';
import { snapAngle, snapValue } from '../../utils/geometry';
import { findPointSnap } from '../../utils/wallSnap';

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
  const activePage = usePlannerStore((s) => getActivePage(s.project));
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
        const rawX = e.target.x();
        const rawY = e.target.y();
        const rad = (wall.rotation * Math.PI) / 180;
        const rawEndX = rawX + wall.width * Math.cos(rad);
        const rawEndY = rawY + wall.width * Math.sin(rad);

        const startSnap = findPointSnap(activePage, rawX, rawY, 16, wall.id);
        const endSnap = findPointSnap(activePage, rawEndX, rawEndY, 16, wall.id);

        let newX = snapValue(rawX, gridSnapPx);
        let newY = snapValue(rawY, gridSnapPx);

        if (startSnap && (!endSnap || Math.hypot(startSnap.x - rawX, startSnap.y - rawY) <= Math.hypot(endSnap.x - rawEndX, endSnap.y - rawEndY))) {
          newX = startSnap.x;
          newY = startSnap.y;
        } else if (endSnap) {
          newX = rawX + (endSnap.x - rawEndX);
          newY = rawY + (endSnap.y - rawEndY);
        }

        updateEntity(wall.id, { x: newX, y: newY });
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
