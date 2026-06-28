/*
 * Persistence model for an IN-PROGRESS practice session (Feature: resume across
 * exit AND logout). The authoritative copy lives in Firestore keyed by uid (see
 * ./firestorePracticeSession), with a localStorage MIRROR here for instant,
 * offline, same-device resume. This module is the pure layer: the serializable
 * snapshot shape, normalizers (mirroring ./firestoreProgress's defensive style),
 * the local mirror, and small helpers — no Firebase, so it is fully unit-testable.
 *
 * The snapshot captures ENOUGH to restore the EXACT session: the full ordered
 * bank set, the AI-generated challenge set VERBATIM (never regenerated on resume),
 * the current index, per-question answers (via sessionResponses) + running tally,
 * the challenge round state, and the session MODE (daily-gate vs free). Rewards
 * are awarded live on submit into LessonProgress (its own doc); restoring NEVER
 * replays an award, so resume is idempotent.
 */

import type { PracticeChoice, PracticeQuestion } from '../data/questionBank';
import type { ChallengeQuestion, ChallengeSessionQuestion } from '../lib/ai';

/** localStorage key for the same-device session mirror (wraps {uid, snapshot}). */
export const practiceSessionStorageKey = 'brilliant-clone.practice-session';

/** Bumped if the snapshot shape changes incompatibly; mismatches are discarded. */
export const PRACTICE_SESSION_VERSION = 1;

/** Hard caps mirrored by firestore.rules; oversized lists are rejected (→ null). */
const MAX_BANK_QUESTIONS = 200;
const MAX_CHALLENGE_QUESTIONS = 50;
const MAX_SESSION_RESPONSES = 200;
const MAX_SR_TOPICS = 200;

type PersistedSessionMode = 'gate' | 'free';
type PersistedAnswerResult = 'correct' | 'incorrect' | null;
/* 'loading' is transient and never persisted: a session is saved as 'inactive'
 * (challenge not yet started) or 'active' (round materialized). */
type PersistedChallengePhase = 'inactive' | 'active';

