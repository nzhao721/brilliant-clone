import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkReviewHint } from './WorkReviewHint';

/*
 * AI, the work-image pipeline, auth, and the full-screen whiteboard are mocked so
 * this affordance's own logic is under test: the "AI Hint" trigger + pop-up, the
 * availability pre-check (sync guards + probe + Retry), multi-file upload (array to
 * the endpoint, exact limits), source precedence, and graceful fallbacks.
 *
 * WORK-GATED HINT: the hint ALWAYS runs the VISION call — even with no work
 * attached (a blank surface is sent) — and the model decides whether to grant a
 * hint. The "make a substantial start" message is the MODEL's, never fabricated on
 * the client. These tests assert the call always fires and the model's message
 * (hint OR gated nudge) is what renders.
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

const BLANK_WORK_IMAGE = 'data:image/png;base64,BLANK';

vi.mock('../lib/ai', () => ({
  isAiTutorEnabled: isAiTutorEnabledMock,
  generateWorkHint: generateWorkHintMock,
  checkAiAvailability: checkAiAvailabilityMock,
}));

vi.mock('../lib/workImage', () => ({
  fileToWorkImages: fileToWorkImagesMock,
  // The blank "no work yet" surface so the vision call always has an image.
  createBlankWorkImage: () => BLANK_WORK_IMAGE,
  WORK_FILE_ACCEPT_ATTR: '.png,.jpg,.webp,.pdf',
  WORK_SIZE_LIMIT_TEXT: 'Up to 10 MB per file · max 8 pages',
  MAX_WORK_FILE_BYTES: 10 * 1024 * 1024,
  MAX_WORK_IMAGES: 8,
}));

vi.mock('../auth/AuthContext', () => ({ useAuth: useAuthMock }));

const WHITEBOARD_IMAGE = 'data:image/jpeg;base64,WB';
const UPLOAD_IMAGE = 'data:image/jpeg;base64,UP';

vi.mock('./Whiteboard', () => ({
  // The real overlay stays mounted while `open` (the parent keeps it open on
  // submit), and renders whatever `hint` node the parent passes pinned to the
  // bottom — echoed here in a slot so tests can assert it. `onClose` is exposed via
  // a button so tests can drive the close-overlay navigation.
  Whiteboard: ({
    open,
    onClose,
    onChange,
    onSubmit,
    hint,
  }: {
    open: boolean;
    onClose?: () => void;
    onChange?: (dataUrl: string | null) => void;
    onSubmit?: (dataUrl: string | null) => void;
    hint?: ReactNode;
  }) =>
    open ? (
      <div data-testid="whiteboard-overlay">
        <button type="button" onClick={() => onChange?.(WHITEBOARD_IMAGE)}>
          simulate draw
        </button>
        <button type="button" onClick={() => onSubmit?.(WHITEBOARD_IMAGE)}>
          overlay check
        </button>
        <button type="button" onClick={() => onClose?.()}>
          close overlay
        </button>
        <div data-testid="whiteboard-hint-slot">{hint}</div>
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
  generateWorkHintMock.mockResolvedValue({
    message: 'Nice start — recheck line 2.',
    hasSubstantialProgress: true,
    onTrack: true,
  });
  fileToWorkImagesMock.mockResolvedValue([UPLOAD_IMAGE]);
  useAuthMock.mockReturnValue({ user: { uid: 'u1' } });
});

afterEach(() => {
  delete (window.navigator as { onLine?: boolean }).onLine;
  vi.clearAllMocks();
});

describe('WorkReviewHint trigger + pop-up', () => {
  it('renders an "AI Hint" button and keeps the options hidden until opened', () => {
    render(<WorkReviewHint {...baseProps} />);
    expect(screen.getByRole('button', { name: 'AI Hint' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();
  });

  it('opens a pop-up dialog and shows the options once the probe reports available', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'AI Hint' }));

    expect(await screen.findByRole('dialog', { name: 'AI hint' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Upload work')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scratch paper' })).toBeInTheDocument();
    expect(checkAiAvailabilityMock).toHaveBeenCalledTimes(1);
  });

  it('closes the pop-up from the close button', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    await user.click(screen.getByRole('button', { name: 'Close AI hint' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the EXACT size limit text', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    expect(screen.getByText('Up to 10 MB per file · max 8 pages')).toBeInTheDocument();
  });
});

describe('WorkReviewHint availability pre-check', () => {
  it('shows the disabled reason and NOT the options (no probe) when AI is off', async () => {
    isAiTutorEnabledMock.mockReturnValue(false);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'AI Hint' }));

    expect(screen.getByText(/isn’t available right now/i)).toBeInTheDocument();
    expect(screen.getByText(/turned off/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();
    expect(checkAiAvailabilityMock).not.toHaveBeenCalled();
  });

  it('shows the offline reason and never probes when the device is offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);

    await user.click(screen.getByRole('button', { name: 'AI Hint' }));

    expect(screen.getByText(/offline/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Upload work')).not.toBeInTheDocument();
    expect(checkAiAvailabilityMock).not.toHaveBeenCalled();
  });

  it('shows the signed-out reason and never probes when the user is signed out', async () => {
    useAuthMock.mockReturnValue({ user: null });
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);

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
    render(<WorkReviewHint {...baseProps} />);

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
    render(<WorkReviewHint {...baseProps} />);
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
    render(<WorkReviewHint {...baseProps} />);
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
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    selectFiles([makeFile('huge.png', 'image/png', 11 * 1024 * 1024)]);

    expect(await screen.findByText(/over the 10 MB per-file limit/i)).toBeInTheDocument();
    expect(fileToWorkImagesMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('clears all uploaded pages', async () => {
    fileToWorkImagesMock.mockResolvedValue(['data:image/png;base64,P']);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    selectFiles([makeFile('page1.png')]);
    await screen.findByText('page1.png');

    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.queryByText('page1.png')).not.toBeInTheDocument();
  });

  // In real browsers `input.files` is a LIVE FileList that is EMPTIED when the
  // input value is reset (the onChange resets it so the same file can be
  // re-picked). jsdom doesn't model the live list, so we reproduce it here: a
  // `files` getter backed by an array the `value` setter clears. The handler must
  // snapshot the files BEFORE the reset.
  it('still processes the picked file when resetting the input empties the live FileList', async () => {
    fileToWorkImagesMock.mockResolvedValue(['data:image/png;base64,LIVE']);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    const input = screen.getByLabelText('Upload work') as HTMLInputElement;
    let backing: File[] = [makeFile('live.png')];
    const liveList = {
      get length() {
        return backing.length;
      },
      item: (index: number) => backing[index] ?? null,
      [Symbol.iterator]: function* () {
        yield* backing;
      },
    };
    Object.defineProperty(input, 'files', { configurable: true, get: () => liveList });
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => '',
      set: (next: string) => {
        if (next === '') {
          backing = [];
        }
      },
    });

    fireEvent.change(input);

    expect(await screen.findByText('live.png')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Check my work' }));
    expect(generateWorkHintMock).toHaveBeenCalledWith(
      expect.objectContaining({ workImages: ['data:image/png;base64,LIVE'] }),
      expect.any(Function),
    );
  });
});

describe('WorkReviewHint hint flow + precedence', () => {
  it('sends the uploaded image and shows the feedback', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
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
    render(<WorkReviewHint {...baseProps} />);
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

  it('keeps the scratch paper OPEN after checking and pins the hint to the overlay bottom', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    await user.click(screen.getByRole('button', { name: 'Scratch paper' }));
    await user.click(screen.getByRole('button', { name: 'overlay check' }));

    expect(generateWorkHintMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ workImages: [WHITEBOARD_IMAGE] }),
      expect.any(Function),
    );

    // The overlay must STAY open after checking work (was: closed on submit)...
    const overlay = screen.getByTestId('whiteboard-overlay');
    expect(overlay).toBeInTheDocument();
    // ...and the hint is passed DOWN and rendered in the overlay's bottom slot.
    const slot = within(overlay).getByTestId('whiteboard-hint-slot');
    expect(await within(slot).findByText('Nice start — recheck line 2.')).toBeInTheDocument();
  });

  it('falls back to a gentle note when the work hint returns null', async () => {
    generateWorkHintMock.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    selectFiles([makeFile('work.png')]);
    await user.click(await screen.findByRole('button', { name: 'Check my work' }));

    expect(await screen.findByText(/couldn’t review your work right now/i)).toBeInTheDocument();
  });
});

describe('WorkReviewHint resets the hint when navigating between views', () => {
  // A hint produced in the upload modal must NOT carry into the scratch paper.
  it('clears the modal hint when opening the scratch paper', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    // Produce a hint in the modal from an upload.
    selectFiles([makeFile('work.png')]);
    await user.click(await screen.findByRole('button', { name: 'Check my work' }));
    expect(await screen.findByText('Nice start — recheck line 2.')).toBeInTheDocument();

    // Navigate to the scratch paper.
    await user.click(screen.getByRole('button', { name: 'Scratch paper' }));

    // The overlay opened, but the hint did NOT carry into its bottom slot...
    const overlay = screen.getByTestId('whiteboard-overlay');
    const slot = within(overlay).getByTestId('whiteboard-hint-slot');
    expect(within(slot).queryByText('Nice start — recheck line 2.')).not.toBeInTheDocument();
    // ...and it's gone everywhere (not lingering in the still-mounted modal either).
    expect(screen.queryByText('Nice start — recheck line 2.')).not.toBeInTheDocument();

    // The uploaded page (the user's work) is preserved across the transition.
    expect(screen.getByText('work.png')).toBeInTheDocument();
  });

  // A hint produced on the scratch paper must NOT carry back into the modal.
  it('clears the scratch-paper hint when closing the overlay back to the modal', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    // Open the scratch paper and check work there (overlay stays open, hint pins).
    await user.click(screen.getByRole('button', { name: 'Scratch paper' }));
    await user.click(screen.getByRole('button', { name: 'overlay check' }));

    const slot = within(screen.getByTestId('whiteboard-overlay')).getByTestId(
      'whiteboard-hint-slot',
    );
    expect(await within(slot).findByText('Nice start — recheck line 2.')).toBeInTheDocument();

    // Close the overlay back to the modal.
    await user.click(screen.getByRole('button', { name: 'close overlay' }));

    expect(screen.queryByTestId('whiteboard-overlay')).not.toBeInTheDocument();
    // The hint produced on the scratch paper does not reappear in the modal.
    expect(screen.queryByText('Nice start — recheck line 2.')).not.toBeInTheDocument();
  });

  // A request still in flight when the user navigates must not pop in on the other
  // view: navigating cancels it (request-id bump) so its late result is discarded.
  it('discards an in-flight modal request when navigating to the scratch paper', async () => {
    let resolveHint: (value: { message: string; onTrack: boolean }) => void = () => {};
    generateWorkHintMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveHint = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    selectFiles([makeFile('work.png')]);
    await user.click(await screen.findByRole('button', { name: 'Check my work' }));

    // Navigate away while the request is still pending, THEN let it resolve.
    await user.click(screen.getByRole('button', { name: 'Scratch paper' }));
    resolveHint({ message: 'Late result from the modal.', onTrack: true });

    // The superseded result must never appear (modal or scratch-paper slot).
    await waitFor(() => {
      expect(screen.queryByText('Late result from the modal.')).not.toBeInTheDocument();
    });
  });
});

describe('WorkReviewHint is always model-generated + prompt-gated', () => {
  it('runs the vision hint with a BLANK surface when no work is attached (no client short-circuit)', async () => {
    generateWorkHintMock.mockResolvedValue({
      message: 'Make a substantial start on the problem first, then I can give you a hint.',
      hasSubstantialProgress: false,
    });
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    // No upload, no drawing — the button is still enabled and runs the vision call.
    const button = screen.getByRole('button', { name: 'Get a hint' });
    expect(button).toBeEnabled();
    await user.click(button);

    // The blank surface is sent so the MODEL judges the (empty) work.
    expect(generateWorkHintMock).toHaveBeenCalledWith(
      expect.objectContaining({ workImages: [BLANK_WORK_IMAGE] }),
      expect.any(Function),
    );
    // The "make a start" message is the MODEL's, rendered as-is.
    expect(
      await screen.findByText(/Make a substantial start on the problem first/i),
    ).toBeInTheDocument();
  });

  it('renders the model’s granted hint when the work shows substantial progress', async () => {
    generateWorkHintMock.mockResolvedValue({
      message: 'Your $u$-substitution is set up correctly — now differentiate $u$.',
      hasSubstantialProgress: true,
      onTrack: true,
    });
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    selectFiles([makeFile('work.png')]);
    await user.click(await screen.findByRole('button', { name: 'Check my work' }));

    expect(
      // `$u$` renders as KaTeX, splitting the text node, so match the contiguous prose around it.
      await screen.findByText(/-substitution is set up correctly/i),
    ).toBeInTheDocument();
  });

  it('runs the vision hint on a challenge card (no work) instead of disabling the action', async () => {
    // Challenge cards pass no extra props; the hint still always works via vision.
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} />);
    await openAvailableModal(user);

    const button = screen.getByRole('button', { name: 'Get a hint' });
    expect(button).toBeEnabled();
    await user.click(button);

    expect(generateWorkHintMock).toHaveBeenCalledWith(
      expect.objectContaining({ workImages: [BLANK_WORK_IMAGE] }),
      expect.any(Function),
    );
    expect(await screen.findByText('Nice start — recheck line 2.')).toBeInTheDocument();
  });
});
