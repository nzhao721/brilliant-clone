import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAiTutorEnabled, prefetchTutorResponses, type PrefetchTutorResponse } from '../lib/ai';
import type { LessonProgress } from './lessonProgress';
import { useAiTutor, type UseAiTutorParams } from './useAiTutor';

// Mock the AI service so the hook's logic (prefetch + cache + instant serve +
// fallback) can be tested without the real (disabled) service. The batch shape is
// `{ hint, perChoice }`, and the hook serves the matching slice on submit/hint.
vi.mock('../lib/ai', () => ({
  isAiTutorEnabled: vi.fn(() => true),
  prefetchTutorResponses: vi.fn(),
}));

const mockedIsEnabled = vi.mocked(isAiTutorEnabled);
const mockedPrefetch = vi.mocked(prefetchTutorResponses);

const baseProgress: LessonProgress = {
  completedLessonIds: [],
  dailyCompletionDates: [],
  totalXp: 0,
};

const sampleBatch: PrefetchTutorResponse = {
  hint: 'Focus on how the output value moves.',
  perChoice: [
    { choiceId: 'a', message: 'Exactly right — you compared the outputs.' },
    {
      choiceId: 'b',
      message: 'Not quite — that compares the inputs instead.',
      misconception: 'compared inputs not outputs',
    },
  ],
};

const CORRECT_MESSAGE = { message: 'Exactly right — you compared the outputs.' };
const INCORRECT_MESSAGE = {
  message: 'Not quite — that compares the inputs instead.',
  misconception: 'compared inputs not outputs',
};

function params(overrides: Partial<UseAiTutorParams> = {}): UseAiTutorParams {
  return {
    questionId: 'q-default',
    prompt: 'Prompt',
    choices: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
    correctChoiceId: 'a',
    chosenChoiceId: '',
    isCorrect: null,
    staticHint: 'Static hint.',
    staticCorrectExplanation: 'Correct because.',
    staticIncorrectExplanation: 'Wrong because.',
    progress: baseProgress,
    ...overrides,
  };
}

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

beforeEach(() => {
  mockedPrefetch.mockReset();
  // Benign default so any unconfigured render that triggers a prefetch resolves to
  // a graceful fallback instead of `undefined.then(...)`.
  mockedPrefetch.mockResolvedValue(null);
  mockedIsEnabled.mockReturnValue(true);
  setNavigatorOnline(true);
});

afterEach(() => {
  delete (window.navigator as { onLine?: boolean }).onLine;
});

