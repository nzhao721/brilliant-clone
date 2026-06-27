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

/** JPEG qualities tried in order until the encoded data URL fits the size cap. */
const JPEG_QUALITY_LADDER = [0.85, 0.72, 0.6, 0.45] as const;

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

/** Renders the FIRST page of a PDF to a bounded JPEG data URL (simple + bounded). */
async function pdfFileToWorkImage(file: File): Promise<string | null> {
  try {
    const pdfjs = await loadPdfjs();
    if (!pdfjs) {
      return null;
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const longest = Math.max(base.width, base.height) || MAX_WORK_IMAGE_DIMENSION;
      const scale = Math.min(3, Math.max(0.3, MAX_WORK_IMAGE_DIMENSION / longest));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      return canvasToBoundedDataUrl(canvas);
    } finally {
      // Release worker resources promptly.
      void doc.destroy?.();
    }
  } catch {
    return null;
  }
}

/**
 * Converts an uploaded file (PNG/JPEG/WebP image or a PDF) into a bounded,
 * compressed base64 image data URL for the vision hint. Returns `null` for
 * unsupported types or any failure — never throws.
 */
export async function fileToWorkImage(file: File): Promise<string | null> {
  if (!file || !isAcceptedType(file.type)) {
    return null;
  }
  if (file.type === 'application/pdf') {
    return pdfFileToWorkImage(file);
  }
  return imageFileToWorkImage(file);
}
