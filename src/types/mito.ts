export type UserRole = 'super_admin' | 'user';

export type AccountStatus = 'active' | 'suspended' | 'revoked' | 'expired' | 'not_activated';

export type AccessPresetId = 'demo' | 'viewer' | 'gamer' | 'full' | 'custom';

export interface AccessPolicy {
  preset: AccessPresetId;
  // Time control
  validFrom?: string | null;
  expiresAt?: string | null;
  accessDurationMinutes?: number | null; // Begins on first login
  maxSessionDurationMinutes?: number | null;
  dailyUsageAllowanceMinutes?: number | null;
  manualExpiryOverride?: boolean;
  // Content permissions
  contentScope: 'all' | 'selected_content' | 'selected_categories';
  allowedContentIds: string[];
  allowedCategoryIds: string[];
  maxAvailableTitles?: number | null;
  maxPlaybackSecondsPerItem?: number | null;
  permittedStartSecond?: number | null;
  permittedEndSecond?: number | null;
  maxViewsPerItem?: number | null;
  restrictedEpisodeIds: string[];
  streamingEnabled: boolean;
  shortsEnabled: boolean;
  // Game permissions
  soloGamesEnabled: boolean;
  quizzesEnabled: boolean;
  localMultiplayerEnabled: boolean;
  globalChallengesEnabled: boolean;
  allowedGameIds: string[]; // Empty means all if enabled, or specific IDs if restrictedGameScope
  restrictSelectedGames: boolean;
  dailyGameSessionLimit?: number | null;
  // Device & session control
  maxConcurrentSessions: number;
  maxPermittedDevices: number;
}

export interface UserStats {
  totalXp: number;
  totalPoints: number;
  gamesPlayed: number;
  gamesWon: number;
  correctAnswers: number;
  totalAnswers: number;
  accuracyPercent: number;
  currentStreak: number;
  bestStreak: number;
  rank: number;
  country: string;
  school?: string;
  watchedSecondsToday: number;
  gameSessionsToday: number;
  lastActivityDate: string; // YYYY-MM-DD
}

export interface UserAccount {
  uid: string;
  codeHash: string;
  codeSalt: string;
  maskedCode: string; // e.g. "***-***-756"
  fullCode?: string; // e.g. "482-915-756" (Always visible to Super Admin)
  role: UserRole;
  status: AccountStatus;
  displayName: string;
  avatar: string;
  createdAt: string;
  firstLoginAt?: string | null;
  accessActivatedAt?: string | null;
  lastLoginAt?: string | null;
  accessPolicy: AccessPolicy;
  stats: UserStats;
  achievements: string[];
  likedShortIds: string[];
  savedContentIds: string[];
  recentActivity: Array<{
    id: string;
    type: 'watch' | 'short' | 'game' | 'achievement' | 'login';
    title: string;
    timestamp: string;
    detail?: string;
  }>;
}

export type ContentCategoryType =
  | 'legend'
  | 'history'
  | 'documentary'
  | 'folklore'
  | 'mythology'
  | 'tradition'
  | 'series'
  | 'episode'
  | 'collection';

export type VideoFormat = 'short' | 'standard';
export type PublicationStatus = 'draft' | 'published' | 'archived';
export type MediaProcessingStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'ready'
  | 'failed'
  | 'archived';

export interface SubtitleTrack {
  id: string;
  lang: string;
  label: string;
  vttUrl: string;
  vttContent?: string;
}

export interface HeritageProvenance {
  sourceReferences: string;
  bibliography: string;
  storyteller: string;
  regionOfOrigin: string;
  dialect: string;
  recordingDate: string;
  consentStatus: 'verified' | 'pending' | 'public_domain';
  rightsAndLicensing: string;
  editorialNotes: string;
  verifiedHistoricalFact: boolean;
}

export interface WatchToUnlockConfig {
  enabled: boolean;
  requiredCompletionPercent: number;
  mandatoryForAllGames: boolean;
}

