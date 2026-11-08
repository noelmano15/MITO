import type { WatchedSegment } from '../types/mito';

/**
 * Merges overlapping or adjacent watched playback segments and prevents invalid jumps.
 * Enforces anti-cheat: jumping to the end timestamp without watching intermediate segments
 * only records the tiny segment actually watched, never full completion.
 */
export function mergeWatchedSegments(
  existing: WatchedSegment[],
  newSegment: WatchedSegment,
  durationSeconds: number,
  maxAllowedSegmentDeltaSeconds = 20
): WatchedSegment[] {
  const maxDur = Math.max(1, durationSeconds);
  const clampedStart = Math.max(0, Math.min(maxDur, newSegment.start));
  const clampedEnd = Math.max(clampedStart, Math.min(maxDur, newSegment.end));

  // Ignore suspiciously large single heartbeat jumps (> maxAllowedSegmentDeltaSeconds)
  const validNewSegment: WatchedSegment | null =
    clampedEnd > clampedStart && clampedEnd - clampedStart <= maxAllowedSegmentDeltaSeconds
      ? { start: Number(clampedStart.toFixed(2)), end: Number(clampedEnd.toFixed(2)) }
      : null;

  const all = validNewSegment ? [...existing, validNewSegment] : [...existing];
  if (all.length === 0) return [];

  const sorted = all
    .map((s) => ({
      start: Math.max(0, Math.min(maxDur, s.start)),
      end: Math.max(0, Math.min(maxDur, s.end)),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);

  if (sorted.length === 0) return [];

  const merged: WatchedSegment[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr.start <= prev.end + 1.0) {
      prev.end = Math.max(prev.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }

  return merged;
}

/**
 * Calculates total unique watched seconds and verified completion percentage.
 */
export function calculateSegmentProgress(
  segments: WatchedSegment[],
  durationSeconds: number
): {
  uniqueWatchedSeconds: number;
  completionPercent: number;
} {
  if (durationSeconds <= 0 || segments.length === 0) {
    return { uniqueWatchedSeconds: 0, completionPercent: 0 };
  }
  const totalSeconds = segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
  const uniqueWatchedSeconds = Math.min(durationSeconds, Math.round(totalSeconds));
  const completionPercent = Math.min(100, Number(((totalSeconds / durationSeconds) * 100).toFixed(1)));
  return { uniqueWatchedSeconds, completionPercent };
}

/**
 * Evaluates whether a game/questionnaire linked to content is unlocked for the user.
 * Per platform policy, users do not have to watch a certain amount of video to access questionnaires/quizzes.
 */
export function isGameUnlockedByWatchProgress(params: {
  requireWatchToUnlock: boolean;
  requiredWatchPercent: number;
  userCompletionPercent: number;
  isSuperAdmin?: boolean;
}): {
  unlocked: boolean;
  requiredPercent: number;
  currentPercent: number;
  remainingPercent: number;
} {
  const currentPercent = Math.max(0, Math.min(100, params.userCompletionPercent || 0));
  return {
    unlocked: true,
    requiredPercent: 0,
    currentPercent,
    remainingPercent: 0,
  };
}
