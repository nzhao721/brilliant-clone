import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TutorResponse } from '../lib/ai';
import { AiTutorFeedback, AiTutorMessage } from './AiTutorMessage';

/* Exercise the presentational component directly with explicit props (no AI service). */
const sampleResult: TutorResponse = {
  message: 'Nice work spotting that the rate of change stays constant here.',
};

describe('AiTutorMessage', () => {
  it('marks an AI-generated message with an accessible AI badge', () => {
    render(<AiTutorMessage loading={false} result={sampleResult} tone="correct" />);

    /* The sparkle is exposed only via its labelled wrapper, so the cue is announced. */
    expect(screen.getByRole('img', { name: 'AI-generated' })).toBeInTheDocument();
    expect(screen.getByText(sampleResult.message)).toBeInTheDocument();
  });

  it('keeps showing the AI badge while the model is still thinking', () => {
    render(<AiTutorMessage loading result={null} tone="hint" />);

    // The loading state is still the AI path, so the badge belongs here too.
    expect(screen.getByRole('img', { name: 'AI-generated' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders LaTeX in the AI message robustly (math as KaTeX, prose stays prose)', () => {
    /* The AI message uses the same MathText scanner, so a real inline span plus an
       escaped literal dollar must render math without flipping prose into math. */
    const result: TutorResponse = {
      message: "Nice — the slope is $f'(x) = 2x$, and it only costs \\$5 to retry.",
    };
    const { container } = render(
      <AiTutorMessage loading={false} result={result} tone="correct" />,
    );

    // Exactly one real math span; the "\$5" is a literal currency dollar.
    expect(container.querySelectorAll('.math-inline')).toHaveLength(1);
    expect(container.querySelector('.katex')).toBeInTheDocument();
    expect(container.querySelector('.katex-error')).not.toBeInTheDocument();

    // The escaped dollar survives as text and the prose is not swallowed as math.
    expect(container).toHaveTextContent('it only costs $5 to retry');
    const inline = container.querySelector('.math-inline');
    expect(inline?.textContent ?? '').not.toContain('costs');
    expect(inline?.textContent ?? '').not.toContain('retry');

    // Still badged as AI-generated.
    expect(screen.getByRole('img', { name: 'AI-generated' })).toBeInTheDocument();
  });

  it('renders nothing — and no AI badge — for the static-only fallback', () => {
    const { container } = render(
      <AiTutorMessage loading={false} result={null} tone="incorrect" />,
    );

    /* No message and not loading => render nothing, leaving the static baseline. */
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('img', { name: 'AI-generated' })).not.toBeInTheDocument();
  });
});

describe('AiTutorFeedback', () => {
  const fallback = (
    <div role="alert" className="error-message">
      Static fallback text
    </div>
  );

  it('shows the static fallback immediately (no spinner) when AI is inactive', () => {
    render(
      <AiTutorFeedback active={false} result={null} error={false} tone="incorrect" fallback={fallback} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Static fallback text');
    expect(document.querySelector('.ai-tutor-note')).toBeNull();
    expect(screen.queryByRole('img', { name: 'AI-generated' })).not.toBeInTheDocument();
  });

  it('shows ONLY the AI loader (static hidden) while the request is pending', () => {
    render(
      <AiTutorFeedback active result={null} error={false} tone="incorrect" fallback={fallback} />,
    );

    /* The pending case keys off `!result`, so the loader shows without a `loading` flag (no static flash). */
    expect(screen.getByLabelText('The AI tutor is thinking')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the AI coach message and hides the static fallback on success', () => {
    render(
      <AiTutorFeedback active result={sampleResult} error={false} tone="correct" fallback={fallback} />,
    );

    expect(screen.getByText(sampleResult.message)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'AI-generated' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('falls back to the static block when the request resolves with an error/timeout', () => {
    render(
      <AiTutorFeedback active result={null} error tone="incorrect" fallback={fallback} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Static fallback text');
    expect(document.querySelector('.ai-tutor-note')).toBeNull();
  });
});

/* The diagnostic note is gated on DEV (true in tests) and a real failed attempt
   (active + errorDetail); these lock in that gating. */
describe('AiTutorFeedback dev failure diagnostics', () => {
  const fallback = (
    <div role="alert" className="error-message">
      Static fallback text
    </div>
  );

  it('shows a dev-only note with the reason when an AI attempt actually failed', () => {
    render(
      <AiTutorFeedback
        active
        result={null}
        error
        tone="incorrect"
        fallback={fallback}
        errorDetail="HTTP 403 — PERMISSION_DENIED"
      />,
    );

    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('AI coach unavailable (testing):');
    expect(note).toHaveTextContent('HTTP 403 — PERMISSION_DENIED');
    // The static fallback is still rendered alongside the diagnostic.
    expect(screen.getByRole('alert')).toHaveTextContent('Static fallback text');
  });

  it('renders no note when the fallback is not due to a captured failure', () => {
    render(
      <AiTutorFeedback active result={null} error tone="incorrect" fallback={fallback} />,
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('renders no note for the intentional disabled/offline path even with a detail', () => {
    render(
      <AiTutorFeedback
        active={false}
        result={null}
        error={false}
        tone="incorrect"
        fallback={fallback}
        errorDetail="Device is offline"
      />,
    );

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Static fallback text');
  });
});