export interface VideoContent {
  contentId: string;
  title: string;
  slug: string;
  synopsis: string;
  description: string;
  type: ContentCategoryType;
  videoFormat: VideoFormat;
  videoContainer: 'mp4';
  aspectRatio: number;
  width: number;
  height: number;
  durationSeconds: number;
  resolution: string;
  codec: string;
  audioCodec: string;
  fileSizeBytes: number;
  storagePath: string;
  thumbnailUrl: string;
  posterUrl: string;
  heroUrl: string;
  trailerUrl?: string;
  playbackUrl: string;
  processingStatus: MediaProcessingStatus;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'ready' | 'failed';
  captions: SubtitleTrack[];
  publicationStatus: PublicationStatus;
  linkedContentId?: string;
  relatedStoryIds: string[];
  relatedGameIds: string[];
  categoryIds: string[];
  tags: string[];
  language: string;
  region: string;
  featured: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  seriesId?: string;
  cropMode: 'preserve' | 'crop_9_16';
  creatorAttribution?: string;
  watchToUnlock: WatchToUnlockConfig;
  provenance: HeritageProvenance;
  viewsCount: number;
  likesCount: number;
  savesCount: number;
  totalWatchDurationSeconds: number;
  completionCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  driveFolderId?: string;
  driveFolderUrl?: string;
  driveVideoFileId?: string;
  driveCoverFileId?: string;
  lastDriveSyncAt?: string;
}

export interface CategoryItem {
  categoryId: string;
  name: string;
  slug: string;
  description: string;
  iconName: string;
  order: number;
  createdAt: string;
}

export interface EpisodeItem {
  episodeId: string;
  seriesContentId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string;
  durationSeconds: number;
  videoAssetId?: string;
  playbackUrl: string;
  thumbnailUrl: string;
  publicationStatus: PublicationStatus;
  createdAt: string;
}

export interface MediaAsset {
  assetId: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  videoFormat?: VideoFormat;
  width?: number;
  height?: number;
  aspectRatio?: number;
  durationSeconds?: number;
  resolution?: string;
  codec?: string;
  audioCodec?: string;
  storagePath: string;
  publicUrl: string;
  processingStatus: MediaProcessingStatus;
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'ready' | 'failed';
  relatedContentId?: string;
  cloudChunkCount?: number;
  autoThumbnailUrl?: string;
  uploadedByUid: string;
  createdAt: string;
  updatedAt: string;
  driveFileId?: string;
  driveFolderId?: string;
}

export type GameType =
  | 'quiz_battle'
  | 'true_false'
  | 'guess_legend'
  | 'image_recognition'
  | 'memory_match'
  | 'speed_round'
  | 'multiple_choice'
  | 'chronological_order'
  | 'cultural_knowledge';

export interface GameQuestionPublic {
  questionId: string;
  gameId: string;
  order: number;
  questionText: string;
  imageUrl?: string;
  audioUrl?: string;
  choices: string[];
  timeLimitSeconds: number;
  points: number;
}

export interface GameQuestionFull extends GameQuestionPublic {
  correctChoiceIndex: number;
  explanation: string;
}

