import { getLessonById } from '../data/lessons';
import {
  getOverallAccuracy,
  getQuestionsAttemptedCount,
  type LessonProgress,
} from './lessonProgress';

/* Turns LessonProgress history (topicStats + recentMistakes) into a SHORT
 * plain-text summary for the AI tutor; kept compact to control token cost. */

/* Min attempts before getWeakestTopics' DEFAULT treats a topic as "weak". The AI
 * profile overrides to 1 to match Analytics "Focus areas". */
const MIN_TOPIC_ATTEMPTS = 2;
/* MAX_RECENT_MISTAKES must stay <= the stored recentMistakes cap (25). The AI
 * profile doesn't cap weak topics; MAX_WEAK_TOPICS is only getWeakestTopics'
 * default for other callers. */
const MAX_WEAK_TOPICS = 15;
const MAX_RECENT_MISTAKES = 15;
const MAX_PROMPT_CHARS = 80;

type TopicAccuracy = {
  topicKey: string;
  total: number;
  accuracy: number;
  correct: number;
  incorrect: number;
};

/* A weak topic with a human-readable label (AI prompt + Analytics "Focus areas"). */
export type WeakTopic = {
  topicKey: string;
  label: string;
  accuracy: number;
  total: number;
};

/* Connector words kept lowercase in Title Case unless they lead the label
 * (e.g. "functions and graphs" → "Functions and Graphs"). */
const TITLE_CASE_MINOR_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
]);

/**
 * Title-cases a humanized label: capitalizes each word but keeps connector words
 * lowercase unless first. Only the leading letter changes, so inputs are expected
 * to be already-humanized slugs.
 */
