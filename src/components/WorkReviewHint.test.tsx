import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkReviewHint, type WorkReviewTextHint } from './WorkReviewHint';

/*
 * AI, the work-image pipeline, auth, and the full-screen whiteboard are mocked so
 * this affordance's own logic is under test: the "AI Hint" trigger + pop-up, the
 * availability pre-check (sync guards + probe + Retry), multi-file upload (array to
 * the endpoint, exact limits), source precedence, and graceful fallbacks.
 */

const {
  isAiTutorEnabledMock,
  generateWorkHintMock,
  checkAiAvailabilityMock,
  fileToWorkImagesMock,
  useAuthMock,
} = vi.hoisted(() => ({
  isAiTutorEnabledMock: vi.fn(() => true),
  generateWorkHintMock: vi.fn(),
  checkAiAvailabilityMock: vi.fn(),
  fileToWorkImagesMock: vi.fn(),
  useAuthMock: vi.fn(),
}));

vi.mock('../lib/ai', () => ({
  isAiTutorEnabled: isAiTutorEnabledMock,
  generateWorkHint: generateWorkHintMock,
  checkAiAvailability: checkAiAvailabilityMock,
}));

vi.mock('../lib/workImage', () => ({
  fileToWorkImages: fileToWorkImagesMock,
  WORK_FILE_ACCEPT_ATTR: '.png,.jpg,.webp,.pdf',
  WORK_SIZE_LIMIT_TEXT: 'Up to 10 MB per file · max 8 pages',
  MAX_WORK_FILE_BYTES: 10 * 1024 * 1024,
  MAX_WORK_IMAGES: 8,
}));

vi.mock('../auth/AuthContext', () => ({ useAuth: useAuthMock }));

const WHITEBOARD_IMAGE = 'data:image/jpeg;base64,WB';
const UPLOAD_IMAGE = 'data:image/jpeg;base64,UP';

vi.mock('./Whiteboard', () => ({
  Whiteboard: ({
    open,
    onChange,
    onSubmit,
  }: {
    open: boolean;
    onChange?: (dataUrl: string | null) => void;
    onSubmit?: (dataUrl: string | null) => void;
  }) =>
    open ? (
      <div data-testid="whiteboard-overlay">
        <button type="button" onClick={() => onChange?.(WHITEBOARD_IMAGE)}>
          simulate draw
        </button>
        <button type="button" onClick={() => onSubmit?.(WHITEBOARD_IMAGE)}>
          overlay check
        </button>
      </div>
    ) : null,
}));

const baseProps = {
  prompt: 'Differentiate $x^2$.',
  choices: [
    { id: 'a', label: '$2x$' },
    { id: 'b', label: '$x$' },
  ],
  correctChoiceId: 'a',
  profileSummary: 'Accuracy 60%.',
};

function inertTextHint(overrides: Partial<WorkReviewTextHint> = {}): WorkReviewTextHint {
  return { active: false, result: null, error: false, onRequest: vi.fn(), ...overrides };
}

function makeFile(name: string, type = 'image/png', sizeBytes?: number) {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type });
  if (sizeBytes !== undefined) {
    Object.defineProperty(file, 'size', { value: sizeBytes });
  }
  return file;
}

function selectFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Upload work'), { target: { files } });
}

/** Opens the pop-up and waits for the (available) work-review options to appear. */
async function openAvailableModal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'AI Hint' }));
  await screen.findByLabelText('Upload work');
}

beforeEach(() => {
  isAiTutorEnabledMock.mockReturnValue(true);
  checkAiAvailabilityMock.mockResolvedValue({ available: true });
  generateWorkHintMock.mockResolvedValue({ message: 'Nice start — recheck line 2.', onTrack: true });
  fileToWorkImagesMock.mockResolvedValue([UPLOAD_IMAGE]);
  useAuthMock.mockReturnValue({ user: { uid: 'u1' } });
});

afterEach(() => {
  delete (window.navigator as { onLine?: boolean }).onLine;
  vi.clearAllMocks();
});

