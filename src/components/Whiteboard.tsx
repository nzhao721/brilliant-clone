import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { strokesToBoundedDataUrl, type WorkImageStroke } from '../lib/workImage';
import './Whiteboard.css';

/*
 * Full-screen scratch-paper overlay (no drawing library). It is an INFINITE canvas:
 * strokes are stored in WORLD coordinates and rendered through a viewport transform
 * (translate + scale), so pen/eraser/undo/clear/hit-testing all work at any pan/zoom.
 * Input is unified through Pointer Events (mouse, pen, touch).
 *
 * DRAW vs PAN disambiguation:
 *   - A Pan/Draw toggle in the toolbar. In Draw mode a single pointer (pen, one
 *     finger, or left mouse) draws; in Pan mode a single pointer pans.
 *   - On touch, TWO fingers always pan + pinch-zoom regardless of mode (the nascent
 *     one-finger stroke is discarded when the second finger lands).
 *   - On desktop, middle-mouse drag or space+drag always pans; Ctrl/Cmd+wheel zooms
 *     (centered on the cursor) and a plain wheel/trackpad scroll pans.
 *
 * The eraser is just a background-colored world stroke, so it composes correctly at
 * any zoom and in the export. Export (onChange / submit) rasterizes the bounding box
 * of ALL strokes via strokesToBoundedDataUrl — never just the current view — so the
 * vision "review my work" hint sees everything written (null when blank).
 */

const BACKGROUND = '#ffffff';
const PEN_COLOR = '#0f172a';
const PEN_WIDTH = 3;
const ERASER_WIDTH = 26;

const MIN_SCALE = 0.2;
const MAX_SCALE = 8;
const ZOOM_BUTTON_FACTOR = 1.3;
const FIT_PADDING = 48;

type Point = { x: number; y: number };
type Tool = 'pen' | 'eraser';
type Mode = 'draw' | 'pan';
type Stroke = { tool: Tool; points: Point[] };
type Viewport = { scale: number; offsetX: number; offsetY: number };
type Gesture = 'none' | 'draw' | 'pan' | 'pinch';

export type WhiteboardProps = {
  /** Whether the full-screen overlay is shown. Strokes persist while closed. */
  open: boolean;
  /** Close the overlay (drawing is kept). */
  onClose: () => void;
  /** Fires after each finished stroke / undo / clear with the full-content image (null when blank). */
  onChange?: (dataUrl: string | null) => void;
  /** "Check my work": submits the current full-content image for the AI hint. */
  onSubmit?: (dataUrl: string | null) => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  className?: string;
};

function strokeColor(tool: Tool): string {
  return tool === 'eraser' ? BACKGROUND : PEN_COLOR;
}

function strokeWidth(tool: Tool): number {
  return tool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH;
}