export type PracticeSessionSnapshot = {
  version: number;
  /** Distinguishes one session run from another (regenerated on a fresh start). */
  sessionId: string;
  /** 'gate' = the required daily-practice gate; 'free' = normal practice. */
  mode: PersistedSessionMode;
  /** The full ordered static (bank) question set, verbatim. */
  bankQuestions: PracticeQuestion[];
  /** Index into bankQuestions of the question currently shown. */
  questionIndex: number;
  /** The current question's in-progress selection (empty until picked). */
  currentSelectedChoiceId: string;
  /** The current question's submitted result, or null if not yet submitted. */
  currentAnswerResult: PersistedAnswerResult;
  /** Running bank tally (already reflected in LessonProgress rewards). */
  correctCount: number;
  incorrectCount: number;
  /** Per-bank-answer record (seeds challenge generation + is the answer history). */
  sessionResponses: ChallengeSessionQuestion[];
  /** Whether the post-session challenge round has materialized. */
  challengePhase: PersistedChallengePhase;
  /** The AI-generated challenge questions, VERBATIM (never regenerated on resume). */
  challengeQuestions: ChallengeQuestion[];
  challengeIndex: number;
  challengeCorrectCount: number;
  challengeIncorrectCount: number;
  challengeTargetCount: number;
  /** Whether the round genuinely couldn't run (shown in the summary). */
  challengeUnavailable: boolean;
  /** Gate-only: SR topics the static set served (advanced on a pass). */
  srTopicsServed: string[];
  /** Gate-only: AI question count the gate set recommended. */
  recommendedAiCount: number;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function normalizeChoices(value: unknown): PracticeChoice[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const choices: PracticeChoice[] = [];
  for (const entry of value) {
    if (!isObject(entry)) {
      continue;
    }
    const id = asString(entry.id).trim();
    const label = asString(entry.label);
    if (!id) {
      continue;
    }
    choices.push({ id, label });
  }
  return choices.length > 0 ? choices : null;
}

function normalizeBankQuestion(value: unknown): PracticeQuestion | null {
  if (!isObject(value)) {
    return null;
  }
  const id = asString(value.id).trim();
  const prompt = asString(value.prompt);
  const correctChoiceId = asString(value.correctChoiceId).trim();
  const choices = normalizeChoices(value.choices);
  if (!id || !prompt || !correctChoiceId || !choices) {
    return null;
  }
  const question: PracticeQuestion = {
    id,
    chapterId: asString(value.chapterId),
    category: asString(value.category),
    prompt,
    choices,
    correctChoiceId,
    explanation: asString(value.explanation),
  };
  const lessonId = asString(value.lessonId).trim();
  if (lessonId) {
    question.lessonId = lessonId;
  }
  if (typeof value.difficulty === 'number' && Number.isFinite(value.difficulty)) {
    question.difficulty = value.difficulty;
  }
  return question;
}

function normalizeChallengeQuestion(value: unknown): ChallengeQuestion | null {
  if (!isObject(value)) {
    return null;
  }
  const id = asString(value.id).trim();
  const prompt = asString(value.prompt);
  const correctChoiceId = asString(value.correctChoiceId).trim();
  const choices = normalizeChoices(value.choices);
  if (!id || !prompt || !correctChoiceId || !choices) {
    return null;
  }
  return {
    id,
    prompt,
    choices,
    correctChoiceId,
    explanation: asString(value.explanation),
    targetConcept: asString(value.targetConcept),
  };
}

function normalizeSessionResponse(value: unknown): ChallengeSessionQuestion | null {
  if (!isObject(value)) {
    return null;
  }
  const prompt = asString(value.prompt);
  const correctChoiceId = asString(value.correctChoiceId).trim();
  const choices = normalizeChoices(value.choices);
  if (!prompt || !correctChoiceId || !choices) {
    return null;
  }
  const response: ChallengeSessionQuestion = {
    prompt,
    choices,
    correctChoiceId,
    userChoiceId: asString(value.userChoiceId).trim(),
    isCorrect: value.isCorrect === true,
  };
  const category = asString(value.category).trim();
  if (category) {
    response.category = category;
  }
  return response;
}

function normalizeStringList(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry))
    .slice(0, limit);
}

/**
 * Validates an arbitrary value into a {@link PracticeSessionSnapshot}, dropping
 * malformed nested entries. Returns `null` when the snapshot is unusable (wrong
 * version, no bank questions, or oversized lists) so callers ignore it and start
 * fresh. Never throws.
 */
