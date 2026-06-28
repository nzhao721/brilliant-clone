import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLocalPracticeSession,
  createPracticeSessionId,
  isRestorableSession,
  normalizePracticeSessionSnapshot,
  practiceSessionStorageKey,
  readLocalPracticeSession,
  writeLocalPracticeSession,
  PRACTICE_SESSION_VERSION,
  type PracticeSessionSnapshot,
} from './practiceSession';

/*
 * Pure serialization + local-mirror tests for the resumable practice session.
 * The headline guarantees: the AI-generated challenge questions round-trip
 * VERBATIM (they are expensive + non-deterministic, never regenerated on resume),
 * malformed/oversized payloads are rejected, the mirror is keyed by uid (no
 * cross-account leak), and restore eligibility tracks the live gate mode.
 */

function fullSnapshot(overrides: Partial<PracticeSessionSnapshot> = {}): PracticeSessionSnapshot {
  return {
    version: PRACTICE_SESSION_VERSION,
    sessionId: 'ps-test-1',
    mode: 'free',
    bankQuestions: [
      {
        id: 'q1',
        chapterId: 'limits',
        lessonId: 'what-changes',
        category: 'sample',
        prompt: 'Bank prompt $x$',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        correctChoiceId: 'a',
        explanation: 'Because A.',
      },
    ],
    questionIndex: 0,
    currentSelectedChoiceId: 'a',
    currentAnswerResult: 'correct',
    correctCount: 1,
    incorrectCount: 0,
    sessionResponses: [
      {
        prompt: 'Bank prompt $x$',
        choices: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        correctChoiceId: 'a',
        userChoiceId: 'a',
        isCorrect: true,
        category: 'sample',
      },
    ],
    challengePhase: 'active',
    challengeQuestions: [
      {
        id: 'challenge-1',
        prompt: 'AI challenge $\\lim_{x\\to 0} x$',
        choices: [
          { id: 'a', label: '$0$' },
          { id: 'b', label: '$1$' },
          { id: 'c', label: '$\\infty$' },
        ],
        correctChoiceId: 'a',
        explanation: 'The limit is $0$.',
        targetConcept: 'limits at a point',
      },
    ],
    challengeIndex: 0,
    challengeCorrectCount: 0,
    challengeIncorrectCount: 0,
    challengeTargetCount: 1,
    challengeUnavailable: false,
    srTopicsServed: ['what-changes'],
    recommendedAiCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('normalizePracticeSessionSnapshot', () => {
  it('round-trips a full snapshot including the AI challenge questions verbatim', () => {
    const snapshot = fullSnapshot();
    expect(normalizePracticeSessionSnapshot(snapshot)).toEqual(snapshot);
  });

  it('preserves the exact AI challenge set (never regenerated on resume)', () => {
    const normalized = normalizePracticeSessionSnapshot(fullSnapshot());
    expect(normalized?.challengeQuestions).toEqual(fullSnapshot().challengeQuestions);
  });

  it('rejects a version mismatch', () => {
    expect(normalizePracticeSessionSnapshot(fullSnapshot({ version: 999 }))).toBeNull();
  });

  it('rejects a snapshot with no usable bank questions', () => {
    expect(normalizePracticeSessionSnapshot(fullSnapshot({ bankQuestions: [] }))).toBeNull();
  });

  it('drops a malformed bank question but keeps the valid ones', () => {
    const snapshot = fullSnapshot({
      bankQuestions: [
        // missing prompt → dropped
        {
          id: 'bad',
          chapterId: 'limits',
          category: 'sample',
          prompt: '',
          choices: [{ id: 'a', label: 'A' }],
          correctChoiceId: 'a',
          explanation: '',
        },
        fullSnapshot().bankQuestions[0],
      ],
    });
    const normalized = normalizePracticeSessionSnapshot(snapshot);
    expect(normalized?.bankQuestions).toHaveLength(1);
    expect(normalized?.bankQuestions[0].id).toBe('q1');
  });

  it('falls back to an inactive challenge phase when no challenge questions survive', () => {
    const normalized = normalizePracticeSessionSnapshot(
      fullSnapshot({ challengePhase: 'active', challengeQuestions: [] }),
    );
    expect(normalized?.challengePhase).toBe('inactive');
  });

  it('clamps an out-of-range questionIndex into the bank set', () => {
    const normalized = normalizePracticeSessionSnapshot(fullSnapshot({ questionIndex: 99 }));
    expect(normalized?.questionIndex).toBe(0);
  });
});

describe('practice session local mirror', () => {
  it('writes + reads back the snapshot for the owning uid', () => {
    const snapshot = fullSnapshot();
    writeLocalPracticeSession('user-1', snapshot);
    expect(readLocalPracticeSession('user-1')).toEqual(snapshot);
    // Stored under the documented key.
    expect(window.localStorage.getItem(practiceSessionStorageKey)).toContain('user-1');
  });

  it('never resumes another account’s session on a shared device', () => {
    writeLocalPracticeSession('user-1', fullSnapshot());
    expect(readLocalPracticeSession('user-2')).toBeNull();
  });

  it('clears the mirror', () => {
    writeLocalPracticeSession('user-1', fullSnapshot());
    clearLocalPracticeSession();
    expect(readLocalPracticeSession('user-1')).toBeNull();
  });
});

describe('isRestorableSession', () => {
  it('restores a free session only when the gate is NOT active', () => {
    const snapshot = fullSnapshot({ mode: 'free' });
    expect(isRestorableSession(snapshot, { gateMode: false, eligibleQuestionCount: 5 })).toBe(true);
    expect(isRestorableSession(snapshot, { gateMode: true, eligibleQuestionCount: 5 })).toBe(false);
  });

  it('restores a gate session only when the gate IS active', () => {
    const snapshot = fullSnapshot({ mode: 'gate' });
    expect(isRestorableSession(snapshot, { gateMode: true, eligibleQuestionCount: 5 })).toBe(true);
    expect(isRestorableSession(snapshot, { gateMode: false, eligibleQuestionCount: 5 })).toBe(false);
  });

  it('does not restore when there are no eligible questions or no snapshot', () => {
    expect(isRestorableSession(fullSnapshot(), { gateMode: false, eligibleQuestionCount: 0 })).toBe(
      false,
    );
    expect(isRestorableSession(null, { gateMode: false, eligibleQuestionCount: 5 })).toBe(false);
  });
});

describe('createPracticeSessionId', () => {
  it('mints distinct ids', () => {
    expect(createPracticeSessionId()).not.toBe(createPracticeSessionId());
  });
});