function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && TITLE_CASE_MINOR_WORDS.has(lower)) {
        return lower;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Human-readable label for a topicKey (AI profile + Analytics "Focus areas"). A
 * per-lesson key IS a lessonId, so a known lesson renders its authored TITLE
 * verbatim (no Title-Case pass, keeping acronyms/apostrophes intact). Other keys
 * (`${chapterId}/${category}`, bare chapterId, legacy) are humanized: split on
 * '/', '-'/'_' → spaces, Title-Case each part, join with ' - '.
 */
export function formatTopicKey(topicKey: string): string {
  const lesson = getLessonById(topicKey);
  if (lesson) {
    return lesson.title;
  }

  return topicKey
    .split('/')
    .map((part) => toTitleCase(part.replace(/[-_]+/g, ' ')))
    .filter(Boolean)
    .join(' - ');
}

function truncate(text: string, maxChars: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxChars ? `${collapsed.slice(0, maxChars - 1)}…` : collapsed;
}

function getTopicAccuracies(progress: LessonProgress): TopicAccuracy[] {
  const topicStats = progress.topicStats ?? {};

  return Object.entries(topicStats)
    .map(([topicKey, stat]) => {
      const correct = Math.max(0, stat?.correct ?? 0);
      const incorrect = Math.max(0, stat?.incorrect ?? 0);
      const total = correct + incorrect;
      return {
        topicKey,
        total,
        accuracy: total > 0 ? Math.round((100 * correct) / total) : 0,
        correct,
        incorrect,
      };
    })
    .filter((entry) => entry.total > 0);
}

/**
 * A topic's mastery as an EXACT 0..1 ratio (correct / attempts), or null when the
 * learner has no recorded attempts for it. The selection logic uses this exact
 * ratio (not the rounded percentage that {@link getWeakestTopics} surfaces).
 */
export function getTopicMastery(
  progress: LessonProgress | null | undefined,
  topicKey: string,
): number | null {
  if (!progress) {
    return null;
  }

  const entry = getTopicAccuracies(progress).find((candidate) => candidate.topicKey === topicKey);
  if (!entry || entry.total === 0) {
    return null;
  }

  return entry.correct / entry.total;
}

/**
 * Topic keys whose mastery is below `threshold` (with >= 1 attempt), ordered
 * weakest-first (ascending mastery, ties broken by more attempts). Reuses
 * getTopicAccuracies so it stays consistent with the rest of the profile.
 */
export function getTopicsBelowMastery(
  progress: LessonProgress | null | undefined,
  threshold: number,
): string[] {
  if (!progress) {
    return [];
  }

  return getTopicAccuracies(progress)
    .filter((entry) => entry.total >= 1 && entry.correct / entry.total < threshold)
    .sort((left, right) => {
      const leftMastery = left.correct / left.total;
      const rightMastery = right.correct / right.total;
      return leftMastery - rightMastery || right.total - left.total;
    })
    .map((entry) => entry.topicKey);
}

/**
 * The learner's weakest topics by accuracy (lowest first), among topics with >=
 * `minAttempts` answers and accuracy below 100%. Shared by the AI profile and
 * Analytics "Focus areas".
 */
export function getWeakestTopics(
  progress: LessonProgress | null | undefined,
  limit = MAX_WEAK_TOPICS,
  minAttempts = MIN_TOPIC_ATTEMPTS,
): WeakTopic[] {
  if (!progress) {
    return [];
  }

  return getTopicAccuracies(progress)
    .filter((entry) => entry.total >= minAttempts && entry.accuracy < 100)
    .sort((left, right) => left.accuracy - right.accuracy || right.total - left.total)
    .slice(0, Math.max(0, limit))
    .map((entry) => ({
      topicKey: entry.topicKey,
      label: formatTopicKey(entry.topicKey),
      accuracy: entry.accuracy,
      total: entry.total,
    }));
}

/** The topicKey the learner has missed most often across recent mistakes (>= 2). */
function findRepeatedMistakeTopic(progress: LessonProgress): string | null {
  const counts = new Map<string, number>();

  for (const mistake of progress.recentMistakes ?? []) {
    counts.set(mistake.topicKey, (counts.get(mistake.topicKey) ?? 0) + 1);
  }

  let repeatedTopic: string | null = null;
  let highestCount = 1;

  for (const [topicKey, count] of counts) {
    if (count > highestCount) {
      highestCount = count;
      repeatedTopic = topicKey;
    }
  }

  return repeatedTopic;
}

/**
 * Builds a compact, plain-text learner profile for the AI tutor (empty string
 * when there's no usable history). Summarizes overall accuracy, weakest topics,
 * recent mistakes (chosen vs. correct), and any repeated weak topic.
 */
export function buildLearnerProfileSummary(
  progress: LessonProgress | null | undefined,
): string {
  if (!progress) {
    return '';
  }

  const topicAccuracies = getTopicAccuracies(progress);
  const recentMistakes = progress.recentMistakes ?? [];
  const totalTopicAttempts = topicAccuracies.reduce((sum, entry) => sum + entry.total, 0);

  if (totalTopicAttempts === 0 && recentMistakes.length === 0) {
    return '';
  }

  const lines: string[] = [];

  const attempted = getQuestionsAttemptedCount(progress);
  if (attempted > 0) {
    lines.push(
      `Overall accuracy: ${getOverallAccuracy(progress)}% across ${attempted} answered question(s).`,
    );
  }

  /* List EVERY focus area: unbounded limit + minAttempts = 1 matches the
   * Analytics "Focus areas" definition (accuracy < 100%, >= 1 attempt). */
  const weakTopics = getWeakestTopics(progress, Number.POSITIVE_INFINITY, 1);

  if (weakTopics.length > 0) {
    lines.push(
      `Weakest topics: ${weakTopics
        .map((entry) => `${entry.label} (${entry.accuracy}% over ${entry.total})`)
        .join('; ')}.`,
    );
  }

  const recent = recentMistakes.slice(0, MAX_RECENT_MISTAKES);
  if (recent.length > 0) {
    lines.push(
      `Recent mistakes: ${recent
        .map(
          (mistake) =>
            `"${truncate(mistake.prompt, MAX_PROMPT_CHARS)}" → chose "${truncate(
              mistake.chosenLabel,
              MAX_PROMPT_CHARS,
            )}" (correct: "${truncate(mistake.correctLabel, MAX_PROMPT_CHARS)}")`,
        )
        .join('; ')}.`,
    );
  }

  const repeatedTopic = findRepeatedMistakeTopic(progress);
  if (repeatedTopic) {
    lines.push(`Recurring trouble spot: ${formatTopicKey(repeatedTopic)}.`);
  }

  return lines.join(' ');
}
