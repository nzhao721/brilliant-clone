import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { canvasToBoundedDataUrl } from '../lib/workImage';
import './Whiteboard.css';

/*
 * Hand-rolled canvas scratch pad (no drawing library). Supports pointer AND touch
 * input (via Pointer Events), a pen and an eraser, undo, and clear. Strokes are
 * kept as vectors so undo/clear can repaint losslessly. After each finished stroke
 * (or undo/clear) it reports the current drawing as a bounded JPEG data URL via
 * `onChange` (null when blank) — that image is what the vision "review my work"
 * hint consumes, so the whiteboard is interchangeable with an uploaded picture.
 */

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 380;
const BACKGROUND = '#ffffff';
const PEN_COLOR = '#0f172a';
const PEN_WIDTH = 3;
const ERASER_WIDTH = 26;

type Point = { x: number; y: number };
type Tool = 'pen' | 'eraser';
type Stroke = { tool: Tool; points: Point[] };

export type WhiteboardProps = {
  /** Fires after each finished stroke / undo / clear with the current image (null when blank). */
  onChange?: (dataUrl: string | null) => void;
  className?: string;
};

function strokeWidth(tool: Tool): number {
  return tool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH;
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, tool: Tool): void {
  ctx.strokeStyle = tool === 'eraser' ? BACKGROUND : PEN_COLOR;
  ctx.fillStyle = tool === 'eraser' ? BACKGROUND : PEN_COLOR;
  ctx.lineWidth = strokeWidth(tool);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const points = stroke.points;
  if (points.length === 0) {
    return;
  }
  applyStrokeStyle(ctx, stroke.tool);
  if (points.length === 1) {
    // A single tap leaves a dot.
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, strokeWidth(stroke.tool) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

export function Whiteboard({ onChange, className }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const toolRef = useRef<Tool>('pen');
  const [tool, setTool] = useState<Tool>('pen');
  const [canUndo, setCanUndo] = useState(false);
  const [isBlank, setIsBlank] = useState(true);

  const getContext = useCallback(
    (): CanvasRenderingContext2D | null => canvasRef.current?.getContext('2d') ?? null,
    [],
  );

  const paintAll = useCallback(() => {
    const ctx = getContext();
    if (!ctx) {
      return;
    }
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }
  }, [getContext]);

  // Prime the white background once mounted so exports aren't transparent.
  useEffect(() => {
    paintAll();
  }, [paintAll]);

  const emitChange = useCallback(() => {
    if (!onChange) {
      return;
    }
    if (strokesRef.current.length === 0) {
      onChange(null);
      return;
    }
    const canvas = canvasRef.current;
    onChange(canvas ? canvasToBoundedDataUrl(canvas) : null);
  }, [onChange]);

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // jsdom / unsupported — drawing still works without pointer capture.
    }
    const point = pointFromEvent(event);
    activeStrokeRef.current = { tool: toolRef.current, points: [point] };
    const ctx = getContext();
    if (ctx) {
      drawStroke(ctx, activeStrokeRef.current);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) {
      return;
    }
    event.preventDefault();
    const point = pointFromEvent(event);
    const prev = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);
    const ctx = getContext();
    if (!ctx) {
      return;
    }
    applyStrokeStyle(ctx, stroke.tool);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const finishStroke = () => {
    const stroke = activeStrokeRef.current;
    if (!stroke) {
      return;
    }
    activeStrokeRef.current = null;
    strokesRef.current = [...strokesRef.current, stroke];
    setCanUndo(true);
    setIsBlank(false);
    emitChange();
  };

  const handleUndo = () => {
    if (strokesRef.current.length === 0) {
      return;
    }
    strokesRef.current = strokesRef.current.slice(0, -1);
    paintAll();
    setCanUndo(strokesRef.current.length > 0);
    setIsBlank(strokesRef.current.length === 0);
    emitChange();
  };

  const handleClear = () => {
    if (strokesRef.current.length === 0) {
      return;
    }
    strokesRef.current = [];
    activeStrokeRef.current = null;
    paintAll();
    setCanUndo(false);
    setIsBlank(true);
    emitChange();
  };

  const selectTool = (next: Tool) => {
    toolRef.current = next;
    setTool(next);
  };

  return (
    <div className={['whiteboard', className].filter(Boolean).join(' ')}>
      <div className="whiteboard-toolbar" role="toolbar" aria-label="Scratch paper tools">
        <button
          type="button"
          className={`whiteboard-tool${tool === 'pen' ? ' is-active' : ''}`}
          aria-pressed={tool === 'pen'}
          onClick={() => selectTool('pen')}
        >
          Pen
        </button>
        <button
          type="button"
          className={`whiteboard-tool${tool === 'eraser' ? ' is-active' : ''}`}
          aria-pressed={tool === 'eraser'}
          onClick={() => selectTool('eraser')}
        >
          Eraser
        </button>
        <button type="button" className="whiteboard-tool" onClick={handleUndo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="whiteboard-tool" onClick={handleClear} disabled={isBlank}>
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="whiteboard-canvas"
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        role="img"
        aria-label="Scratch paper drawing area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishStroke}
        onPointerLeave={finishStroke}
        onPointerCancel={finishStroke}
      />
    </div>
  );
}