function toWorkStroke(stroke: Stroke): WorkImageStroke {
  return { color: strokeColor(stroke.tool), width: strokeWidth(stroke.tool), points: stroke.points };
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const points = stroke.points;
  if (points.length === 0) {
    return;
  }
  ctx.strokeStyle = strokeColor(stroke.tool);
  ctx.fillStyle = strokeColor(stroke.tool);
  ctx.lineWidth = strokeWidth(stroke.tool);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
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

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function Whiteboard({
  open,
  onClose,
  onChange,
  onSubmit,
  submitLabel = 'Check my work',
  submitDisabled = false,
  className,
}: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const zoomLabelRef = useRef<HTMLSpanElement | null>(null);

  const strokesRef = useRef<Stroke[]>([]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const viewRef = useRef<Viewport>({ scale: 1, offsetX: 0, offsetY: 0 });
  const sizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const pointersRef = useRef<Map<number, Point>>(new Map());
  const gestureRef = useRef<Gesture>('none');
  const panStartRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number }>({
    x: 0,
    y: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const pinchStartRef = useRef<{ dist: number; worldMid: Point; scale: number }>({
    dist: 1,
    worldMid: { x: 0, y: 0 },
    scale: 1,
  });
  const spaceRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const toolRef = useRef<Tool>('pen');
  const modeRef = useRef<Mode>('draw');
  const [tool, setTool] = useState<Tool>('pen');
  const [mode, setMode] = useState<Mode>('draw');
  const [canUndo, setCanUndo] = useState(false);
  const [isBlank, setIsBlank] = useState(true);

  const paintAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cssWidth = sizeRef.current.width;
    const cssHeight = sizeRef.current.height;
    const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
    const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== backingWidth) {
      canvas.width = backingWidth;
    }
    if (canvas.height !== backingHeight) {
      canvas.height = backingHeight;
    }

    const view = viewRef.current;
    // Clear to white in device pixels, then draw strokes through the viewport transform.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      view.scale * dpr,
      0,
      0,
      view.scale * dpr,
      view.offsetX * dpr,
      view.offsetY * dpr,
    );
    for (const stroke of strokesRef.current) {
      drawStroke(ctx, stroke);
    }
    if (activeStrokeRef.current) {
      drawStroke(ctx, activeStrokeRef.current);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    if (zoomLabelRef.current) {
      zoomLabelRef.current.textContent = `${Math.round(view.scale * 100)}%`;
    }
  }, []);

  // Mirror the viewport + world content-bounds onto data-* attributes. This is the
  // testable surface in jsdom (where the canvas is mocked) and is updated
  // SYNCHRONOUSLY on every change so it never lags the deferred (rAF) repaint.
  const syncDataAttrs = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const view = viewRef.current;
    canvas.setAttribute('data-pan-x', String(Math.round(view.offsetX)));
    canvas.setAttribute('data-pan-y', String(Math.round(view.offsetY)));
    canvas.setAttribute('data-zoom', String(Math.round(view.scale * 100)));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stroke of strokesRef.current) {
      for (const point of stroke.points) {
        if (point.x < minX) minX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
      }
    }
    canvas.setAttribute(
      'data-content-bounds',
      Number.isFinite(minX)
        ? `${Math.round(minX)},${Math.round(minY)},${Math.round(maxX)},${Math.round(maxY)}`
        : '',
    );
  }, []);

  const scheduleRender = useCallback(() => {
    syncDataAttrs();
    if (rafRef.current != null) {
      return;
    }
    const schedule =
      typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame.bind(window)
        : (cb: FrameRequestCallback) =>
            setTimeout(() => cb(Date.now()), 16) as unknown as number;
    rafRef.current = schedule(() => {
      rafRef.current = null;
      paintAll();
    });
  }, [paintAll, syncDataAttrs]);

  const exportAll = useCallback((): string | null => {
    if (strokesRef.current.length === 0) {
      return null;
    }
    return strokesToBoundedDataUrl(strokesRef.current.map(toWorkStroke));
  }, []);

  const emitChange = useCallback(() => {
    if (!onChange) {
      return;
    }
    onChange(strokesRef.current.length === 0 ? null : exportAll());
  }, [exportAll, onChange]);

  const getCanvasPoint = (event: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const screenToWorld = (sx: number, sy: number): Point => {
    const view = viewRef.current;
    return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
  };

  const zoomAt = useCallback(
    (sx: number, sy: number, targetScale: number) => {
      const view = viewRef.current;
      const newScale = clampScale(targetScale);
      const worldX = (sx - view.offsetX) / view.scale;
      const worldY = (sy - view.offsetY) / view.scale;
      viewRef.current = {
        scale: newScale,
        offsetX: sx - worldX * newScale,
        offsetY: sy - worldY * newScale,
      };
      scheduleRender();
    },
    [scheduleRender],
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      const { width, height } = sizeRef.current;
      zoomAt(width / 2, height / 2, viewRef.current.scale * factor);
    },
    [zoomAt],
  );

  const fitToContent = useCallback(() => {
    const { width, height } = sizeRef.current;
    const drawable = strokesRef.current.filter((stroke) => stroke.points.length > 0);
    if (drawable.length === 0 || width <= 0 || height <= 0) {
      viewRef.current = { scale: 1, offsetX: 0, offsetY: 0 };
      scheduleRender();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stroke of drawable) {
      const half = strokeWidth(stroke.tool) / 2;
      for (const point of stroke.points) {
        minX = Math.min(minX, point.x - half);
        minY = Math.min(minY, point.y - half);
        maxX = Math.max(maxX, point.x + half);
        maxY = Math.max(maxY, point.y + half);
      }
    }
    minX -= FIT_PADDING;
    minY -= FIT_PADDING;
    maxX += FIT_PADDING;
    maxY += FIT_PADDING;
    const boxWidth = Math.max(1, maxX - minX);
    const boxHeight = Math.max(1, maxY - minY);
    const scale = clampScale(Math.min(width / boxWidth, height / boxHeight));
    viewRef.current = {
      scale,
      offsetX: (width - boxWidth * scale) / 2 - minX * scale,
      offsetY: (height - boxHeight * scale) / 2 - minY * scale,
    };
    scheduleRender();
  }, [scheduleRender]);

  const beginPinch = useCallback(() => {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) {
      return;
    }
    const [a, b] = points;
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    pinchStartRef.current = {
      dist,
      worldMid: screenToWorld(midX, midY),
      scale: viewRef.current.scale,
    };
    gestureRef.current = 'pinch';
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    const point = getCanvasPoint(event);
    pointersRef.current.set(event.pointerId, point);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // jsdom / unsupported — input still works without pointer capture.
    }

    if (pointersRef.current.size >= 2) {
      // Two+ pointers => pan/zoom. Discard any nascent one-finger stroke.
      activeStrokeRef.current = null;
      beginPinch();
      scheduleRender();
      return;
    }

    const wantsPan = modeRef.current === 'pan' || event.button === 1 || spaceRef.current;
    if (wantsPan) {
      gestureRef.current = 'pan';
      panStartRef.current = {
        x: point.x,
        y: point.y,
        offsetX: viewRef.current.offsetX,
        offsetY: viewRef.current.offsetY,
      };
    } else {
      gestureRef.current = 'draw';
      activeStrokeRef.current = { tool: toolRef.current, points: [screenToWorld(point.x, point.y)] };
      scheduleRender();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }
    const point = getCanvasPoint(event);
    pointersRef.current.set(event.pointerId, point);
    if (event.cancelable) {
      event.preventDefault();
    }

    const gesture = gestureRef.current;
    if (gesture === 'pinch') {
      const points = [...pointersRef.current.values()];
      if (points.length < 2) {
        return;
      }
      const [a, b] = points;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const start = pinchStartRef.current;
      const newScale = clampScale(start.scale * (dist / start.dist));
      viewRef.current = {
        scale: newScale,
        offsetX: midX - start.worldMid.x * newScale,
        offsetY: midY - start.worldMid.y * newScale,
      };
      scheduleRender();
    } else if (gesture === 'pan') {
      const start = panStartRef.current;
      viewRef.current = {
        ...viewRef.current,
        offsetX: start.offsetX + (point.x - start.x),
        offsetY: start.offsetY + (point.y - start.y),
      };
      scheduleRender();
    } else if (gesture === 'draw' && activeStrokeRef.current) {
      activeStrokeRef.current.points.push(screenToWorld(point.x, point.y));
      scheduleRender();
    }
  };

  const finishStroke = () => {
    const stroke = activeStrokeRef.current;
    activeStrokeRef.current = null;
    if (!stroke || stroke.points.length === 0) {
      scheduleRender();
      return;
    }
    strokesRef.current = [...strokesRef.current, stroke];
    setCanUndo(true);
    setIsBlank(false);
    scheduleRender();
    emitChange();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }
    pointersRef.current.delete(event.pointerId);
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    const remaining = pointersRef.current.size;
    const gesture = gestureRef.current;
    if (gesture === 'draw') {
      finishStroke();
      gestureRef.current = 'none';
      return;
    }
    if (gesture === 'pinch') {
      if (remaining >= 2) {
        beginPinch();
      } else if (remaining === 1) {
        // Drop to a single-finger pan so lifting one finger doesn't start a stroke.
        const last = [...pointersRef.current.values()][0];
        gestureRef.current = 'pan';
        panStartRef.current = {
          x: last.x,
          y: last.y,
          offsetX: viewRef.current.offsetX,
          offsetY: viewRef.current.offsetY,
        };
      } else {
        gestureRef.current = 'none';
      }
      return;
    }
    if (gesture === 'pan' && remaining === 0) {
      gestureRef.current = 'none';
    }
  };

  const handleUndo = () => {
    if (strokesRef.current.length === 0) {
      return;
    }
    strokesRef.current = strokesRef.current.slice(0, -1);
    setCanUndo(strokesRef.current.length > 0);
    setIsBlank(strokesRef.current.length === 0);
    scheduleRender();
    emitChange();
  };

  const handleClear = () => {
    if (strokesRef.current.length === 0) {
      return;
    }
    strokesRef.current = [];
    activeStrokeRef.current = null;
    setCanUndo(false);
    setIsBlank(true);
    scheduleRender();
    emitChange();
  };

  const selectTool = (next: Tool) => {
    toolRef.current = next;
    modeRef.current = 'draw';
    setTool(next);
    setMode('draw');
  };

  const togglePan = () => {
    const next: Mode = modeRef.current === 'pan' ? 'draw' : 'pan';
    modeRef.current = next;
    setMode(next);
  };

  const handleSubmit = () => {
    onSubmit?.(exportAll());
  };

  const onWheel = useCallback(
    (event: WheelEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      if (event.ctrlKey || event.metaKey) {
        zoomAt(px, py, viewRef.current.scale * Math.exp(-event.deltaY * 0.0015));
      } else {
        viewRef.current = {
          ...viewRef.current,
          offsetX: viewRef.current.offsetX - event.deltaX,
          offsetY: viewRef.current.offsetY - event.deltaY,
        };
        scheduleRender();
      }
    },
    [scheduleRender, zoomAt],
  );

  // Measure the overlay, keep the canvas sized to it (dpr handled in paint), repaint.
  useEffect(() => {
    if (!open) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const measure = () => {
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { width: rect.width, height: rect.height };
      scheduleRender();
    };
    measure();
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(canvas);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, scheduleRender]);

  // Non-passive wheel listener so Ctrl/Cmd+wheel zoom and scroll-pan can preventDefault.
  useEffect(() => {
    if (!open) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [open, onWheel]);

  // Escape to close; space = temporary pan on desktop.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.code === 'Space') {
        const target = event.target as HTMLElement | null;
        const typing =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable);
        if (!typing) {
          event.preventDefault();
          spaceRef.current = true;
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceRef.current = false;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      spaceRef.current = false;
    };
  }, [open, onClose]);

  // Lock body scroll while the overlay is open; move focus in for accessibility.
  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Cancel any pending frame on unmount.
  useEffect(
    () => () => {
      if (rafRef.current != null && typeof window !== 'undefined' && window.cancelAnimationFrame) {
        window.cancelAnimationFrame(rafRef.current);
      }
    },
    [],
  );

  if (!open) {
    return null;
  }

  return createPortal(
    <div
      className={['whiteboard-overlay', className].filter(Boolean).join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Scratch paper"
    >
      <canvas
        ref={canvasRef}
        className={`whiteboard-canvas${mode === 'pan' ? ' is-pan' : ''}`}
        role="img"
        aria-label="Scratch paper drawing area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div className="whiteboard-toolbar" role="toolbar" aria-label="Scratch paper tools">
        <div className="whiteboard-group">
          <button
            type="button"
            className={`whiteboard-tool${tool === 'pen' && mode === 'draw' ? ' is-active' : ''}`}
            aria-pressed={tool === 'pen' && mode === 'draw'}
            onClick={() => selectTool('pen')}
          >
            Pen
          </button>
          <button
            type="button"
            className={`whiteboard-tool${tool === 'eraser' && mode === 'draw' ? ' is-active' : ''}`}
            aria-pressed={tool === 'eraser' && mode === 'draw'}
            onClick={() => selectTool('eraser')}
          >
            Eraser
          </button>
          <button
            type="button"
            className={`whiteboard-tool${mode === 'pan' ? ' is-active' : ''}`}
            aria-pressed={mode === 'pan'}
            onClick={togglePan}
          >
            Pan
          </button>
        </div>

        <div className="whiteboard-group">
          <button
            type="button"
            className="whiteboard-tool"
            onClick={handleUndo}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="whiteboard-tool"
            onClick={handleClear}
            disabled={isBlank}
          >
            Clear
          </button>
        </div>

        <div className="whiteboard-group">
          <button
            type="button"
            className="whiteboard-tool whiteboard-icon"
            aria-label="Zoom out"
            onClick={() => zoomByFactor(1 / ZOOM_BUTTON_FACTOR)}
          >
            &minus;
          </button>
          <span className="whiteboard-zoom" ref={zoomLabelRef} aria-live="off">
            100%
          </span>
          <button
            type="button"
            className="whiteboard-tool whiteboard-icon"
            aria-label="Zoom in"
            onClick={() => zoomByFactor(ZOOM_BUTTON_FACTOR)}
          >
            +
          </button>
          <button type="button" className="whiteboard-tool" onClick={fitToContent}>
            Reset view
          </button>
        </div>

        <div className="whiteboard-group whiteboard-group-end">
          <button
            type="button"
            className="primary-button whiteboard-submit"
            onClick={handleSubmit}
            disabled={isBlank || submitDisabled}
          >
            {submitLabel}
          </button>
          <button
            type="button"
            className="whiteboard-tool whiteboard-close"
            onClick={onClose}
            ref={closeButtonRef}
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
