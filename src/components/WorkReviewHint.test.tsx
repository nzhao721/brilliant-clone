import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkReviewHint, type WorkReviewTextHint } from './WorkReviewHint';

/*
 * AI, work-image pipeline, and whiteboard are mocked to test this affordance's own
 * logic: AI-flag gating, the work-hint call, source precedence, and fallbacks.
 */

const { isAiTutorEnabledMock, generateWorkHintMock, fileToWorkImageMock } = vi.hoisted(() => ({
  isAiTutorEnabledMock: vi.fn(() => true),
  generateWorkHintMock: vi.fn(),
  fileToWorkImageMock: vi.fn(),
}));

vi.mock('../lib/ai', () => ({
  isAiTutorEnabled: isAiTutorEnabledMock,
  generateWorkHint: generateWorkHintMock,
}));

vi.mock('../lib/workImage', () => ({
  fileToWorkImage: fileToWorkImageMock,
  WORK_FILE_ACCEPT_ATTR: '.png,.jpg,.pdf',
}));

vi.mock('./Whiteboard', () => ({
  Whiteboard: ({ onChange }: { onChange?: (dataUrl: string | null) => void }) => (
    <button type="button" onClick={() => onChange?.('data:image/jpeg;base64,WB')}>
      simulate draw
    </button>
  ),
}));

const UPLOAD_IMAGE = 'data:image/jpeg;base64,UP';

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

function uploadFile() {
  const input = screen.getByLabelText('Upload work');
  fireEvent.change(input, {
    target: { files: [new File([new Uint8Array([1, 2, 3])], 'work.png', { type: 'image/png' })] },
  });
}

beforeEach(() => {
  isAiTutorEnabledMock.mockReturnValue(true);
  generateWorkHintMock.mockResolvedValue({ message: 'Nice start — recheck line 2.', onTrack: true });
  fileToWorkImageMock.mockResolvedValue(UPLOAD_IMAGE);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('WorkReviewHint gating', () => {
  it('renders nothing when the AI tutor is disabled', () => {
    isAiTutorEnabledMock.mockReturnValue(false);
    const { container } = render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the upload + scratch-paper affordances when AI is enabled', () => {
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);
    expect(screen.getByLabelText('Upload work')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scratch paper' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get a hint' })).toBeInTheDocument();
  });
});

describe('WorkReviewHint work-image hint flow', () => {
  it('calls generateWorkHint with the uploaded image and shows the feedback', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    uploadFile();

    const checkButton = await screen.findByRole('button', { name: 'Check my work' });
    await user.click(checkButton);

    expect(generateWorkHintMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: baseProps.prompt,
        choices: ['$2x$', '$x$'],
        correctLabel: '$2x$',
        workImage: UPLOAD_IMAGE,
      }),
      expect.any(Function),
    );
    expect(await screen.findByText('Nice start — recheck line 2.')).toBeInTheDocument();
  });

  it('prefers the most-recently-provided source (whiteboard over an earlier upload)', async () => {
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    uploadFile();
    await screen.findByRole('button', { name: 'Check my work' });

    await user.click(screen.getByRole('button', { name: 'Scratch paper' }));
    await user.click(screen.getByRole('button', { name: 'simulate draw' }));
    await user.click(screen.getByRole('button', { name: 'Check my work' }));

    expect(generateWorkHintMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ workImage: 'data:image/jpeg;base64,WB' }),
      expect.any(Function),
    );
  });

  it('falls back to a gentle note when the work hint returns null', async () => {
    generateWorkHintMock.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    uploadFile();
    await user.click(await screen.findByRole('button', { name: 'Check my work' }));

    expect(await screen.findByText(/couldn’t review your work right now/i)).toBeInTheDocument();
  });

  it('surfaces an upload error and never calls the AI when the file is unreadable', async () => {
    fileToWorkImageMock.mockResolvedValue(null);
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint()} />);

    uploadFile();

    expect(await screen.findByText(/couldn’t read that file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get a hint' })).toBeInTheDocument();
    expect(generateWorkHintMock).not.toHaveBeenCalled();
  });
});

describe('WorkReviewHint text-hint fallback (no work attached)', () => {
  it('requests the existing text hint and shows its fallback when no work is attached', async () => {
    const onRequest = vi.fn();
    const user = userEvent.setup();
    render(<WorkReviewHint {...baseProps} textHint={inertTextHint({ onRequest })} />);

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

    await user.click(screen.getByRole('button', { name: 'Get a hint' }));

    await waitFor(() =>
      expect(screen.getByText('Think about the power rule.')).toBeInTheDocument(),
    );
  });

  it('disables the hint button when there is neither work nor a text hint (challenge cards)', () => {
    render(<WorkReviewHint {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Get a hint' })).toBeDisabled();
  });
});
