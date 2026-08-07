import { Text } from 'react-konva';

interface Props {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export function LockBadge({ width, height, x = 2, y = 2 }: Props) {
  const size = Math.max(9, Math.min(15, Math.min(Math.abs(width), Math.abs(height)) * 0.5));
  return <Text text="🔒" x={x} y={y} fontSize={size} listening={false} />;
}