describe('WorkReviewHint trigger + pop-up', () => {
  it('renders an "AI Hint" button and keeps the options hidden until opened', () => {
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    expect(screen.getByRole('button', { name: 'AI Hint' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();
  });

  it('opens a pop-up dialog and shows the options once the probe reports available', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    await user.click(screen.getByRole('button', { name: 'AI Hint' }));

    expect(await screen.findByRole('dialog', { name: 'AI hint' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Upload work')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scratch paper' })).toBeInTheDocument();
    expect(checkAiAvailabilityMock).toHaveBeenCalledTimes(1);
  });

  it('closes the pop-up from the close button', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    await user.click(screen.getByRole('button', { name: 'Close AI hint' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the EXACT size limit text', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    expect(screen.getByText('Up to 10 MB per file · max 8 pages')).toBeInTheDocument();
  });
});

describe('WorkReviewHint availability pre-check', () => {
  it('shows the disabled reason and NOT the options (no probe) when AI is off', async () => {
    isAiTutorEnabledMock.mockReturnValue(false);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    await user.click(screen.getByRole('button', { name: 'AI Hint' }));

    expect(screen.getByText(/isn’t available right now/i)).toBeInTheDocument();
    expect(screen.getByText(/turned off/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();
    expect(checkAiAvailabilityMock).not.toHaveBeenCalled();
  });

  it('shows the offline reason and never probes when the device is offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    await user.click(screen.getByRole('button', { name: 'AI Hint' }));

    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();
    expect(checkAiAvailabilityMock).not.toHaveBeenCalled();
  });

  it('shows the signed-out reason and never probes when the user is signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    await user.click(screen.getByRole('button', { name: 'AI Hint' }));

    expect(screen.getByText(/sign in/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();
    expect(checkAiAvailabilityMock).not.toHaveBeenCalled();
  });

  it('shows the over-quota reason, then reveals the options after a successful Retry', async () => {
    checkAiAvailabilityMock
      .mockResolvedValueOnce({ available: false, reason: 'over-quota' })
      .mockResolvedValueOnce({ available: true });
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    await user.click(screen.getByRole('button', { name: 'AI Hint' }));

    expect(await screen.findByText(/usage limit/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByLabelText('Upload work')).toBeInTheDocument();
    expect(checkAiAvailabilityMock).toHaveBeenCalledTimes(2);
  });
});

describe('WorkReviewHint multi-file upload', () => {
  it('shows a preview per uploaded file and sends ALL images as an array', async () => {
    fileToWorkImagesMock
      .mockResolvedValueOnce(['data:image/png;base64,P1'])
      .mockResolvedValueOnce(['data:image/png;base64,P2']);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    selectFiles([makeFile('page1.png'), makeFile('page2.png')]);

    expect(await screen.findByText('page1.png')).toBeInTheDocument();
    expect(screen.getByText('page2.png')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);

    await user.click(await screen.findByRole('button', { name: 'Check my work' }));

    expect(generateWorkHintMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workImages: ['data:image/png;base64,P1', 'data:image/png;base64,P2'],
      }),
      expect.any(Function),
    );
  });

  it('turns a multi-page PDF into multiple images (one preview per page)', async () => {
    fileToWorkImagesMock.mockResolvedValueOnce([
      'data:image/jpeg;base64,A',
      'data:image/jpeg;base64,B',
      'data:image/jpeg;base64,C',
    ]);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    selectFiles([makeFile('work.pdf', 'application/pdf')]);

    expect(await screen.findAllByRole('button', { name: 'Remove' })).toHaveLength(3);

    await user.click(screen.getByRole('button', { name: 'Check my work' }));

    expect(generateWorkHintMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workImages: ['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B', 'data:image/jpeg;base64,C'],
      }),
      expect.any(Function),
    );
  });

  it('rejects an over-size file with the exact limit and never decodes it', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    selectFiles([makeFile('huge.png', 'image/png', 11 * 1024 * 1024)]);

    expect(await screen.findByText(/over the 10 MB per-file limit/i)).toBeInTheDocument();
    expect(fileToWorkImagesMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('clears all uploaded pages', async () => {
    fileToWorkImagesMock.mockResolvedValue(['data:image/png;base64,P']);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    selectFiles([makeFile('page1.png')]);
    await screen.findByText('page1.png');

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByText('page1.png')).not.toBeInTheDocument();
  });
});

describe('WorkReviewHint hint flow + precedence', () => {
  it('sends the uploaded image and shows the feedback', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    selectFiles([makeFile('work.png')]);
    await user.click(await screen.findByRole('button', { name: 'Check my work' }));

    expect(generateWorkHintMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: baseProps.prompt,
        choices: ['$2x$', '$x$'],
        correctLabel: '$2x$',
        workImages: [UPLOAD_IMAGE],
      }),
      expect.any(Function),
    );
    expect(await screen.findByText('Nice start — recheck line 2.')).toBeInTheDocument();
  });

  it('prefers the most-recent source (whiteboard) over an earlier upload', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    selectFiles([makeFile('work.png')]);
    await screen.findByRole('button', { name: 'Check my work' });

    await user.click(screen.getByRole('button', { name: 'Scratch paper' }));
    await user.click(screen.getByRole('button', { name: 'simulate draw' }));
    await user.click(screen.getByRole('button', { name: 'Check my work' }));

    expect(generateWorkHintMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ workImages: [WHITEBOARD_IMAGE] }),
      expect.any(Function),
    );
  });

  it('checks the drawing directly from the overlay (single-image array)', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    await user.click(screen.getByRole('button', { name: 'Scratch paper' }));
    await user.click(screen.getByRole('button', { name: 'overlay check' }));

    expect(generateWorkHintMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ workImages: [WHITEBOARD_IMAGE] }),
      expect.any(Function),
    );
    expect(screen.queryByTestId('whiteboard-overlay')).not.toBeInTheDocument();
    expect(await screen.findByText('Nice start — recheck line 2.')).toBeInTheDocument();
  });

  it('falls back to a gentle note when the work hint returns null', async () => {
    generateWorkHintMock.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    await openAvailableModal(user);

    selectFiles([makeFile('work.png')]);
    await user.click(await screen.findByRole('button', { name: 'Check my work' }));

    expect(await screen.findByText(/couldn’t review your work right now/i)).toBeInTheDocument();
  });
});

describe('WorkReviewHint text-hint fallback (no work attached)', () => {
  it('requests the existing text hint and shows its fallback when no work is attached', async () => {
    const onRequest = vi.fn();
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint({ onRequest })} />);
    await openAvailableModal(user);

    await user.click(screen.getByRole('button', { name: 'Get a hint' }));

    expect(onRequest).toHaveBeenCalledTimes(1);
    expect(generateWorkHintMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Add a photo of your work/i)).toBeInTheDocument();
  });

  it('renders the prefetched text hint message when AI is active', async () => {
    const user = userEvent.setup();
    render(
      <WorkReviewHint
        {...baseProps}
        textHint={inertTextHint({ active: true, result: { message: 'Think about the power rule.' } })}
      />,
    );
    await openAvailableModal(user);

    await user.click(screen.getByRole('button', { name: 'Get a hint' }));

    await waitFor(() =>
      expect(screen.getByText('Think about the power rule.')).toBeInTheDocument(),
    );
  });

  it('disables the action when there is neither work nor a text hint (challenge cards)', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    expect(screen.getByRole('button', { name: 'Get a hint' })).toBeDisabled();
  });
});
