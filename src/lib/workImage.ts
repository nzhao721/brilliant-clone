/*
 * Turns a student's uploaded picture/PDF (or a whiteboard canvas) into a bounded,
 * compressed base64 image data URL suitable for the vision "review my work" hint
 * (see generateWorkHint in ./ai.ts).
 *
 * Everything here is best-effort and NEVER throws: any failure resolves to `null`
 * so the caller simply falls back to the existing text hint. pdfjs-dist is loaded
 * lazily (dynamic import) so it's code-split out of the main bundle and only
 * touched when a PDF is actually uploaded.
 */

/** Longest side (px) the work image is scaled down to, to cap vision token cost. */
export const MAX_WORK_IMAGE_DIMENSION = 1536;

/** Hard cap on the produced data-URL length (chars). The server caps far higher. */
export const MAX_WORK_IMAGE_DATA_URL_LENGTH = 1_800_000;

/** Max accepted size per uploaded FILE (bytes). Enforced before decoding. */
export const MAX_WORK_FILE_BYTES = 10 * 1024 * 1024;

/** Max number of images (pages) accepted across all uploaded files. */
export const MAX_WORK_IMAGES = 8;

/** Exact, user-facing limit copy — derived from the caps so text === enforcement. */
export const WORK_SIZE_LIMIT_TEXT = `Up to ${Math.round(
  MAX_WORK_FILE_BYTES / (1024 * 1024),
)} MB per file · max ${MAX_WORK_IMAGES} pages`;

/** JPEG qualities tried in order until the encoded data URL fits the size cap. */
const JPEG_QUALITY_LADDER = [0.85, 0.72, 0.6, 0.45] as const;

/**
 * A tiny, valid 1x1 white PNG data URL. Used as the LAST-resort "blank work
 * surface" when no real work is attached and a canvas isn't available (e.g.
 * jsdom). The work-review hint ALWAYS sends an image so the vision model itself
 * judges the (blank/empty) work and returns the "make a substantial start" nudge,
 * rather than the client fabricating that message. Never empty, so the call runs.
 */
export const BLANK_WORK_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * Produces a BLANK white work image data URL for the "no work attached" case, so
 * the vision hint always has something to look at. Renders a real blank page when
 * a 2D canvas is available; otherwise falls back to {@link BLANK_WORK_IMAGE}.
 * Never throws.
 */
export function createBlankWorkImage(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = WORK_IMAGE_BACKGROUND;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', 0.6);
      if (url && url.startsWith('data:image/')) {
        return url;
      }
    }
  } catch {
    // Fall through to the constant.
  }
  return BLANK_WORK_IMAGE;
}

/** MIME types the upload control accepts. */
export const ACCEPTED_WORK_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

/** `accept` attribute for the upload <input>, covering MIME types + extensions. */
export const WORK_FILE_ACCEPT_ATTR =
  '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf';

function isAcceptedType(type: string): boolean {
  return (ACCEPTED_WORK_FILE_TYPES as readonly string[]).includes(type);
}

/**
 * Encodes a canvas to a JPEG data URL, stepping down quality until it fits
 * {@link MAX_WORK_IMAGE_DATA_URL_LENGTH}. Returns `null` if even the lowest quality
 * is too big, the canvas is empty, or `toDataURL` is unavailable (e.g. jsdom).
 */
export function canvasToBoundedDataUrl(
  canvas: HTMLCanvasElement,
  maxLength: number = MAX_WORK_IMAGE_DATA_URL_LENGTH,
): string | null {
  if (!canvas.width || !canvas.height) {
    return null;
  }
  try {
    for (const quality of JPEG_QUALITY_LADDER) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url && url.startsWith('data:image/') && url.length <= maxLength) {
        return url;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Scales (w, h) so the longest side is at most {@link MAX_WORK_IMAGE_DIMENSION}. */
function boundedDimensions(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, MAX_WORK_IMAGE_DIMENSION / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Background painted behind exported strokes so JPEG output is never transparent. */
const WORK_IMAGE_BACKGROUND = '#ffffff';

/** Padding (in world units) added around the stroke bounding box on export. */
const WORK_IMAGE_PADDING = 24;

/**
 * A single scratch-paper stroke in WORLD coordinates (independent of pan/zoom).
 * `width` is the world-space line width; the eraser is just a background-colored
 * stroke, so it composes correctly when the bounding box is rasterized.
 */
export type WorkImageStroke = {
  color: string;
  width: number;
  points: { x: number; y: number }[];
};

function paintStroke(ctx: CanvasRenderingContext2D, stroke: WorkImageStroke): void {
  const points = stroke.points;
  if (points.length === 0) {
    return;
  }
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, Math.max(0.5, stroke.width / 2), 0, Math.PI * 2);
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

/**
 * Rasterizes ALL strokes (regardless of the on-screen pan/zoom) into a bounded,
 * compressed JPEG data URL for the vision hint. The output frames the bounding box
 * of every stroke (plus a little padding), downscaled so the longest side is at most
 * {@link MAX_WORK_IMAGE_DIMENSION} and the data URL fits
 * {@link MAX_WORK_IMAGE_DATA_URL_LENGTH}. Returns `null` when there is nothing to
 * draw or when a 2D canvas isn't available (e.g. jsdom). Never throws.
 */
export function strokesToBoundedDataUrl(
  strokes: WorkImageStroke[],
  options: { padding?: number; background?: string } = {},
): string | null {
  const drawable = strokes.filter((stroke) => stroke.points.length > 0);
  if (drawable.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of drawable) {
    const half = stroke.width / 2;
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - half);
      minY = Math.min(minY, point.y - half);
      maxX = Math.max(maxX, point.x + half);
      maxY = Math.max(maxY, point.y + half);
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }

  const padding = options.padding ?? WORK_IMAGE_PADDING;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const worldWidth = maxX - minX;
  const worldHeight = maxY - minY;
  const { width, height } = boundedDimensions(worldWidth, worldHeight);
  if (!width || !height) {
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = options.background ?? WORK_IMAGE_BACKGROUND;
    ctx.fillRect(0, 0, width, height);

    // Map world -> output: translate by the bbox origin, scale to the bounded size.
    const renderScale = width / worldWidth;
    ctx.setTransform(renderScale, 0, 0, renderScale, -minX * renderScale, -minY * renderScale);
    for (const stroke of drawable) {
      paintStroke(ctx, stroke);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    return canvasToBoundedDataUrl(canvas);
  } catch {
    return null;
  }
}

function readFileAsDataUrl(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    } catch {
      resolve(null);
    }
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image'));
    image.src = src;
  });
}

