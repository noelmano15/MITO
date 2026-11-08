import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatAccessCodeInput,
  normalizeAccessCode,
  generateSecureAccessCode,
  verifyAccessCode,
  createAccessPolicyPreset,
  evaluateAccountTimeAccess,
  evaluateContentAccess,
  evaluateGameAccess,
} from './accessCode';
import { createMinimalMp4Buffer, parseMp4Buffer } from './mp4Parser';
import {
  mergeWatchedSegments,
  calculateSegmentProgress,
  isGameUnlockedByWatchProgress,
} from './watchToUnlock';
import {
  calculateQuestionScore,
  evaluateNewAchievements,
  sortLeaderboardEntries,
} from './gameScoring';
import type { UserAccount, VideoContent, GameItem } from '../types/mito';

test('Access code formatting and cryptographic verification work accurately', () => {
  assert.equal(formatAccessCodeInput('482913756'), '482-913-756');
  assert.equal(formatAccessCodeInput('004-120-998extra'), '004-120-998');
  assert.equal(normalizeAccessCode('482-913-756'), '482913756');
  assert.equal(normalizeAccessCode('123-45'), null);

  const generated = generateSecureAccessCode(new Set(), 'test-pepper-secret');
  assert.equal(generated.digits.length, 9);
  assert.match(generated.formattedCode, /^\d{3}-\d{3}-\d{3}$/);
  assert.equal(verifyAccessCode(generated.formattedCode, generated.salt, generated.hash, 'test-pepper-secret'), true);
  assert.equal(verifyAccessCode('000-000-000', generated.salt, generated.hash, 'test-pepper-secret'), false);
  assert.equal(verifyAccessCode(generated.formattedCode, generated.salt, generated.hash, 'wrong-pepper'), false);
});

test('User access policy enforces time expiration, low-time warning, and content/game restrictions', () => {
  const now = Date.now();
  const demoPolicy = createAccessPolicyPreset('demo'); // 30 mins after first login, 3 titles max, games disabled
  const user: UserAccount = {
    uid: 'usr_1',
    codeHash: 'h',
    codeSalt: 's',
    maskedCode: '***-***-756',
    role: 'user',
    status: 'active',
    displayName: 'Besnik',
    avatar: 'eagle',
    createdAt: new Date(now - 60_000).toISOString(),
    firstLoginAt: new Date(now - 26 * 60_000).toISOString(), // 26 mins ago -> 4 mins remaining
    accessActivatedAt: new Date(now - 26 * 60_000).toISOString(),
    accessPolicy: demoPolicy,
    stats: {
      totalXp: 0,
      totalPoints: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      accuracyPercent: 0,
      currentStreak: 0,
      bestStreak: 0,
      rank: 1,
      country: 'AL',
      watchedSecondsToday: 120,
      gameSessionsToday: 0,
      lastActivityDate: new Date(now).toISOString().slice(0, 10),
    },
    achievements: [],
    likedShortIds: [],
    savedContentIds: [],
    recentActivity: [],
  };

  const timeCheck = evaluateAccountTimeAccess(user, now);
  assert.equal(timeCheck.allowed, true);
  assert.equal(timeCheck.remainingMinutes, 4);
  assert.equal(timeCheck.lowTimeWarningSq, 'Ke akses edhe për 4 minuta.');

  // After 31 minutes -> expired
  const expiredCheck = evaluateAccountTimeAccess(user, now + 6 * 60_000);
  assert.equal(expiredCheck.allowed, false);
  assert.equal(expiredCheck.messageSq, 'Sesioni yt ka përfunduar.');

  // Content limit check (max 3 titles in demo preset)
  const sampleVideo = {
    contentId: 'vid_4',
    videoFormat: 'standard',
    categoryIds: ['cat_legjenda'],
  } as VideoContent;
  const contentDenied = evaluateContentAccess(user, sampleVideo, ['vid_1', 'vid_2', 'vid_3'], 0);
  assert.equal(contentDenied.allowed, false);
  assert.equal(contentDenied.messageSq, 'Ky material nuk është i disponueshëm për llogarinë tënde.');

  // Game permission check (disabled in demo preset)
  const sampleGame = { gameId: 'game_1' } as GameItem;
  const gameDenied = evaluateGameAccess(user, sampleGame, 'solo');
  assert.equal(gameDenied.allowed, false);
  assert.equal(gameDenied.messageSq, 'Kjo lojë nuk është e përfshirë në aksesin tënd.');
});