describe('useAiTutor prefetch + serve', () => {
  it('prefetches the whole batch once when the question is shown (on display)', async () => {
    mockedPrefetch.mockResolvedValue(sampleBatch);

    renderHook(() => useAiTutor(params({ questionId: 'q-display' })));

    await waitFor(() => expect(mockedPrefetch).toHaveBeenCalledTimes(1));
    expect(mockedPrefetch).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Prompt',
        correctChoiceId: 'a',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      }),
      expect.any(Function),
    );
  });

  it('serves the cached encouragement for the correct choice on submit', async () => {
    mockedPrefetch.mockResolvedValue(sampleBatch);

    const { result } = renderHook(() =>
      useAiTutor(params({ questionId: 'q-correct', chosenChoiceId: 'a', isCorrect: true })),
    );

    await waitFor(() => expect(result.current.result).toEqual(CORRECT_MESSAGE));
    expect(result.current.error).toBe(false);
    expect(mockedPrefetch).toHaveBeenCalledTimes(1);
  });

  it('serves the cached tailored feedback + misconception for an incorrect choice', async () => {
    mockedPrefetch.mockResolvedValue(sampleBatch);

    const { result } = renderHook(() =>
      useAiTutor(params({ questionId: 'q-wrong', chosenChoiceId: 'b', isCorrect: false })),
    );

    await waitFor(() => expect(result.current.result).toEqual(INCORRECT_MESSAGE));
  });

  it('serves the cached hint when a hint is requested', async () => {
    mockedPrefetch.mockResolvedValue(sampleBatch);

    const { result } = renderHook(() => useAiTutor(params({ questionId: 'q-hint' })));

    act(() => {
      result.current.requestHint();
    });

    await waitFor(() =>
      expect(result.current.result).toEqual({ message: 'Focus on how the output value moves.' }),
    );
  });

  it('serves instantly from cache on submit with no extra prefetch call', async () => {
    mockedPrefetch.mockResolvedValue(sampleBatch);

    const { result, rerender } = renderHook((hookParams: UseAiTutorParams) => useAiTutor(hookParams), {
      initialProps: params({ questionId: 'q-instant' }),
    });

    // Let the on-display prefetch resolve and populate the module cache.
    await waitFor(() => expect(mockedPrefetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.result).not.toBeNull());

    // Submitting reads the SAME cached batch — immediate message, no new call.
    rerender(params({ questionId: 'q-instant', chosenChoiceId: 'b', isCorrect: false }));

    expect(result.current.result).toEqual(INCORRECT_MESSAGE);
    expect(result.current.loading).toBe(false);
    expect(mockedPrefetch).toHaveBeenCalledTimes(1);
  });

  it('shows the loader while the prefetch is in flight, then the matching message', async () => {
    let resolvePrefetch!: (value: PrefetchTutorResponse | null) => void;
    mockedPrefetch.mockReturnValue(
      new Promise<PrefetchTutorResponse | null>((resolve) => {
        resolvePrefetch = resolve;
      }),
    );

    const { result } = renderHook(() =>
      useAiTutor(params({ questionId: 'q-pending', chosenChoiceId: 'a', isCorrect: true })),
    );

    // In flight: loader on, no result yet, not (yet) an error.
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe(false);

    act(() => {
      resolvePrefetch(sampleBatch);
    });

    await waitFor(() => expect(result.current.result).toEqual(CORRECT_MESSAGE));
    expect(result.current.loading).toBe(false);
  });

  it('falls back (error true, result null) when the prefetch fails', async () => {
    mockedPrefetch.mockResolvedValue(null);

    const { result } = renderHook(() =>
      useAiTutor(params({ questionId: 'q-failed', chosenChoiceId: 'a', isCorrect: true })),
    );

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.result).toBeNull();
  });

  it('falls back when the chosen choice has no prefetched message', async () => {
    mockedPrefetch.mockResolvedValue({
      hint: 'A hint.',
      perChoice: [{ choiceId: 'a', message: 'Only A has feedback.' }],
    });

    const { result } = renderHook(() =>
      useAiTutor(params({ questionId: 'q-missing-choice', chosenChoiceId: 'b', isCorrect: false })),
    );

    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.result).toBeNull();
  });

  it('caches by questionId across remounts (one prefetch per question)', async () => {
    mockedPrefetch.mockResolvedValue(sampleBatch);
    const cached = params({ questionId: 'q-cache', chosenChoiceId: 'a', isCorrect: true });

    const first = renderHook(() => useAiTutor(cached));
    await waitFor(() => expect(first.result.current.result).toEqual(CORRECT_MESSAGE));
    expect(mockedPrefetch).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useAiTutor(cached));
    await waitFor(() => expect(second.result.current.result).toEqual(CORRECT_MESSAGE));
    // Served from the module cache: no second prefetch.
    expect(mockedPrefetch).toHaveBeenCalledTimes(1);
  });

  it('does not re-call the prefetch for a question that already failed', async () => {
    mockedPrefetch.mockResolvedValue(null);
    const failing = params({ questionId: 'q-no-retry', chosenChoiceId: 'a', isCorrect: true });

    const first = renderHook(() => useAiTutor(failing));
    await waitFor(() => expect(first.result.current.error).toBe(true));
    expect(mockedPrefetch).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useAiTutor(failing));
    await waitFor(() => expect(second.result.current.error).toBe(true));
    // The failure is cached too — never re-spend a call for the same question.
    expect(mockedPrefetch).toHaveBeenCalledTimes(1);
  });

  it('does not prefetch when AI is disabled', () => {
    mockedIsEnabled.mockReturnValue(false);

    const { result } = renderHook(() =>
      useAiTutor(params({ questionId: 'q-disabled', chosenChoiceId: 'a', isCorrect: true })),
    );

    expect(mockedPrefetch).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
    expect(result.current.active).toBe(false);
  });

  it('does not prefetch when offline', () => {
    setNavigatorOnline(false);

    const { result } = renderHook(() =>
      useAiTutor(params({ questionId: 'q-offline', chosenChoiceId: 'a', isCorrect: true })),
    );

    expect(mockedPrefetch).not.toHaveBeenCalled();
    expect(result.current.result).toBeNull();
    expect(result.current.active).toBe(false);
  });

  it('reverts to static immediately when the device goes offline', async () => {
    mockedPrefetch.mockResolvedValue(sampleBatch);

    const { result } = renderHook(() =>
      useAiTutor(params({ questionId: 'q-goes-offline', chosenChoiceId: 'a', isCorrect: true })),
    );

    await waitFor(() => expect(result.current.result).toEqual(CORRECT_MESSAGE));

    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.result).toBeNull();
    expect(result.current.active).toBe(false);
  });

  it('reports active=true only while AI is enabled and online', () => {
    const { result, rerender } = renderHook(() => useAiTutor(params({ questionId: 'q-active' })));

    expect(result.current.active).toBe(true);

    mockedIsEnabled.mockReturnValue(false);
    rerender();
    expect(result.current.active).toBe(false);

    mockedIsEnabled.mockReturnValue(true);
    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.active).toBe(false);
  });

  it('forwards the visualHint and static texts into the prefetch input', async () => {
    mockedPrefetch.mockResolvedValue(sampleBatch);
    const visualHint = 'a "function explorer" interactive — Drag the point along the curve.';

    renderHook(() => useAiTutor(params({ questionId: 'q-visual', visualHint })));

    await waitFor(() => expect(mockedPrefetch).toHaveBeenCalledTimes(1));
    expect(mockedPrefetch).toHaveBeenCalledWith(
      expect.objectContaining({
        visualHint,
        staticHint: 'Static hint.',
        staticCorrectExplanation: 'Correct because.',
        staticIncorrectExplanation: 'Wrong because.',
      }),
      expect.any(Function),
    );
  });
});
