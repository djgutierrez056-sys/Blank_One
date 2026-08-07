import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import { Circle, Label as KLabel, Layer, Line, Rect, Stage, Tag, Text, Transformer } from 'react-konva';
import { getActivePage, MAX_ZOOM, MIN_ZOOM, usePlannerStore } from '../../state/store';
import { RoomShape } from './RoomShape';
import { FurnitureShape } from './FurnitureShape';
import { WallShape } from './WallShape';
import { TextLabelShape } from './TextLabelShape';
import { snapValue } from '../../utils/geometry';
import { findPointSnap } from '../../utils/wallSnap';
import { broadcastCursor } from '../../lib/collab';
import { ChatPanel } from '../Toolbar/ChatPanel';
import { LockedItemsPanel } from '../Toolbar/LockedItemsPanel';

const WALL_THICKNESS = 6;
const ZOOM_STEP = 1.15;

const GRID_COLOR = '#e3e6ec';
const GRID_COLOR_MAJOR = '#cdd2db';

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function entityBounds(e: { x: number; y: number; width: number; height: number; rotation: number; kind: string }): Bounds {
  const rad = (e.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Walls are drawn centered on their y-axis (a line with thickness), everything
  // else is drawn from a top-left origin.
  const yTop = e.kind === 'wall' ? -e.height / 2 : 0;
  const yBottom = e.kind === 'wall' ? e.height / 2 : e.height;
  const corners = [
    { x: 0, y: yTop },
    { x: e.width, y: yTop },
    { x: e.width, y: yBottom },
    { x: 0, y: yBottom },
  ].map((c) => ({ x: e.x + c.x * cos - c.y * sin, y: e.y + c.x * sin + c.y * cos }));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function PlanCanvas() {
  const project = usePlannerStore((s) => s.project);
  const activePage = usePlannerStore((s) => getActivePage(s.project));
  const selectedIds = usePlannerStore((s) => s.selectedIds);
  const tool = usePlannerStore((s) => s.tool);
  const zoom = usePlannerStore((s) => s.zoom);
  const select = usePlannerStore((s) => s.select);
  const clearSelection = usePlannerStore((s) => s.clearSelection);
  const toggleSelect = usePlannerStore((s) => s.toggleSelect);
  const addRoom = usePlannerStore((s) => s.addRoom);
  const addWall = usePlannerStore((s) => s.addWall);
  const addText = usePlannerStore((s) => s.addText);
  const updateEntity = usePlannerStore((s) => s.updateEntity);
  const addItemFromCatalog = usePlannerStore((s) => s.addItemFromCatalog);
  const setTool = usePlannerStore((s) => s.setTool);
  const setCanvasSize = usePlannerStore((s) => s.setCanvasSize);
  const setZoom = usePlannerStore((s) => s.setZoom);
  const setCursorPos = usePlannerStore((s) => s.setCursorPos);
  const setViewCenter = usePlannerStore((s) => s.setViewCenter);
  const remoteCursors = usePlannerStore((s) => s.remoteCursors);
  const localBubble = usePlannerStore((s) => s.localBubble);
  const cursorPos = usePlannerStore((s) => s.cursorPos);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Map<string, Konva.Node>>(new Map());
  const justMarqueeSelectedRef = useRef(false);

  const [size, setSize] = useState({ width: 800, height: 600 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [wallEnd, setWallEnd] = useState<{ x: number; y: number } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [selectStart, setSelectStart] = useState<{ x: number; y: number } | null>(null);
  const [selectRect, setSelectRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

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

  // Hold Space to pan by dragging (like most design tools); otherwise a
  // left-drag on empty canvas draws a marquee selection instead.
  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === 'Space' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpacePressed(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') setSpacePressed(false);
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Keep the store's notion of "visible center" (used for catalog click-to-add)
  // in sync with the current pan/zoom.
  useEffect(() => {
    setViewCenter({
      x: (size.width / 2 - pan.x) / zoom,
      y: (size.height / 2 - pan.y) / zoom,
    });
  }, [size, pan, zoom, setViewCenter]);

  useEffect(() => {
    const tr = transformerRef.current;
    if (!tr) return;
    const lockedIds = new Set([
      ...activePage.rooms.filter((r) => r.locked).map((r) => r.id),
      ...activePage.items.filter((i) => i.locked).map((i) => i.id),
      ...activePage.walls.filter((w) => w.locked).map((w) => w.id),
      ...activePage.texts.filter((t) => t.locked).map((t) => t.id),
    ]);
    const nodes = selectedIds
      .filter((id) => !lockedIds.has(id))
      .map((id) => nodeRefs.current.get(id))
      .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(tool === 'select' ? nodes : []);
    tr.getLayer()?.batchDraw();
  }, [selectedIds, project, tool, activePage]);

  function registerRef(id: string, node: Konva.Node | null) {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }

  function stagePos(): { x: number; y: number } | null {
    const stage = stageRef.current;
    if (!stage) return null;
    return stage.getRelativePointerPosition();
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>) {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const worldPoint = { x: (pointer.x - pan.x) / zoom, y: (pointer.y - pan.y) / zoom };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, direction > 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP));

    setZoom(nextZoom);
    setPan({
      x: pointer.x - worldPoint.x * nextZoom,
      y: pointer.y - worldPoint.y * nextZoom,
    });
  }

  function zoomBy(factor: number) {
    const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * factor));
    const cx = size.width / 2;
    const cy = size.height / 2;
    const worldPoint = { x: (cx - pan.x) / zoom, y: (cy - pan.y) / zoom };
    setZoom(nextZoom);
    setPan({ x: cx - worldPoint.x * nextZoom, y: cy - worldPoint.y * nextZoom });
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>) {
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
      const pointSnap = findPointSnap(activePage, pos.x, pos.y);
      const snapped = pointSnap ?? { x: snapValue(pos.x, gridSnapPx), y: snapValue(pos.y, gridSnapPx) };
      setDrawStart(snapped);
      setWallEnd(snapped);
      return;
    }
    if (tool === 'place-text') {
      const pos = stagePos();
      if (!pos) return;
      const id = addText(pos.x, pos.y);
      select([id]);
      setTool('select');
      // Defer opening the inline editor until this click's mouseup/click
      // cycle fully finishes — Konva can steal focus back on the same
      // gesture, which would immediately blur (and close) the editor.
      setTimeout(() => setEditingTextId(id), 0);
      return;
    }
    if (tool === 'select' && !spacePressed && e.target === stageRef.current) {
      const pos = stagePos();
      if (!pos) return;
      setSelectStart(pos);
      setSelectRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
    }
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>) {
    if (justMarqueeSelectedRef.current) {
      justMarqueeSelectedRef.current = false;
      return;
    }
    if (tool === 'select' && e.target === stageRef.current && !editingTextId) {
      clearSelection();
    }
  }

  function handleMouseMove() {
    const pos = stagePos();
    if (pos) {
      setCursorPos(pos);
      broadcastCursor(pos.x, pos.y);
    }

    if (tool === 'draw-room' && drawStart) {
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
      if (!pos) return;
      const pointSnap = findPointSnap(activePage, pos.x, pos.y);
      setWallEnd(pointSnap ?? pos);
      return;
    }
    if (selectStart) {
      if (!pos) return;
      setSelectRect({
        x: Math.min(selectStart.x, pos.x),
        y: Math.min(selectStart.y, pos.y),
        w: Math.abs(pos.x - selectStart.x),
        h: Math.abs(pos.y - selectStart.y),
      });
    }
  }

  function handleMouseUp(e: Konva.KonvaEventObject<MouseEvent>) {
    if (selectStart && selectRect) {
      if (selectRect.w > 3 || selectRect.h > 3) {
        const marquee: Bounds = {
          minX: selectRect.x,
          minY: selectRect.y,
          maxX: selectRect.x + selectRect.w,
          maxY: selectRect.y + selectRect.h,
        };
        const hits = [
          ...activePage.rooms,
          ...activePage.walls,
          ...activePage.items,
          ...activePage.texts,
        ].filter((entity) => boundsIntersect(marquee, entityBounds(entity)));
        const hitIds = hits.map((h) => h.id);
        if (e.evt.shiftKey) {
          select([...new Set([...selectedIds, ...hitIds])]);
        } else {
          select(hitIds);
        }
        justMarqueeSelectedRef.current = true;
      }
      setSelectStart(null);
      setSelectRect(null);
      return;
    }
    if (tool === 'draw-room' && drawStart && drawRect) {
      if (drawRect.w > 15 && drawRect.h > 15) {
        const id = addRoom({
          x: snapValue(drawRect.x, gridSnapPx),
          y: snapValue(drawRect.y, gridSnapPx),
          width: snapValue(drawRect.w, gridSnapPx),
          height: snapValue(drawRect.h, gridSnapPx),
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
    const stage = stageRef.current;
    if (!catalogId || !containerRef.current || !stage) return;
    const rect = containerRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const world = stage.getAbsoluteTransform().copy().invert().point({ x: screenX, y: screenY });
    addItemFromCatalog(catalogId, world.x, world.y);
  }

  const editingText = activePage.texts.find((t) => t.id === editingTextId) ?? null;

  const worldLeft = -pan.x / zoom;
  const worldTop = -pan.y / zoom;
  const worldRight = (size.width - pan.x) / zoom;
  const worldBottom = (size.height - pan.y) / zoom;

  const gridLines = [];
  const spacing = gridSnapPx > 0 ? gridSnapPx : project.scale;
  const strokeW = 1 / zoom;
  const startCol = Math.floor(worldLeft / spacing);
  const endCol = Math.ceil(worldRight / spacing);
  const startRow = Math.floor(worldTop / spacing);
  const endRow = Math.ceil(worldBottom / spacing);
  const maxLines = 400;
  for (let i = startCol, count = 0; i <= endCol && count < maxLines; i++, count++) {
    const x = i * spacing;
    const isMajor = Math.round(x) % (project.scale * 5) < 1;
    gridLines.push(
      <Line
        key={`v${i}`}
        points={[x, worldTop, x, worldBottom]}
        stroke={isMajor ? GRID_COLOR_MAJOR : GRID_COLOR}
        strokeWidth={strokeW}
      />
    );
  }
  for (let j = startRow, count = 0; j <= endRow && count < maxLines; j++, count++) {
    const y = j * spacing;
    const isMajor = Math.round(y) % (project.scale * 5) < 1;
    gridLines.push(
      <Line
        key={`h${j}`}
        points={[worldLeft, y, worldRight, y]}
        stroke={isMajor ? GRID_COLOR_MAJOR : GRID_COLOR}
        strokeWidth={strokeW}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-white"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={pan.x}
        y={pan.y}
        scaleX={zoom}
        scaleY={zoom}
        draggable={spacePressed}
        onDragMove={(e) => {
          if (e.target === stageRef.current) setPan({ x: e.target.x(), y: e.target.y() });
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
        onWheel={handleWheel}
        style={{
          cursor: spacePressed
            ? 'grab'
            : tool === 'draw-room' || tool === 'draw-wall' || tool === 'place-text'
              ? 'crosshair'
              : 'default',
        }}
      >
        <Layer listening={false}>{gridLines}</Layer>
        <Layer>
          {activePage.rooms.map((room) => (
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
          {activePage.walls.map((wall) => (
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
          {activePage.items.map((item) => (
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
          {activePage.texts.map((textLabel) => (
            <TextLabelShape
              key={textLabel.id}
              textLabel={textLabel}
              isSelected={selectedIds.includes(textLabel.id)}
              isEditing={editingTextId === textLabel.id}
              gridSnapPx={gridSnapPx}
              onSelect={(id, additive) => toggleSelect(id, additive)}
              onEditRequest={(id) => {
                select([id]);
                setTimeout(() => setEditingTextId(id), 0);
              }}
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
          {selectRect && (
            <Rect
              x={selectRect.x}
              y={selectRect.y}
              width={selectRect.w}
              height={selectRect.h}
              stroke="#4f7cff"
              strokeWidth={1 / zoom}
              dash={[4 / zoom, 3 / zoom]}
              fill="rgba(79,124,255,0.1)"
              listening={false}
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
          {Object.entries(remoteCursors).map(([id, cursor]) => (
            <Text
              key={id}
              x={cursor.x}
              y={cursor.y}
              text={`▲ ${cursor.name}`}
              fontSize={12 / zoom}
              fontFamily="system-ui"
              fill={cursor.color}
              listening={false}
            />
          ))}
          {Object.entries(remoteCursors).map(([id, cursor]) => (
            <Circle key={`dot-${id}`} x={cursor.x} y={cursor.y} radius={3 / zoom} fill={cursor.color} listening={false} />
          ))}
          {Object.entries(remoteCursors).map(
            ([id, cursor]) =>
              cursor.bubble && (
                <KLabel key={`bubble-${id}`} x={cursor.x} y={cursor.y - 18 / zoom} listening={false}>
                  <Tag fill={cursor.color} cornerRadius={5 / zoom} pointerDirection="down" pointerWidth={6 / zoom} pointerHeight={5 / zoom} />
                  <Text text={cursor.bubble.text} fontSize={12 / zoom} fontFamily="system-ui" fill="#ffffff" padding={5 / zoom} />
                </KLabel>
              )
          )}
          {localBubble && cursorPos && (
            <KLabel x={cursorPos.x} y={cursorPos.y - 18 / zoom} listening={false}>
              <Tag fill="#334155" cornerRadius={5 / zoom} pointerDirection="down" pointerWidth={6 / zoom} pointerHeight={5 / zoom} />
              <Text text={localBubble.text} fontSize={12 / zoom} fontFamily="system-ui" fill="#ffffff" padding={5 / zoom} />
            </KLabel>
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

      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-1.5 py-1 shadow-sm">
        <button
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          className="flex h-6 w-6 items-center justify-center rounded text-sm text-slate-600 hover:bg-slate-100"
          title="Zoom out"
        >
          −
        </button>
        <button
          onClick={resetView}
          className="min-w-[3.2rem] rounded px-1 text-xs text-slate-600 hover:bg-slate-100"
          title="Reset zoom"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={() => zoomBy(ZOOM_STEP)}
          className="flex h-6 w-6 items-center justify-center rounded text-sm text-slate-600 hover:bg-slate-100"
          title="Zoom in"
        >
          +
        </button>
      </div>

      <ChatPanel />
      <LockedItemsPanel />

      {editingText && (
        <textarea
          autoFocus
          defaultValue={editingText.text}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            updateEntity(editingText.id, { text: e.target.value.trim() || 'Text' }, { commit: true });
            setEditingTextId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              setEditingTextId(null);
            }
          }}
          style={{
            position: 'absolute',
            left: editingText.x * zoom + pan.x,
            top: editingText.y * zoom + pan.y,
            width: editingText.width * zoom,
            fontSize: editingText.fontSize * zoom,
            fontFamily: 'system-ui',
            color: editingText.color,
            border: '1px solid #4f7cff',
            borderRadius: 4,
            padding: 2,
            background: 'white',
            lineHeight: 1.3,
            zIndex: 10,
            transformOrigin: 'top left',
          }}
        />
      )}
    </div>
  );
}
