import { getLessonById } from '../data/lessons';
import {
  getOverallAccuracy,
  getQuestionsAttemptedCount,
  type LessonProgress,
} from './lessonProgress';

// ---------------------------------------------------------------------------
// Learner-profile summary builder.
//
// Turns the bounded history embedded in LessonProgress (topicStats +
// recentMistakes) into a SHORT plain-text summary the AI tutor can use to tailor
// hints/feedback/encouragement. Kept compact on purpose to control token cost.
// ---------------------------------------------------------------------------

// A topic needs at least this many attempts before getWeakestTopics' DEFAULT
// call treats it as "weak" (avoids branding a single unlucky miss as a
// weakness). The AI profile below deliberately overrides this to 1 so it matches
// the Analytics "Focus areas" definition.
const MIN_TOPIC_ATTEMPTS = 2;
// Recent mistakes sent to the tutor stay bounded: MAX_RECENT_MISTAKES MUST stay
// <= the stored recentMistakes cap (recentMistakesLimit = 25) so we never read
// past what is persisted and never need to grow storage OR touch firestore.rules
// (which validates that the synced `recentMistakes` array has size <= 25).
//
// Weak topics are NOT capped for the AI profile: buildLearnerProfileSummary now
// lists ALL of the learner's focus areas (every topic with accuracy < 100% and
// >= 1 attempt — the same definition the Analytics "Focus areas" card uses).
// They come from the topicStats map (no storage cap), so reading them in full is
// safe; the trade-off is that the profile/prompt grows with the learner's
// weak-topic count, which is acceptable by design. MAX_WEAK_TOPICS now only
// serves as the default limit for getWeakestTopics' other callers.
const MAX_WEAK_TOPICS = 15;
const MAX_RECENT_MISTAKES = 15;
const MAX_PROMPT_CHARS = 80;

type TopicAccuracy = {
  topicKey: string;
  total: number;
  accuracy: number;
};

// A weak topic enriched with a human-readable label, for both the AI prompt and
// the Analytics "Focus areas" card.
export type WeakTopic = {
  topicKey: string;
  label: string;
  accuracy: number;
  total: number;
};

// Short connector words that stay lowercase in Title Case UNLESS they lead the
// label, so the humanized branch reads like the authored lesson titles
// (e.g. "functions and graphs" → "Functions and Graphs").
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
 * Title-cases a humanized label: capitalizes the first letter of every word but
 * keeps short connector words lowercase unless they are the first word. Only the
 * leading letter is changed, so inputs are expected to be already-humanized
 * lowercase slugs (the formatTopicKey fallback branch).
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
 * Human-readable label for a topicKey, used by BOTH the AI profile summary and
 * the Analytics "Focus areas" card. A per-lesson key IS a lessonId, so when it
 * resolves to a known lesson we render the actual LESSON TITLE (e.g.
 * "An Introduction to Limits") rather than a sluggified id — authored titles are
 * the reference casing and are returned as-authored (no Title-Case pass) so
 * acronyms, apostrophes, and proper nouns like "L'Hôpital" stay intact. Anything
 * else — a `${chapterId}/${category}` fallback key, a bare chapterId, or legacy
 * stored keys — is humanized to match that style: split on '/', turn '-'/'_'
 * into spaces, Title-Case each part, join with ' - '.
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
      };
    })
    .filter((entry) => entry.total > 0);
}

/**
 * The learner's weakest topics by accuracy (lowest first), among topics with at
 * least `minAttempts` recorded answers and accuracy below 100%. Shared by the AI
 * profile summary and the Analytics "Focus areas" card.
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
 * Builds a compact, plain-text learner profile for the AI tutor. Returns an
 * empty string when there is no usable history yet (the tutor then keeps its
 * reply general). Summarizes: overall accuracy, the weakest topics by accuracy,
 * the most recent mistakes (chosen vs. correct), and any repeated weak topic.
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

  // List EVERY focus area, not just the top N: pass an unbounded limit and
  // minAttempts = 1 so this matches the Analytics "Focus areas" definition
  // (accuracy < 100%, >= 1 attempt), still ordered lowest-accuracy first. This
  // makes the prompt scale with the learner's weak-topic count (acceptable by
  // design).
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
