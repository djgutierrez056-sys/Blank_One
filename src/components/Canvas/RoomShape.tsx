import { useRef } from 'react';
import type Konva from 'konva';
import { Group, Label as KLabel, Rect, Tag, Text } from 'react-konva';
import type { Room } from '../../state/types';
import { usePlannerStore } from '../../state/store';
import { areaLabel, feetLabel, snapValue } from '../../utils/geometry';

interface Props {
  room: Room;
  isSelected: boolean;
  scale: number;
  gridSnapPx: number;
  showLabels: boolean;
  onSelect: (id: string, additive: boolean) => void;
  registerRef: (id: string, node: Konva.Node | null) => void;
  toolMode: string;
}

export function RoomShape({ room, isSelected, scale, gridSnapPx, showLabels, onSelect, registerRef, toolMode }: Props) {
  const updateEntity = usePlannerStore((s) => s.updateEntity);
  const beginChange = usePlannerStore((s) => s.beginChange);
  const groupRef = useRef<Konva.Group>(null);
  const t = room.wallThickness;

  const widthFt = room.width / scale;
  const heightFt = room.height / scale;

  return (
    <Group
      ref={(node) => {
        groupRef.current = node;
        registerRef(room.id, node);
      }}
      x={room.x}
      y={room.y}
      rotation={room.rotation}
      draggable={toolMode === 'select'}
      onClick={(e) => onSelect(room.id, e.evt.shiftKey)}
      onTap={() => onSelect(room.id, false)}
      onDragStart={() => beginChange()}
      onDragEnd={(e) => {
        updateEntity(room.id, {
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
        const newWidth = Math.max(gridSnapPx * 2, snapValue(room.width * scaleX, gridSnapPx));
        const newHeight = Math.max(gridSnapPx * 2, snapValue(room.height * scaleY, gridSnapPx));
        node.scaleX(1);
        node.scaleY(1);
        updateEntity(room.id, {
          x: node.x(),
          y: node.y(),
          width: newWidth,
          height: newHeight,
          rotation: node.rotation(),
        });
      }}
    >
      <Rect width={room.width} height={room.height} fill={room.fill} stroke="#ffffff" strokeWidth={0} />
      <Rect
        width={room.width}
        height={room.height}
        stroke={isSelected ? '#4f7cff' : '#8a8f9c'}
        strokeWidth={t}
        fillEnabled={false}
        listening={false}
      />
      {showLabels && (
        <KLabel x={room.width / 2} y={room.height / 2} listening={false}>
          <Tag fill="rgba(255,255,255,0.75)" cornerRadius={4} />
          <Text
            text={`${room.label}\n${feetLabel(widthFt)} x ${feetLabel(heightFt)}\n${areaLabel(widthFt, heightFt)}`}
            fontSize={13}
            fontFamily="system-ui"
            fill="#3a3f4b"
            align="center"
            padding={6}
            offsetX={40}
          />
        </KLabel>
      )}
    </Group>
  );
}
