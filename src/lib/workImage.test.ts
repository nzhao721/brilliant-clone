import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCEPTED_WORK_FILE_TYPES,
  canvasToBoundedDataUrl,
  fileToWorkImage,
  fileToWorkImages,
  MAX_WORK_FILE_BYTES,
  MAX_WORK_IMAGE_DATA_URL_LENGTH,
  MAX_WORK_IMAGES,
  WORK_FILE_ACCEPT_ATTR,
  WORK_SIZE_LIMIT_TEXT,
} from './workImage';

/*
 * Exercises the upload → bounded base64 image pipeline. jsdom can't decode images
 * or rasterize a real 2D canvas, so (like the repo's game tests) we stub
 * `getContext`/`toDataURL` and the `Image` decoder, and mock pdfjs-dist for the PDF
 * path — verifying the data-flow + bounds, never real pixels.
 */

const STUB_JPEG = 'data:image/jpeg;base64,QUFB';

/* A no-op 2D context (drawImage/fillRect/etc. all do nothing). */
function stubContext() {
  return new Proxy(
    {},
    {
      get: () => () => {},
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

/* Minimal Image stand-in whose `src` setter resolves `onload` on the microtask queue. */
class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1200;
  naturalHeight = 900;
  width = 1200;
  height = 900;
  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

// pdfjs-dist mocked so the PDF path runs without the real (huge) library/worker.
const getDocumentMock = vi.fn();
vi.mock('pdfjs-dist', () => ({
  // Non-empty workerSrc so the helper SKIPS the `?url` worker import.
  GlobalWorkerOptions: { workerSrc: 'mock-worker' },
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
}));

function mockPdfDocument(numPages = 1) {
  const render = vi.fn(() => ({ promise: Promise.resolve() }));
  const getViewport = vi.fn(({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 800 * scale,
  }));
  const page = { getViewport, render };
  const doc = { numPages, getPage: vi.fn(() => Promise.resolve(page)), destroy: vi.fn() };
  getDocumentMock.mockReturnValue({ promise: Promise.resolve(doc) });
  return { doc, page, render, getViewport };
}

let getContextSpy: ReturnType<typeof vi.spyOn>;
let toDataUrlSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(stubContext());
  toDataUrlSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockReturnValue(STUB_JPEG);
  vi.stubGlobal('Image', MockImage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  getDocumentMock.mockReset();
});

describe('accept metadata', () => {
  it('accepts images and PDF, and the accept attribute lists them', () => {
    expect(ACCEPTED_WORK_FILE_TYPES).toContain('image/png');
    expect(ACCEPTED_WORK_FILE_TYPES).toContain('application/pdf');
    expect(WORK_FILE_ACCEPT_ATTR).toContain('image/png');
    expect(WORK_FILE_ACCEPT_ATTR).toContain('application/pdf');
  });
});

describe('canvasToBoundedDataUrl', () => {
  it('encodes a JPEG data URL within the size cap', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    expect(canvasToBoundedDataUrl(canvas)).toBe(STUB_JPEG);
  });

  it('returns null for an empty (zero-size) canvas', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 0;
    canvas.height = 0;
    expect(canvasToBoundedDataUrl(canvas)).toBeNull();
    expect(toDataUrlSpy).not.toHaveBeenCalled();
  });

  it('returns null when every quality still exceeds the size cap', () => {
    toDataUrlSpy.mockReturnValue(
      `data:image/jpeg;base64,${'A'.repeat(MAX_WORK_IMAGE_DATA_URL_LENGTH + 10)}`,
    );
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    expect(canvasToBoundedDataUrl(canvas)).toBeNull();
  });
});

describe('fileToWorkImage', () => {
  it('converts an image file into a bounded, compressed JPEG data URL', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'work.png', { type: 'image/png' });

    const result = await fileToWorkImage(file);

    expect(result).toBe(STUB_JPEG);
  });

  it('returns null for an unsupported file type', async () => {
    const file = new File(['hello'], 'notes.txt', { type: 'text/plain' });

    expect(await fileToWorkImage(file)).toBeNull();
  });

  it('falls back to the raw read when the 2D canvas context is unavailable', async () => {
    getContextSpy.mockReturnValue(null);
    const file = new File([new Uint8Array([1, 2, 3])], 'work.png', { type: 'image/png' });

    const result = await fileToWorkImage(file);

    // No rasterization possible → raw FileReader data URL (small, within cap).
    expect(result).toMatch(/^data:image\/png/);
  });

  it('renders the first page of a PDF to a bounded JPEG data URL (smoke)', async () => {
    const mocks = mockPdfDocument();
    const file = new File([new Uint8Array([5, 6, 7, 8])], 'work.pdf', {
      type: 'application/pdf',
    });

    const result = await fileToWorkImage(file);

    expect(result).toBe(STUB_JPEG);
    expect(getDocumentMock).toHaveBeenCalledTimes(1);
    expect(mocks.doc.getPage).toHaveBeenCalledWith(1);
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it('returns null (never throws) when PDF parsing fails', async () => {
    getDocumentMock.mockReturnValue({ promise: Promise.reject(new Error('bad pdf')) });
    const file = new File([new Uint8Array([0])], 'broken.pdf', { type: 'application/pdf' });

    expect(await fileToWorkImage(file)).toBeNull();
  });
});

describe('fileToWorkImages (multiple pages/files)', () => {
  it('returns a single bounded image for an image file', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'work.png', { type: 'image/png' });

    const result = await fileToWorkImages(file);

    expect(result).toEqual([STUB_JPEG]);
  });

  it('renders EVERY page of a multi-page PDF to its own bounded image', async () => {
    const mocks = mockPdfDocument(3);
    const file = new File([new Uint8Array([5, 6, 7, 8])], 'work.pdf', {
      type: 'application/pdf',
    });

    const result = await fileToWorkImages(file);

    expect(result).toEqual([STUB_JPEG, STUB_JPEG, STUB_JPEG]);
    expect(mocks.doc.getPage).toHaveBeenCalledWith(1);
    expect(mocks.doc.getPage).toHaveBeenCalledWith(2);
    expect(mocks.doc.getPage).toHaveBeenCalledWith(3);
    expect(mocks.render).toHaveBeenCalledTimes(3);
  });

  it('caps a very long PDF at MAX_WORK_IMAGES pages', async () => {
    const mocks = mockPdfDocument(50);
    const file = new File([new Uint8Array([9])], 'long.pdf', { type: 'application/pdf' });

    const result = await fileToWorkImages(file);

    expect(result).toHaveLength(MAX_WORK_IMAGES);
    expect(mocks.render).toHaveBeenCalledTimes(MAX_WORK_IMAGES);
  });

  it('returns an empty array for an unsupported file type', async () => {
    const file = new File(['hi'], 'notes.txt', { type: 'text/plain' });

    expect(await fileToWorkImages(file)).toEqual([]);
  });
});

describe('work size/page limits', () => {
  it('enforces a 10 MB per-file cap and an 8-page cap', () => {
    expect(MAX_WORK_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_WORK_IMAGES).toBe(8);
  });

  it('exposes EXACT limit copy that matches the enforced caps', () => {
    expect(WORK_SIZE_LIMIT_TEXT).toBe('Up to 10 MB per file · max 8 pages');
  });

  it('only advertises file types it can actually decode', () => {
    expect([...ACCEPTED_WORK_FILE_TYPES]).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
    ]);
  });
});
