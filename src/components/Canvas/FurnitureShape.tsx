import { useRef } from 'react';
import type Konva from 'konva';
import { Group, Rect, Text } from 'react-konva';
import type { FurnitureItem } from '../../state/types';
import { getActivePage, usePlannerStore } from '../../state/store';
import { snapAngle, snapValue } from '../../utils/geometry';
import { findWallSnap, rectCenter, topLeftFromCenter } from '../../utils/wallSnap';
import { FurnitureIcon } from './FurnitureIcon';

const WALL_STICKY_TYPES = new Set(['door', 'window']);

interface Props {
  item: FurnitureItem;
  isSelected: boolean;
  gridSnapPx: number;
  onSelect: (id: string, additive: boolean) => void;
  registerRef: (id: string, node: Konva.Node | null) => void;
  toolMode: string;
}

export function FurnitureShape({ item, isSelected, gridSnapPx, onSelect, registerRef, toolMode }: Props) {
  const updateEntity = usePlannerStore((s) => s.updateEntity);
  const beginChange = usePlannerStore((s) => s.beginChange);
  const activePage = usePlannerStore((s) => getActivePage(s.project));
  const groupRef = useRef<Konva.Group>(null);
  const sticksToWalls = WALL_STICKY_TYPES.has(item.catalogId);

  return (
    <Group
      ref={(node) => {
        groupRef.current = node;
        registerRef(item.id, node);
      }}
      x={item.x}
      y={item.y}
      rotation={item.rotation}
      draggable={toolMode === 'select' && !item.locked}
      onClick={(e) => onSelect(item.id, e.evt.shiftKey)}
      onTap={() => onSelect(item.id, false)}
      onDblClick={(e) => {
        if (item.catalogId === 'door' && !item.locked) {
          if (e.evt.shiftKey) updateEntity(item.id, { flippedX: !item.flippedX }, { commit: true });
          else updateEntity(item.id, { flipped: !item.flipped }, { commit: true });
        }
      }}
      onDragStart={() => beginChange()}
      onDragEnd={(e) => {
        const rawX = e.target.x();
        const rawY = e.target.y();

        if (sticksToWalls) {
          const center = rectCenter(rawX, rawY, item.width, item.height, item.rotation);
          const snap = findWallSnap(activePage, center.x, center.y);
          if (snap) {
            const topLeft = topLeftFromCenter(snap.x, snap.y, item.width, item.height, snap.angle);
            updateEntity(item.id, { x: topLeft.x, y: topLeft.y, rotation: snap.angle });
            return;
          }
        }

        updateEntity(item.id, {
          x: snapValue(rawX, gridSnapPx),
          y: snapValue(rawY, gridSnapPx),
        });
      }}
      onTransformStart={() => beginChange()}
      onTransformEnd={() => {
        const node = groupRef.current;
        if (!node) return;
        const scaleX = node.scaleX();
        const scaleY = node.scaleY();
        const newWidth = Math.max(6, snapValue(item.width * scaleX, gridSnapPx / 2));
        const newHeight = Math.max(6, snapValue(item.height * scaleY, gridSnapPx / 2));
        node.scaleX(1);
        node.scaleY(1);
        updateEntity(item.id, {
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
          rotation: snapAngle(node.rotation()),
        });
      }}
    >
      <FurnitureIcon
        catalogId={item.catalogId}
        width={item.width}
        height={item.height}
        color={item.color}
        flipped={item.flipped}
        flippedX={item.flippedX}
      />
      {isSelected && (
        <Rect
          width={item.width}
          height={item.height}
          stroke="#4f7cff"
          strokeWidth={1.5}
          dash={[4, 3]}
          listening={false}
        />
      )}
      {item.width > 40 && item.height > 18 && (
        <Text
          text={item.label}
          fontSize={10}
          fontFamily="system-ui"
          fill="#2a2f38"
          width={item.width}
          align="center"
          y={item.height / 2 - 6}
          listening={false}
        />
      )}
    </Group>
  );
}
