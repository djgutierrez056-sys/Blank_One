import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva';
import { usePlannerStore } from '../../state/store';
import { RoomShape } from './RoomShape';
import { FurnitureShape } from './FurnitureShape';
import { WallShape } from './WallShape';
import { snapValue } from '../../utils/geometry';

const WALL_THICKNESS = 6;

const GRID_COLOR = '#e3e6ec';
const GRID_COLOR_MAJOR = '#cdd2db';

export function PlanCanvas() {
  const project = usePlannerStore((s) => s.project);
  const selectedIds = usePlannerStore((s) => s.selectedIds);
  const tool = usePlannerStore((s) => s.tool);
  const select = usePlannerStore((s) => s.select);
  const clearSelection = usePlannerStore((s) => s.clearSelection);
  const toggleSelect = usePlannerStore((s) => s.toggleSelect);
  const addRoom = usePlannerStore((s) => s.addRoom);
  const addWall = usePlannerStore((s) => s.addWall);
  const addItemFromCatalog = usePlannerStore((s) => s.addItemFromCatalog);
  const setTool = usePlannerStore((s) => s.setTool);
  const setCanvasSize = usePlannerStore((s) => s.setCanvasSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [wallEnd, setWallEnd] = useState<{ x: number; y: number } | null>(null);

  const gridSnapPx = project.gridSnap * project.scale;

  useEffect(() => {
    function updateSize() {
      if (containerRef.current) {
        const next = {
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        };
        setSize(next);
        setCanvasSize(next);
      }
    }
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [setCanvasSize]);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const nodes = selectedIds
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(tool === 'select' ? nodes : []);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, project, tool]);

  function registerRef(id: string, node: Konva.Node | null) {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }

  function stagePos(): { x: number; y: number } | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return pointer;
  }

  function handleMouseDown() {
    if (tool === 'draw-room') {
      const pos = stagePos();
      if (!pos) return;
      setDrawStart(pos);
      setDrawRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
      return;
    }
    if (tool === 'draw-wall') {
      const pos = stagePos();
      if (!pos) return;
      const snapped = { x: snapValue(pos.x, gridSnapPx), y: snapValue(pos.y, gridSnapPx) };
      setDrawStart(snapped);
      setWallEnd(snapped);
    }
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (tool === 'select' && e.target === stageRef.current) {
      clearSelection();
    }
  }

  function handleMouseMove() {
    if (tool === 'draw-room' && drawStart) {
      const pos = stagePos();
      if (!pos) return;
      setDrawRect({
        x: Math.min(drawStart.x, pos.x),
        y: Math.min(drawStart.y, pos.y),
        w: Math.abs(pos.x - drawStart.x),
        h: Math.abs(pos.y - drawStart.y),
      });
      return;
    }
    if (tool === 'draw-wall' && drawStart) {
      const pos = stagePos();
      if (!pos) return;
      setWallEnd(pos);
    }
  }

  function handleMouseUp() {
    if (tool === 'draw-room' && drawStart && drawRect) {
      if (drawRect.w > 15 && drawRect.h > 15) {
        const id = addRoom({
          x: snapValue(drawRect.x, gridSnapPx),
          y: snapValue(drawRect.y, gridSnapPx),
          width: snapValue(drawRect.w, gridSnapPx),
          height: snapValue(drawRect.h, gridSnapPx),
          label: 'Room',
        });
        select([id]);
      }
      setDrawStart(null);
      setDrawRect(null);
      setTool('select');
      return;
    }
    if (tool === 'draw-wall' && drawStart && wallEnd) {
      const dx = wallEnd.x - drawStart.x;
      const dy = wallEnd.y - drawStart.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 10) {
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const id = addWall({
          x: drawStart.x,
          y: drawStart.y,
          width: snapValue(length, gridSnapPx || 6),
          height: WALL_THICKNESS,
          rotation: angle,
          label: 'Wall',
        });
        select([id]);
      }
      setDrawStart(null);
      setWallEnd(null);
      setTool('select');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const catalogId = e.dataTransfer.getData('text/catalog-id');
    if (!catalogId || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    addItemFromCatalog(catalogId, x, y);
  }

  const gridLines = [];
  const spacing = gridSnapPx > 0 ? gridSnapPx : project.scale;
  const cols = Math.ceil(size.width / spacing) + 1;
  const rows = Math.ceil(size.height / spacing) + 1;
  for (let i = 0; i <= cols; i++) {
    const x = i * spacing;
    const isMajor = Math.round(x) % (project.scale * 5) < 1;
    gridLines.push(
      <Line key={`v${i}`} points={[x, 0, x, size.height]} stroke={isMajor ? GRID_COLOR_MAJOR : GRID_COLOR} strokeWidth={1} />
    );
  }
  for (let j = 0; j <= rows; j++) {
    const y = j * spacing;
    const isMajor = Math.round(y) % (project.scale * 5) < 1;
    gridLines.push(
      <Line key={`h${j}`} points={[0, y, size.width, y]} stroke={isMajor ? GRID_COLOR_MAJOR : GRID_COLOR} strokeWidth={1} />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-white"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
        style={{ cursor: tool === 'draw-room' || tool === 'draw-wall' ? 'crosshair' : 'default' }}
      >
        <Layer listening={false}>{gridLines}</Layer>
        <Layer>
          {project.rooms.map((room) => (
            <RoomShape
              key={room.id}
              room={room}
              isSelected={selectedIds.includes(room.id)}
              scale={project.scale}
              gridSnapPx={gridSnapPx}
              showLabels={project.showLabels}
              onSelect={(id, additive) => toggleSelect(id, additive)}
              registerRef={registerRef}
              toolMode={tool}
            />
          ))}
          {project.walls.map((wall) => (
            <WallShape
              key={wall.id}
              wall={wall}
              isSelected={selectedIds.includes(wall.id)}
              gridSnapPx={gridSnapPx}
              onSelect={(id, additive) => toggleSelect(id, additive)}
              registerRef={registerRef}
              toolMode={tool}
            />
          ))}
          {project.items.map((item) => (
            <FurnitureShape
              key={item.id}
              item={item}
              isSelected={selectedIds.includes(item.id)}
              gridSnapPx={gridSnapPx}
              onSelect={(id, additive) => toggleSelect(id, additive)}
              registerRef={registerRef}
              toolMode={tool}
            />
          ))}
          {drawRect && (
            <Rect
              x={drawRect.x}
              y={drawRect.y}
              width={drawRect.w}
              height={drawRect.h}
              stroke="#4f7cff"
              dash={[6, 4]}
              fill="rgba(79,124,255,0.08)"
            />
          )}
          {tool === 'draw-wall' && drawStart && wallEnd && (
            <Line
              points={[drawStart.x, drawStart.y, wallEnd.x, wallEnd.y]}
              stroke="#4f7cff"
              strokeWidth={WALL_THICKNESS}
              dash={[8, 5]}
              lineCap="round"
            />
          )}
          <Transformer
            ref={transformerRef}
            rotateEnabled
            rotationSnaps={[0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]}
            anchorSize={8}
            borderStroke="#4f7cff"
            anchorStroke="#4f7cff"
            anchorFill="#ffffff"
          />
        </Layer>
      </Stage>
    </div>
  );
}