export function normalizePracticeSessionSnapshot(value: unknown): PracticeSessionSnapshot | null {
  if (!isObject(value)) {
    return null;
  }

  if (value.version !== PRACTICE_SESSION_VERSION) {
    return null;
  }

  const sessionId = asString(value.sessionId).trim();
  if (!sessionId) {
    return null;
  }

  const mode: PersistedSessionMode = value.mode === 'gate' ? 'gate' : 'free';

  const rawBank = Array.isArray(value.bankQuestions) ? value.bankQuestions : [];
  if (rawBank.length > MAX_BANK_QUESTIONS) {
    return null;
  }
  const bankQuestions = rawBank
    .map(normalizeBankQuestion)
    .filter((question): question is PracticeQuestion => question !== null);
  if (bankQuestions.length === 0) {
    return null;
  }

  const rawChallenge = Array.isArray(value.challengeQuestions) ? value.challengeQuestions : [];
  if (rawChallenge.length > MAX_CHALLENGE_QUESTIONS) {
    return null;
  }
  const challengeQuestions = rawChallenge
    .map(normalizeChallengeQuestion)
    .filter((question): question is ChallengeQuestion => question !== null);

  const rawResponses = Array.isArray(value.sessionResponses) ? value.sessionResponses : [];
  if (rawResponses.length > MAX_SESSION_RESPONSES) {
    return null;
  }
  const sessionResponses = rawResponses
    .map(normalizeSessionResponse)
    .filter((response): response is ChallengeSessionQuestion => response !== null);

  const challengePhase: PersistedChallengePhase =
    value.challengePhase === 'active' && challengeQuestions.length > 0 ? 'active' : 'inactive';

  const currentAnswerResult: PersistedAnswerResult =
    value.currentAnswerResult === 'correct' || value.currentAnswerResult === 'incorrect'
      ? value.currentAnswerResult
      : null;

  const questionIndex = Math.min(asCount(value.questionIndex), bankQuestions.length - 1);

  return {
    version: PRACTICE_SESSION_VERSION,
    sessionId,
    mode,
    bankQuestions,
    questionIndex,
    currentSelectedChoiceId: asString(value.currentSelectedChoiceId),
    currentAnswerResult,
    correctCount: asCount(value.correctCount),
    incorrectCount: asCount(value.incorrectCount),
    sessionResponses,
    challengePhase,
    challengeQuestions,
    challengeIndex: asCount(value.challengeIndex),
    challengeCorrectCount: asCount(value.challengeCorrectCount),
    challengeIncorrectCount: asCount(value.challengeIncorrectCount),
    challengeTargetCount: asCount(value.challengeTargetCount),
    challengeUnavailable: value.challengeUnavailable === true,
    srTopicsServed: normalizeStringList(value.srTopicsServed, MAX_SR_TOPICS),
    recommendedAiCount: asCount(value.recommendedAiCount),
  };
}

/** A new opaque session id (timestamp + randomness; collisions don't matter). */
export function createPracticeSessionId(): string {
  return `ps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Whether a snapshot can be restored into the CURRENT page context: it must be
 * structurally valid, have questions, the learner must have eligible questions,
 * and its mode MUST match the live gate state (a stale free session is discarded
 * when the gate is active, and vice-versa — keeping gate eligibility consistent).
 */
export function isRestorableSession(
  snapshot: PracticeSessionSnapshot | null,
  context: { gateMode: boolean; eligibleQuestionCount: number },
): snapshot is PracticeSessionSnapshot {
  if (!snapshot || snapshot.bankQuestions.length === 0) {
    return false;
  }
  if (context.eligibleQuestionCount <= 0) {
    return false;
  }
  return (snapshot.mode === 'gate') === context.gateMode;
}

type StoredMirror = { uid: string; snapshot: unknown };

/**
 * Reads the same-device mirror, returning the snapshot ONLY when it belongs to
 * `userId` (so one account never resumes another's session on a shared device).
 * Returns `null` for a missing/foreign/corrupt entry. Never throws.
 */
export function readLocalPracticeSession(userId: string): PracticeSessionSnapshot | null {
  if (typeof window === 'undefined' || !userId) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(practiceSessionStorageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as StoredMirror | null;
    if (!parsed || typeof parsed !== 'object' || parsed.uid !== userId) {
      return null;
    }
    return normalizePracticeSessionSnapshot(parsed.snapshot);
  } catch {
    return null;
  }
}

/** Writes the same-device mirror, tagged with the owning uid. Never throws. */
export function writeLocalPracticeSession(userId: string, snapshot: PracticeSessionSnapshot): void {
  if (typeof window === 'undefined' || !userId) {
    return;
  }
  try {
    const mirror: StoredMirror = { uid: userId, snapshot };
    window.localStorage.setItem(practiceSessionStorageKey, JSON.stringify(mirror));
  } catch {
    // Best-effort mirror; Firestore remains authoritative.
  }
}

/** Clears the same-device mirror (on completion/restart/sign-out). Never throws. */
export function clearLocalPracticeSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(practiceSessionStorageKey);
  } catch {
    // Ignore.
  }
}