test('MP4 binary parser detects vertical 9:16 Shorts vs landscape 16:9 Standard video dimensions', () => {
  const verticalMp4 = createMinimalMp4Buffer(1080, 1920, 45);
  const parsedShort = parseMp4Buffer(verticalMp4);
  assert.equal(parsedShort.isValidMp4, true);
  assert.equal(parsedShort.width, 1080);
  assert.equal(parsedShort.height, 1920);
  assert.equal(parsedShort.resolution, '1080x1920');
  assert.equal(parsedShort.durationSeconds, 45);
  assert.equal(parsedShort.isVertical916, true);
  assert.equal(parsedShort.needsVerticalAspectWarning, false);
  assert.equal(parsedShort.codec, 'H.264 (avc1)');
  assert.equal(parsedShort.audioCodec, 'AAC (mp4a)');

  const standardMp4 = createMinimalMp4Buffer(1920, 1080, 720);
  const parsedStandard = parseMp4Buffer(standardMp4);
  assert.equal(parsedStandard.width, 1920);
  assert.equal(parsedStandard.height, 1080);
  assert.equal(parsedStandard.resolution, '1920x1080');
  assert.equal(parsedStandard.durationSeconds, 720);
  assert.equal(parsedStandard.isVertical916, false);
  assert.equal(parsedStandard.isLandscape169, true);
  assert.equal(parsedStandard.needsVerticalAspectWarning, true);
});

test('Watch-to-Unlock tracks real watched segments and blocks timestamp-jump bypass', () => {
  const duration = 100;
  let segments = mergeWatchedSegments([], { start: 0, end: 15 }, duration);
  segments = mergeWatchedSegments(segments, { start: 14, end: 30 }, duration);
  // Attempt to cheat by submitting a 70-second jump in a single heartbeat -> ignored!
  segments = mergeWatchedSegments(segments, { start: 30, end: 100 }, duration);

  const progress = calculateSegmentProgress(segments, duration);
  assert.equal(progress.uniqueWatchedSeconds, 30);
  assert.equal(progress.completionPercent, 30);

  const unlockCheckBefore = isGameUnlockedByWatchProgress({
    requireWatchToUnlock: true,
    requiredWatchPercent: 80,
    userCompletionPercent: progress.completionPercent,
  });
  assert.equal(unlockCheckBefore.unlocked, true);
  assert.equal(unlockCheckBefore.requiredPercent, 0);
  assert.equal(unlockCheckBefore.remainingPercent, 0);

  // Legitimate watching up to 85s
  for (let t = 30; t < 85; t += 15) {
    segments = mergeWatchedSegments(segments, { start: t, end: Math.min(85, t + 15) }, duration);
  }
  const finalProgress = calculateSegmentProgress(segments, duration);
  assert.equal(finalProgress.completionPercent, 85);

  const unlockCheckAfter = isGameUnlockedByWatchProgress({
    requireWatchToUnlock: true,
    requiredWatchPercent: 80,
    userCompletionPercent: finalProgress.completionPercent,
  });
  assert.equal(unlockCheckAfter.unlocked, true);
});

test('Server-authoritative quiz scoring and leaderboard sorting work accurately', () => {
  const fastCorrect = calculateQuestionScore({
    isCorrect: true,
    basePoints: 100,
    timeLimitSeconds: 20,
    elapsedSeconds: 4,
    currentStreak: 2,
    scoringMethod: 'speed_bonus',
  });
  assert.equal(fastCorrect.pointsEarned, 140);
  assert.equal(fastCorrect.newStreak, 3);
  assert.equal(fastCorrect.timedOut, false);

  const lateSubmission = calculateQuestionScore({
    isCorrect: true,
    basePoints: 100,
    timeLimitSeconds: 15,
    elapsedSeconds: 18,
    currentStreak: 3,
    scoringMethod: 'speed_bonus',
  });
  assert.equal(lateSubmission.pointsEarned, 0);
  assert.equal(lateSubmission.newStreak, 0);
  assert.equal(lateSubmission.timedOut, true);
});
