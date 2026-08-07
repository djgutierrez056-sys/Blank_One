import { Arc, Circle, Ellipse, Group, Line, Rect } from 'react-konva';

function darken(hex: string, amount = 0.25): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

interface Props {
  catalogId: string;
  width: number;
  height: number;
  color: string;
  flipped?: boolean;
}

export function FurnitureIcon({ catalogId, width, height, color, flipped }: Props) {
  const stroke = darken(color, 0.35);
  const base = (
    <Rect width={width} height={height} fill={color} stroke={stroke} strokeWidth={1.5} cornerRadius={3} />
  );

  switch (catalogId) {
    case 'sofa':
    case 'loveseat':
      return (
        <Group>
          {base}
          <Rect x={0} y={0} width={width} height={height * 0.28} fill={darken(color, 0.15)} cornerRadius={3} />
          <Rect x={0} y={0} width={width * 0.14} height={height} fill={darken(color, 0.15)} cornerRadius={3} />
          <Rect x={width * 0.86} y={0} width={width * 0.14} height={height} fill={darken(color, 0.15)} cornerRadius={3} />
        </Group>
      );
    case 'armchair':
      return (
        <Group>
          {base}
          <Rect x={0} y={0} width={width} height={height * 0.3} fill={darken(color, 0.15)} cornerRadius={3} />
          <Rect x={0} y={0} width={width * 0.2} height={height} fill={darken(color, 0.15)} cornerRadius={3} />
          <Rect x={width * 0.8} y={0} width={width * 0.2} height={height} fill={darken(color, 0.15)} cornerRadius={3} />
        </Group>
      );
    case 'office-chair':
    case 'dining-chair':
      return (
        <Group>
          <Circle x={width / 2} y={height / 2} radius={Math.min(width, height) / 2} fill={color} stroke={stroke} strokeWidth={1.5} />
          <Rect x={width * 0.15} y={0} width={width * 0.7} height={height * 0.22} fill={darken(color, 0.2)} cornerRadius={2} />
        </Group>
      );
    case 'bed-queen':
    case 'bed-twin':
      return (
        <Group>
          {base}
          <Rect x={0} y={0} width={width} height={height * 0.16} fill={darken(color, 0.2)} cornerRadius={3} />
          <Rect x={width * 0.08} y={height * 0.24} width={width * 0.36} height={height * 0.2} fill="#ffffff" opacity={0.6} cornerRadius={4} />
          <Rect x={width * 0.56} y={height * 0.24} width={width * 0.36} height={height * 0.2} fill="#ffffff" opacity={0.6} cornerRadius={4} />
        </Group>
      );
    case 'nightstand':
    case 'dresser':
    case 'wardrobe':
    case 'filing-cabinet':
    case 'bookshelf':
      return (
        <Group>
          {base}
          <Line points={[width * 0.15, height * 0.2, width * 0.85, height * 0.2]} stroke={stroke} strokeWidth={1} />
          <Line points={[width * 0.15, height * 0.5, width * 0.85, height * 0.5]} stroke={stroke} strokeWidth={1} />
          <Line points={[width * 0.15, height * 0.8, width * 0.85, height * 0.8]} stroke={stroke} strokeWidth={1} />
        </Group>
      );
    case 'coffee-table':
    case 'dining-table':
    case 'desk':
    case 'island':
      return (
        <Group>
          {base}
          <Rect x={4} y={4} width={width - 8} height={height - 8} fill="none" stroke={stroke} strokeWidth={1} cornerRadius={2} />
        </Group>
      );
    case 'patio-table':
      return (
        <Group>
          <Circle x={width / 2} y={height / 2} radius={Math.min(width, height) / 2} fill={color} stroke={stroke} strokeWidth={1.5} />
          <Circle x={width / 2} y={height / 2} radius={Math.min(width, height) / 2 - 5} fill="none" stroke={stroke} strokeWidth={1} />
        </Group>
      );
    case 'rug':
      return (
        <Group>
          <Rect width={width} height={height} fill={color} stroke={stroke} strokeWidth={1} cornerRadius={6} opacity={0.85} />
          <Rect x={6} y={6} width={width - 12} height={height - 12} fill="none" stroke={stroke} strokeWidth={1} cornerRadius={4} />
        </Group>
      );
    case 'tv-stand':
      return (
        <Group>
          {base}
          <Rect x={width * 0.3} y={-height * 0.9} width={width * 0.4} height={height * 0.7} fill="#2b2f38" cornerRadius={2} />
        </Group>
      );
    case 'fridge':
      return (
        <Group>
          {base}
          <Line points={[0, height * 0.35, width, height * 0.35]} stroke={stroke} strokeWidth={1.5} />
        </Group>
      );
    case 'stove':
      return (
        <Group>
          {base}
          <Circle x={width * 0.28} y={height * 0.3} radius={Math.min(width, height) * 0.12} fill="none" stroke={stroke} strokeWidth={1.2} />
          <Circle x={width * 0.72} y={height * 0.3} radius={Math.min(width, height) * 0.12} fill="none" stroke={stroke} strokeWidth={1.2} />
          <Circle x={width * 0.28} y={height * 0.7} radius={Math.min(width, height) * 0.12} fill="none" stroke={stroke} strokeWidth={1.2} />
          <Circle x={width * 0.72} y={height * 0.7} radius={Math.min(width, height) * 0.12} fill="none" stroke={stroke} strokeWidth={1.2} />
        </Group>
      );
    case 'sink-kitchen':
    case 'sink-bath':
      return (
        <Group>
          {base}
          <Ellipse x={width / 2} y={height / 2} radiusX={width * 0.35} radiusY={height * 0.3} fill="none" stroke={stroke} strokeWidth={1.5} />
        </Group>
      );
    case 'toilet':
      return (
        <Group>
          <Rect x={width * 0.15} y={0} width={width * 0.7} height={height * 0.3} fill={color} stroke={stroke} strokeWidth={1.5} cornerRadius={2} />
          <Ellipse x={width / 2} y={height * 0.65} radiusX={width * 0.4} radiusY={height * 0.32} fill={color} stroke={stroke} strokeWidth={1.5} />
        </Group>
      );
    case 'bathtub':
      return (
        <Group>
          <Rect width={width} height={height} fill={color} stroke={stroke} strokeWidth={1.5} cornerRadius={height * 0.3} />
          <Rect x={6} y={6} width={width - 12} height={height - 12} fill="none" stroke={stroke} strokeWidth={1} cornerRadius={(height - 12) * 0.3} />
        </Group>
      );
    case 'shower':
      return (
        <Group>
          {base}
          <Line points={[0, 0, width, height]} stroke={stroke} strokeWidth={1} />
          <Line points={[width, 0, 0, height]} stroke={stroke} strokeWidth={1} />
        </Group>
      );
    case 'plant':
      return (
        <Group>
          <Circle x={width / 2} y={height / 2} radius={Math.min(width, height) / 2} fill={color} stroke={stroke} strokeWidth={1.5} />
          <Circle x={width * 0.35} y={height * 0.4} radius={Math.min(width, height) * 0.22} fill={darken(color, 0.15)} />
          <Circle x={width * 0.62} y={height * 0.35} radius={Math.min(width, height) * 0.2} fill={darken(color, 0.05)} />
          <Circle x={width * 0.5} y={height * 0.62} radius={Math.min(width, height) * 0.22} fill={darken(color, 0.25)} />
        </Group>
      );
    case 'grill':
      return (
        <Group>
          {base}
          <Line points={[width * 0.15, height * 0.3, width * 0.85, height * 0.3]} stroke={stroke} strokeWidth={1} />
          <Line points={[width * 0.15, height * 0.55, width * 0.85, height * 0.55]} stroke={stroke} strokeWidth={1} />
          <Line points={[width * 0.15, height * 0.8, width * 0.85, height * 0.8]} stroke={stroke} strokeWidth={1} />
        </Group>
      );
    case 'bench':
      return (
        <Group>
          <Rect y={height * 0.1} width={width} height={height * 0.35} fill={color} stroke={stroke} strokeWidth={1.5} cornerRadius={2} />
          <Rect y={height * 0.55} width={width} height={height * 0.35} fill={color} stroke={stroke} strokeWidth={1.5} cornerRadius={2} />
          <Line points={[width * 0.08, height * 0.1, width * 0.08, height]} stroke={stroke} strokeWidth={1.5} />
          <Line points={[width * 0.92, height * 0.1, width * 0.92, height]} stroke={stroke} strokeWidth={1.5} />
        </Group>
      );
    case 'fence': {
      const postCount = Math.max(2, Math.round(width / 14));
      const posts = [];
      for (let i = 0; i < postCount; i++) {
        const px = (i / (postCount - 1)) * width;
        posts.push(<Line key={i} points={[px, -height, px, height * 3]} stroke={stroke} strokeWidth={1.5} />);
      }
      return (
        <Group>
          <Line points={[0, height / 2, width, height / 2]} stroke={stroke} strokeWidth={height} />
          {posts}
        </Group>
      );
    }
    case 'door':
      return (
        <Group>
          <Line points={[0, height / 2, width, height / 2]} stroke={stroke} strokeWidth={height} />
          <Group y={height / 2} scaleY={flipped ? -1 : 1}>
            <Line points={[0, 0, 0, -width]} stroke={stroke} strokeWidth={1.5} />
            <Arc
              x={0}
              y={0}
              innerRadius={width - 1}
              outerRadius={width}
              angle={90}
              rotation={-90}
              stroke={stroke}
              strokeWidth={1}
              fill="transparent"
            />
          </Group>
        </Group>
      );
    case 'window':
      return (
        <Group>
          <Rect width={width} height={height} fill="#ffffff" stroke={stroke} strokeWidth={2} />
          <Line points={[width / 2, 0, width / 2, height]} stroke={stroke} strokeWidth={1.5} />
        </Group>
      );
    default:
      return base;
  }
}