/**
 * Decodes a data URL into an <img>, draws it onto a downscaled canvas, and
 * re-encodes it as a bounded JPEG. Throws/returns `null` if decoding or the 2D
 * context isn't available (the image path then falls back to the raw data URL).
 */
async function rasterizeDataUrl(dataUrl: string): Promise<string | null> {
  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const { width, height } = boundedDimensions(sourceWidth, sourceHeight);
  if (!width || !height) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }
  ctx.drawImage(image, 0, 0, width, height);
  return canvasToBoundedDataUrl(canvas);
}

async function imageFileToWorkImage(file: File): Promise<string | null> {
  const raw = await readFileAsDataUrl(file);
  if (!raw || !raw.startsWith('data:image/')) {
    return null;
  }

  let processed: string | null = null;
  try {
    processed = await rasterizeDataUrl(raw);
  } catch {
    processed = null;
  }
  if (processed) {
    return processed;
  }

  // Couldn't downscale (e.g. no 2D canvas) — use the raw read only if it fits.
  return raw.length <= MAX_WORK_IMAGE_DATA_URL_LENGTH ? raw : null;
}

type PdfjsModule = typeof import('pdfjs-dist');

/* pdfjs needs a worker; configure it from the bundled worker URL (Vite resolves
 * `?url`). Best-effort — if it can't be set, pdfjs falls back to a main-thread
 * worker. */
async function loadPdfjs(): Promise<PdfjsModule | null> {
  try {
    const pdfjs = await import('pdfjs-dist');
    try {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }
    } catch {
      // Leave workerSrc unset; pdfjs will use its main-thread fallback worker.
    }
    return pdfjs;
  } catch {
    return null;
  }
}

/**
 * Renders EVERY page of a PDF (up to {@link MAX_WORK_IMAGES}) to bounded JPEG data
 * URLs — one per page. Returns `[]` on any failure (never throws). Each page is
 * independently downscaled + size-capped via {@link canvasToBoundedDataUrl}.
 */
async function pdfFileToWorkImages(file: File): Promise<string[]> {
  try {
    const pdfjs = await loadPdfjs();
    if (!pdfjs) {
      return [];
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    try {
      const pageCount = Math.min(doc.numPages || 1, MAX_WORK_IMAGES);
      const images: string[] = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const longest = Math.max(base.width, base.height) || MAX_WORK_IMAGE_DIMENSION;
        const scale = Math.min(3, Math.max(0.3, MAX_WORK_IMAGE_DIMENSION / longest));
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          continue;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const image = canvasToBoundedDataUrl(canvas);
        if (image) {
          images.push(image);
        }
      }
      return images;
    } finally {
      // Release worker resources promptly.
      void doc.destroy?.();
    }
  } catch {
    return [];
  }
}

/**
 * Converts an uploaded file into bounded, compressed base64 image data URLs for the
 * vision hint: a single image file → one entry; a PDF → one entry PER PAGE (up to
 * {@link MAX_WORK_IMAGES}). Returns `[]` for unsupported types or any failure —
 * never throws. Every advertised {@link ACCEPTED_WORK_FILE_TYPES} round-trips here.
 */
export async function fileToWorkImages(file: File): Promise<string[]> {
  if (!file || !isAcceptedType(file.type)) {
    return [];
  }
  if (file.type === 'application/pdf') {
    return pdfFileToWorkImages(file);
  }
  const image = await imageFileToWorkImage(file);
  return image ? [image] : [];
}

/**
 * Single-image convenience wrapper over {@link fileToWorkImages} (first page for a
 * PDF). Returns `null` for unsupported types or any failure — never throws.
 */
export async function fileToWorkImage(file: File): Promise<string | null> {
  return (await fileToWorkImages(file))[0] ?? null;
}
