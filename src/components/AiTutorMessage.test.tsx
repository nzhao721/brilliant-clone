import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TutorResponse } from '../lib/ai';
import { AiTutorFeedback, AiTutorMessage } from './AiTutorMessage';

// These tests exercise the presentational component directly with explicit props,
// so they never touch the AI service (which stays disabled in the test runner).
// That keeps the AI-vs-static distinction under test without any network access.
const sampleResult: TutorResponse = {
  message: 'Nice work spotting that the rate of change stays constant here.',
};

describe('AiTutorMessage', () => {
  it('marks an AI-generated message with an accessible AI badge', () => {
    render(<AiTutorMessage loading={false} result={sampleResult} tone="correct" />);

    // The decorative sparkle is exposed only through its labelled wrapper, so the
    // "AI-generated" cue is announced to assistive tech, not merely shown.
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
    // The AI message goes through the SAME MathText scanner as lessons, so a
    // realistic reply that mixes a real inline span with an escaped literal
    // dollar must render the math as KaTeX without flipping the prose into math.
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

    // No AI message and not loading => the component bows out entirely, leaving the
    // static explanation/hint as the unbadged baseline.
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

    // The pending case keys off `!result`, so the loader shows even though no
    // async `loading` flag is passed — this is what prevents the static flash.
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

// The diagnostic note is gated on `import.meta.env.DEV` (true in the test
// runner) AND an actual failed attempt (active + errorDetail). These tests lock
// in the failure-only/active-only gating; the production gate is `DEV` itself.
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