export interface GameItem {
  gameId: string;
  title: string;
  description: string;
  coverImageUrl: string;
  instructions: string;
  gameType: GameType;
  difficulty: 'lehtë' | 'mesatare' | 'vështirë' | 'mjeshtër';
  maxPlayers: number;
  questionCount: number;
  timePerQuestionSeconds: number;
  scoringMethod: 'standard' | 'speed_bonus' | 'streak_multiplier';
  xpReward: number;
  categoryId?: string;
  linkedContentId?: string;
  requireWatchToUnlock: boolean;
  requiredWatchPercent: number;
  challengePeriod?: 'none' | 'daily' | 'weekly' | 'monthly' | 'tournament';
  availableFrom?: string;
  availableUntil?: string;
  publicationStatus: PublicationStatus;
  playsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WatchedSegment {
  start: number;
  end: number;
}

export interface PlaybackProgressRecord {
  progressId: string;
  userId: string;
  contentId: string;
  videoFormat: VideoFormat;
  currentTimeSeconds: number;
  durationSeconds: number;
  watchedSegments: WatchedSegment[];
  uniqueWatchedSeconds: number;
  completionPercent: number;
  unlockedGame: boolean;
  viewsCount: number;
  updatedAt: string;
}

export interface MultiplayerPlayer {
  playerId: string;
  nickname: string;
  avatar: string;
  score: number;
  streak: number;
  correctCount: number;
  connected: boolean;
  lastAnsweredQuestionIndex: number;
  lastAnswerCorrect?: boolean;
  lastPointsEarned?: number;
  joinedAt: string;
}

export interface MultiplayerRoom {
  roomCode: string;
  gameId: string;
  gameTitle: string;
  hostUserId: string;
  status: 'lobby' | 'question' | 'reveal' | 'finished' | 'terminated';
  maxPlayers: number;
  currentQuestionIndex: number;
  questionStartedAt?: number;
  questionDeadlineAt?: number;
  players: MultiplayerPlayer[];
  currentQuestionPublic?: GameQuestionPublic | null;
  revealedCorrectIndex?: number | null;
  revealedExplanation?: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface LeaderboardEntry {
  entryId: string;
  userId: string;
  displayName: string;
  avatar: string;
  maskedCode: string;
  totalXp: number;
  totalPoints: number;
  gamesPlayed: number;
  gamesWon: number;
  accuracyPercent: number;
  currentStreak: number;
  country: string;
  school?: string;
  weeklyPoints: number;
  monthlyPoints: number;
  flaggedSuspicious?: boolean;
  updatedAt: string;
}

export interface AchievementDefinition {
  achievementId: string;
  title: string;
  description: string;
  iconName: string;
  xpBonus: number;
  conditionType: 'first_explore' | 'legends_watched' | 'mythology_master' | 'perfect_quizzes' | 'weekly_champion' | 'traditions_expert';
  threshold: number;
}

export interface AuditLogEntry {
  logId: string;
  timestamp: string;
  actorUid: string;
  actorRole: string;
  action: string;
  targetId?: string;
  ipAddress?: string;
  details: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface DualVideoAnalytics {
  totalShortsUploads: number;
  totalStandardUploads: number;
  totalShortsViews: number;
  totalStandardViews: number;
  averageShortsWatchDurationSeconds: number;
  averageStandardCompletionPercent: number;
  mostViewedShorts: Array<{
    contentId: string;
    title: string;
    viewsCount: number;
    likesCount: number;
    avgWatchSeconds: number;
    aspectRatio: number;
    resolution: string;
  }>;
  mostViewedStandardVideos: Array<{
    contentId: string;
    title: string;
    viewsCount: number;
    completionCount: number;
    avgCompletionPercent: number;
    resolution: string;
  }>;
}

export interface DeviceActivityItem {
  id?: string;
  activityId?: string;
  type: 'watch' | 'short' | 'game' | 'login' | 'support' | 'video_watch' | 'short_watch' | 'game_play';
  title: string;
  targetId?: string;
  detail?: string;
  details?: string;
  timestamp: string;
  timeOfDay: string;
  watchedSeconds?: number;
  completionPercent?: number;
}

export interface UserDeviceSession {
  sessionId: string;
  userId: string;
  deviceId: string;
  deviceLabel: string;
  userAgent: string;
  ipAddress: string;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revoked: boolean;
  isBanned?: boolean;
  activityLog: DeviceActivityItem[];
}

export interface BannedDeviceRecord {
  banId?: string;
  deviceId: string;
  userId?: string;
  deviceLabel: string;
  userAgent: string;
  ipAddress: string;
  bannedAt: string;
  bannedByUid?: string;
  reason: string;
}

export type SupportTicketStatus =
  | 'ai_active'
  | 'human_requested'
  | 'human_active'
  | 'admin_active'
  | 'resolved';

export interface SupportChatMessage {
  messageId: string;
  ticketId?: string;
  senderRole: 'user' | 'ai' | 'admin' | 'agent' | 'system';
  senderName: string;
  text: string;
  timestamp?: string;
  createdAt?: string;
}

export interface SupportTicket {
  ticketId: string;
  userId: string;
  userDisplayName: string;
  userCode?: string;
  userMaskedCode?: string;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
  unreadByAdmin?: number;
  unreadByUser?: number;
  messages: SupportChatMessage[];
}


