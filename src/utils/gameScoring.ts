import type { AchievementDefinition, LeaderboardEntry, UserAccount } from '../types/mito';

export const DEFAULT_ACHIEVEMENTS: AchievementDefinition[] = [
  {
    achievementId: 'eksploruesi_i_pare',
    title: 'Eksploruesi i Parë',
    description: 'Shiko videon ose legjendën e parë në MITO.',
    iconName: 'Compass',
    xpBonus: 100,
    conditionType: 'first_explore',
    threshold: 1,
  },
  {
    achievementId: 'njohesi_i_legjendave',
    title: 'Njohësi i Legjendave',
    description: 'Përfundo me sukses 3 kuize mbi legjendat shqiptare.',
    iconName: 'BookOpen',
    xpBonus: 250,
    conditionType: 'legends_watched',
    threshold: 3,
  },
  {
    achievementId: 'mjeshter_i_mitologjise',
    title: 'Mjeshtër i Mitologjisë',
    description: 'Arrij mbi 1,000 XP në sfidat kulturore.',
    iconName: 'Crown',
    xpBonus: 500,
    conditionType: 'mythology_master',
    threshold: 1000,
  },
  {
    achievementId: 'dhjete_kuize_perfekte',
    title: '10 Quiz-e Perfekte',
    description: 'Arrij një seri prej 10 përgjigjesh të sakta radhazi.',
    iconName: 'Award',
    xpBonus: 400,
    conditionType: 'perfect_quizzes',
    threshold: 10,
  },
  {
    achievementId: 'kampion_javor',
    title: 'Kampion Javor',
    description: 'Fito 5 lojëra ose sfida globale.',
    iconName: 'Trophy',
    xpBonus: 350,
    conditionType: 'weekly_champion',
    threshold: 5,
  },
  {
    achievementId: 'ekspert_i_traditave',
    title: 'Ekspert i Traditave',
    description: 'Arrij saktësi mbi 85% pas të paktën 5 lojërave.',
    iconName: 'ShieldCheck',
    xpBonus: 300,
    conditionType: 'traditions_expert',
    threshold: 85,
  },
];

/**
 * Server-authoritative score calculation for a quiz/game question.
 * Enforces question deadlines and calculates speed & streak bonuses.
 */
export function calculateQuestionScore(params: {
  isCorrect: boolean;
  basePoints: number;
  timeLimitSeconds: number;
  elapsedSeconds: number;
  currentStreak: number;
  scoringMethod: 'standard' | 'speed_bonus' | 'streak_multiplier';
}): {
  pointsEarned: number;
  newStreak: number;
  timedOut: boolean;
} {
  const { isCorrect, basePoints, timeLimitSeconds, elapsedSeconds, currentStreak, scoringMethod } = params;
  // Allow 1.5s network grace window on server deadline check
  if (elapsedSeconds > timeLimitSeconds + 1.5) {
    return {
      pointsEarned: 0,
      newStreak: 0,
      timedOut: true,
    };
  }

  if (!isCorrect) {
    return {
      pointsEarned: 0,
      newStreak: 0,
      timedOut: false,
    };
  }

  const newStreak = currentStreak + 1;
  let points = Math.max(10, basePoints);

  if (scoringMethod === 'speed_bonus') {
    const clampedElapsed = Math.max(0, Math.min(timeLimitSeconds, elapsedSeconds));
    const speedRatio = timeLimitSeconds > 0 ? 1 - clampedElapsed / timeLimitSeconds : 0;
    const speedBonus = Math.round(points * 0.5 * speedRatio);
    points += speedBonus;
  } else if (scoringMethod === 'streak_multiplier') {
    const streakMultiplier = Math.min(2.0, 1 + (newStreak - 1) * 0.15);
    points = Math.round(points * streakMultiplier);
  }

  return {
    pointsEarned: points,
    newStreak,
    timedOut: false,
  };
}

/**
 * Evaluates newly unlocked achievements for a user based on their stats and watch count.
 */
export function evaluateNewAchievements(
  user: UserAccount,
  watchedItemsCount: number,
  definitions: AchievementDefinition[] = DEFAULT_ACHIEVEMENTS
): AchievementDefinition[] {
  const existingSet = new Set(user.achievements);
  const newlyUnlocked: AchievementDefinition[] = [];

  for (const def of definitions) {
    if (existingSet.has(def.achievementId)) continue;

    let met = false;
    switch (def.conditionType) {
      case 'first_explore':
        met = watchedItemsCount >= def.threshold || user.stats.gamesPlayed >= def.threshold;
        break;
      case 'legends_watched':
        met = user.stats.gamesPlayed >= def.threshold;
        break;
      case 'mythology_master':
        met = user.stats.totalXp >= def.threshold;
        break;
      case 'perfect_quizzes':
        met = user.stats.bestStreak >= def.threshold;
        break;
      case 'weekly_champion':
        met = user.stats.gamesWon >= def.threshold;
        break;
      case 'traditions_expert':
        met = user.stats.gamesPlayed >= 5 && user.stats.accuracyPercent >= def.threshold;
        break;
    }

    if (met) {
      newlyUnlocked.push(def);
    }
  }

  return newlyUnlocked;
}

/**
 * Sorts leaderboard entries deterministically by points, then XP, then accuracy.
 */
export function sortLeaderboardEntries(
  entries: LeaderboardEntry[],
  scope: 'global' | 'weekly' | 'monthly' | 'country' | 'school',
  filterValue?: string
): LeaderboardEntry[] {
  let filtered = [...entries];
  if (scope === 'country' && filterValue) {
    filtered = filtered.filter((e) => e.country.toLowerCase() === filterValue.toLowerCase());
  } else if (scope === 'school' && filterValue) {
    filtered = filtered.filter((e) => (e.school || '').toLowerCase() === filterValue.toLowerCase());
  }

  return filtered.sort((a, b) => {
    const scoreA = scope === 'weekly' ? a.weeklyPoints : scope === 'monthly' ? a.monthlyPoints : a.totalPoints;
    const scoreB = scope === 'weekly' ? b.weeklyPoints : scope === 'monthly' ? b.monthlyPoints : b.totalPoints;
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
    return b.accuracyPercent - a.accuracyPercent;
  });
}
