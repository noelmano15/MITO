import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  Film,
  Smartphone,
  FolderKanban,
  Layers,
  HardDrive,
  Gamepad2,
  Users,
  ShieldAlert,
  Radio,
  Trophy,
  BarChart3,
  Settings,
  LogOut,
  Plus,
  Trash2,
  KeyRound,
  Copy,
  Check,
  Sparkles,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Clock,
  Lock,
  Wand2,
  RotateCcw,
  Search,
  X,
  Eye,
  EyeOff,
  Edit3,
  FolderSync,
  Headphones,
  Monitor,
  Ban,
  Unlock,
  Send,
  Bot,
  UserCheck,
  Activity,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { DualVideoUploadModal } from './DualVideoUploadModal';
import { apiFetch } from '../utils/sessionToken';
import { formatAccessCodeInput } from '../utils/accessCode';
import type {
  UserAccount,
  VideoContent,
  CategoryItem,
  EpisodeItem,
  MediaAsset,
  GameItem,
  GameQuestionFull,
  MultiplayerRoom,
  LeaderboardEntry,
  AuditLogEntry,
  DualVideoAnalytics,
  AccessPresetId,
  GameType,
  UserDeviceSession,
  BannedDeviceRecord,
  SupportTicket,
} from '../types/mito';

export type AdminTabId =
  | 'dashboard'
  | 'content'
  | 'categories'
  | 'episodes'
  | 'media'
  | 'games'
  | 'users'
  | 'access'
  | 'support'
  | 'multiplayer'
  | 'leaderboards'
  | 'analytics'
  | 'settings';

interface AdminDashboardViewProps {
  user: UserAccount;
  initialTab?: AdminTabId;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  onCatalogChanged: () => void;
}

interface OverviewPayload {
  stats: {
    publishedContentCount: number;
    draftContentCount: number;
    totalUsersCount: number;
    activeUsersCount: number;
    expiredUsersCount: number;
    totalGamesCount: number;
    completedGameSessionsCount: number;
    totalStreamingViews: number;
    activeMultiplayerRoomsCount: number;
  };
  dualVideoAnalytics: DualVideoAnalytics;
  content: VideoContent[];
  categories: CategoryItem[];
  episodes: EpisodeItem[];
  mediaAssets: MediaAsset[];
  games: GameItem[];
  gameQuestions: GameQuestionFull[];
  users: UserAccount[];
  multiplayerRooms: MultiplayerRoom[];
  leaderboardEntries: LeaderboardEntry[];
  auditLogs: AuditLogEntry[];
  siteSettings: {
    platformName: string;
    tagline: string;
    subTagline: string;
    defaultLanguage: string;
    featuredBannerContentId?: string;
    maxUploadSizeMb: number;
    defaultWatchToUnlockPercent: number;
    schoolRankingsEnabled: boolean;
    watermarkEnabled: boolean;
    maintenanceMode: boolean;
  };
  supportTickets?: SupportTicket[];
  bannedDevices?: BannedDeviceRecord[];
}

const DEFAULT_OVERVIEW_DATA: OverviewPayload = {
  stats: {
    publishedContentCount: 0,
    draftContentCount: 0,
    totalUsersCount: 0,
    activeUsersCount: 0,
    expiredUsersCount: 0,
    totalGamesCount: 0,
    completedGameSessionsCount: 0,
    totalStreamingViews: 0,
    activeMultiplayerRoomsCount: 0,
  },
  dualVideoAnalytics: {
    totalShortsUploads: 0,
    totalStandardUploads: 0,
    totalShortsViews: 0,
    totalStandardViews: 0,
    averageShortsWatchDurationSeconds: 0,
    averageStandardCompletionPercent: 0,
    mostViewedShorts: [],
    mostViewedStandardVideos: [],
  },
  content: [],
  categories: [],
  episodes: [],
  mediaAssets: [],
  games: [],
  gameQuestions: [],
  users: [],
  multiplayerRooms: [],
  leaderboardEntries: [],
  auditLogs: [],
  siteSettings: {
    platformName: 'MITO',
    tagline: 'LEGJENDA · HISTORI · LOJËRA',
    subTagline: 'Shiko. Mëso. Luaj. Konkuro.',
    defaultLanguage: 'sq',
    maxUploadSizeMb: 2048,
    defaultWatchToUnlockPercent: 80,
    schoolRankingsEnabled: true,
    watermarkEnabled: true,
    maintenanceMode: false,
  },
  supportTickets: [],
  bannedDevices: [],
};

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  user,
  initialTab = 'dashboard',
  onNavigate,
  onLogout,
  onCatalogChanged,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTabId>(initialTab);
  const [data, setData] = useState<OverviewPayload>(DEFAULT_OVERVIEW_DATA);
  const [loading, setLoading] = useState(true);
  const [seedingPack, setSeedingPack] = useState(false);
  const [errorSq, setErrorSq] = useState<string | null>(null);
  const [successBannerSq, setSuccessBannerSq] = useState<string | null>(null);

  // Dual Video Upload / Google Drive Sync & Content Editor Modal state
  const [uploadModalMode, setUploadModalMode] = useState<'select' | 'short' | 'standard' | null>(
    null
  );
  const [editingContentItem, setEditingContentItem] = useState<VideoContent | null>(null);
  const [syncingDriveQuick, setSyncingDriveQuick] = useState(false);
  const [contentFilter, setContentFilter] = useState<'all' | 'short' | 'standard'>('all');

  // Category Form state
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catDesc, setCatDesc] = useState('');

  // Episode Form state
  const [epSeriesId, setEpSeriesId] = useState('');
  const [epSeason, setEpSeason] = useState(1);
  const [epNumber, setEpNumber] = useState(1);
  const [epTitle, setEpTitle] = useState('');
  const [epSynopsis, setEpSynopsis] = useState('');
  const [epDuration] = useState(900);

  // Game & Question Builder state
  const [gameTitle, setGameTitle] = useState('');
  const [gameDesc, setGameDesc] = useState('');
  const [gameType, setGameType] = useState<GameType>('quiz_battle');
  const [gameDifficulty] = useState<'lehtë' | 'mesatare' | 'vështirë' | 'mjeshtër'>('mesatare');
  const [gameLinkedContentId, setGameLinkedContentId] = useState('');
  const [gameRequireUnlock, setGameRequireUnlock] = useState(false);
  const [gameRequiredPercent, setGameRequiredPercent] = useState(0);
  const [gameTimePerQuestion] = useState(20);
  const [gameScoringMethod] = useState<'standard' | 'speed_bonus' | 'streak_multiplier'>('speed_bonus');
  const [gameXpReward] = useState(250);
  const [draftQuestions, setDraftQuestions] = useState<
    Array<{
      questionText: string;
      choices: string[];
      correctChoiceIndex: number;
      explanation: string;
      points: number;
    }>
  >([
    {
      questionText: 'Në cilin qytet ndodhet Kalaja e Rozafës?',
      choices: ['Shkodër', 'Berat', 'Krujë', 'Gjirokastër'],
      correctChoiceIndex: 0,
      explanation: 'Kalaja e Rozafës ngrihet mbi një kodër shkëmbore në hyrje të qytetit të Shkodrës.',
      points: 100,
    },
  ]);

  // AI Assistant state
  const [aiSourceText, setAiSourceText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiNoticeSq, setAiNoticeSq] = useState<string | null>(null);

  // User Creation & Access Policy state
  const [newUserName, setNewUserName] = useState('');
  const [newUserCustomCode, setNewUserCustomCode] = useState('');
  const [newUserCountry, setNewUserCountry] = useState('Shqipëri');
  const [newUserSchool, setNewUserSchool] = useState('');
  const [newUserPreset, setNewUserPreset] = useState<AccessPresetId>('full');
  const [customDurationMin, setCustomDurationMin] = useState<number>(60);
  const [customDailyMin, setCustomDailyMin] = useState<number>(120);
  const [customStreamingEnabled, setCustomStreamingEnabled] = useState(true);
  const [customShortsEnabled, setCustomShortsEnabled] = useState(true);
  const [customGamesEnabled, setCustomGamesEnabled] = useState(true);
  const [customMultiplayerEnabled, setCustomMultiplayerEnabled] = useState(true);
  const [customMaxTitles] = useState<number | null>(null);
  const [oneTimeGeneratedCode, setOneTimeGeneratedCode] = useState<{
    userName: string;
    code: string;
  } | null>(null);
  const [copiedUserCode, setCopiedUserCode] = useState(false);
  const [copiedUidCode, setCopiedUidCode] = useState<string | null>(null);

  // User Search & Filter state
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'suspended' | 'expired'>('all');

  // Selected user for granular access editing in Access Control tab
  const [selectedUserIdForPolicy, setSelectedUserIdForPolicy] = useState<string>('');
  const [policySavedBanner, setPolicySavedBanner] = useState(false);

  // User Sessions & Devices Inspector Modal state
  const [sessionsModalUser, setSessionsModalUser] = useState<UserAccount | null>(null);
  const [userDeviceSessions, setUserDeviceSessions] = useState<UserDeviceSession[]>([]);
  const [userBannedDevices, setUserBannedDevices] = useState<BannedDeviceRecord[]>([]);
  const [loadingSessionsModal, setLoadingSessionsModal] = useState(false);

  // Support Live Chat (Admin) state
  const [selectedSupportTicketId, setSelectedSupportTicketId] = useState<string>('');
  const [adminSupportReplyText, setAdminSupportReplyText] = useState('');
  const [sendingSupportReply, setSendingSupportReply] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccessBannerSq(msg);
    setTimeout(() => setSuccessBannerSq(null), 5000);
  };

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setErrorSq(null);
    try {
      const res = await apiFetch('/api/admin/overview');
      const json = await res.json();
      if (!res.ok) {
        setErrorSq(json.error || 'Nuk u arrit ngarkimi i të dhënave të panelit administrativ.');
        setLoading(false);
        return;
      }
      setData(json);
      if (json.users?.length > 0 && !selectedUserIdForPolicy) {
        setSelectedUserIdForPolicy(json.users[0].uid);
      }
    } catch {
      setErrorSq('Gabim rrjeti gjatë komunikimit me serverin MITO.');
    } finally {
      setLoading(false);
    }
  }, [selectedUserIdForPolicy]);

  const fetchSupportTicketsSilently = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/support/tickets');
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.tickets)) {
          setData((prev) => ({
            ...prev,
            supportTickets: json.tickets,
          }));
        }
      }
    } catch {
      // Ignore transient background poll errors
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    // Fast real-time refresh for Support Live Chat & Admin dashboard (1s on support tab, 2s elsewhere)
    const pollIntervalMs = activeTab === 'support' ? 1000 : 2000;
    const interval = window.setInterval(() => {
      fetchSupportTicketsSilently();
    }, pollIntervalMs);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        fetchSupportTicketsSilently();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let unmounted = false;

    const connectWs = () => {
      if (unmounted) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${window.location.host}/ws`);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data));
            if (msg.type === 'support:update') {
              fetchSupportTicketsSilently();
            }
          } catch {
            // Ignore non-JSON ws frames
          }
        };
        ws.onclose = () => {
          if (!unmounted) {
            reconnectTimer = window.setTimeout(connectWs, 1500);
          }
        };
      } catch {
        // Fallback to fast interval polling
      }
    };
    connectWs();

    return () => {
      unmounted = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // Ignore close errors
        }
      }
    };
  }, [activeTab, fetchSupportTicketsSilently]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleSelectTab = (tab: AdminTabId) => {
    setActiveTab(tab);
    const nextPath = tab === 'dashboard' ? '/admin' : `/admin/${tab}`;
    window.history.pushState({}, '', nextPath);
  };

  // =========================================================
  // 1-CLICK STARTER PACK & RESET HANDLERS
  // =========================================================

  const handleSeedStarterPack = async () => {
    setSeedingPack(true);
    setErrorSq(null);
    try {
      const res = await apiFetch('/api/admin/seed-heritage-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorSq(json.error || 'Dështoi ngarkimi i paketës fillestare.');
        setSeedingPack(false);
        return;
      }
      await fetchOverview();
      onCatalogChanged();
      showSuccess(
        json.messageSq ||
          'Paketa Fillestare Kulturore u ngarkua me sukses! (Video 16:9, Short 9:16, Kategori, Kuiz dhe Përdorues Demo 222-333-444)'
      );
    } catch {
      setErrorSq('Gabim rrjeti gjatë ngarkimit të paketës fillestare.');
    } finally {
      setSeedingPack(false);
    }
  };

  const handleResetEmpty = async () => {
    setSeedingPack(true);
    setErrorSq(null);
    try {
      const res = await apiFetch('/api/admin/reset-empty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        await fetchOverview();
        onCatalogChanged();
        showSuccess('Platforma u pastrua në gjendjen fillestare (0 përmbajtje, 0 lojëra, 0 përdorues).');
      }
    } catch {
      setErrorSq('Gabim gjatë pastrimit të platformës.');
    } finally {
      setSeedingPack(false);
    }
  };

  // =========================================================
  // HANDLERS
  // =========================================================

  const handleQuickGoogleDriveSync = async () => {
    setSyncingDriveQuick(true);
    setErrorSq(null);
    try {
      const res = await apiFetch('/api/admin/drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderUrlOrId:
            'https://drive.google.com/drive/folders/1nuao4j4D1a2ZO6cN_WoHBwWOPMbmFbq5?usp=drive_link',
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorSq(json.error || 'Dështoi sinkronizimi me dosjen e Google Drive.');
        return;
      }
      await fetchOverview();
      onCatalogChanged();
      showSuccess(
        json.messageSq ||
          'Videot dhe kopertinat nga dosja e Google Drive u sinkronizuan me sukses!'
      );
    } catch {
      setErrorSq('Gabim rrjeti gjatë sinkronizimit me Google Drive.');
    } finally {
      setSyncingDriveQuick(false);
    }
  };

  const handleToggleContentVisibility = async (contentId: string) => {
    setErrorSq(null);
    try {
      const res = await apiFetch(
        `/api/admin/content/${encodeURIComponent(contentId)}/toggle-visibility`,
        {
          method: 'POST',
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorSq(json.error || 'Nuk u arrit ndryshimi i dukshmërisë së videos.');
        return;
      }
      await fetchOverview();
      onCatalogChanged();
      showSuccess(
        json.publicationStatus === 'published'
          ? 'Videoja tani është E SHFAQUR (Publikuar) për përdoruesit!'
          : 'Videoja tani është E FSHEHUR (Draft) nga katalogu publik.'
      );
    } catch {
      setErrorSq('Gabim rrjeti gjatë ndryshimit të dukshmërisë.');
    }
  };

  const handleDeleteContent = async (contentId: string) => {
    setErrorSq(null);
    // Optimistically remove from UI immediately
    setData((prev) => ({
      ...prev,
      content: prev.content.filter((c) => c.contentId !== contentId),
    }));
    try {
      const res = await apiFetch(`/api/admin/content/${encodeURIComponent(contentId)}/delete`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setErrorSq(errData.error || 'Gabim gjatë fshirjes së përmbajtjes.');
      } else {
        showSuccess('Përmbajtja u fshi me sukses nga platforma.');
      }
      await fetchOverview();
      onCatalogChanged();
    } catch {
      setErrorSq('Gabim rrjeti gjatë fshirjes së përmbajtjes.');
      await fetchOverview();
    }
  };

  const handleDeleteAllContent = async () => {
    setErrorSq(null);
    setData((prev) => ({
      ...prev,
      content: [],
      episodes: [],
      mediaAssets: [],
    }));
    try {
      const res = await apiFetch('/api/admin/content-clear-all', { method: 'POST' });
      if (res.ok) {
        showSuccess('Të gjitha videot dhe përmbajtjet u fshinë nga platforma.');
      }
      await fetchOverview();
      onCatalogChanged();
    } catch {
      setErrorSq('Gabim gjatë fshirjes së përmbajtjeve.');
      await fetchOverview();
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = catName.trim() || 'Legjenda Shqiptare';
    const finalDesc =
      catDesc.trim() || 'Rrëfime epike, kështjella historike dhe besa shqiptare.';
    try {
      const res = await apiFetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: finalName,
          slug: catSlug.trim() || undefined,
          description: finalDesc,
        }),
      });
      if (res.ok) {
        setCatName('');
        setCatSlug('');
        setCatDesc('');
        await fetchOverview();
        onCatalogChanged();
        showSuccess(`Kategoria "${finalName}" u krijua me sukses!`);
      }
    } catch {
      // Ignore
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    setData((prev) => ({
      ...prev,
      categories: prev.categories.filter((c) => c.categoryId !== categoryId),
    }));
    await apiFetch(`/api/admin/categories/${encodeURIComponent(categoryId)}/delete`, {
      method: 'POST',
    });
    await fetchOverview();
    onCatalogChanged();
    showSuccess('Kategoria u fshi me sukses.');
  };

  const handleCreateEpisode = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSeriesId =
      epSeriesId || data.content.find((c) => c.videoFormat === 'standard')?.contentId || '';
    if (!targetSeriesId) {
      setErrorSq('Ngarkoni fillimisht të paktën një Video Standarde 16:9 ose klikoni "Ngarko Paketën Fillestare".');
      return;
    }
    const finalEpTitle = epTitle.trim() || `Pjesa ${epNumber}: Themelet e Kalasë`;
    const res = await apiFetch('/api/admin/episodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        seriesContentId: targetSeriesId,
        seasonNumber: epSeason,
        episodeNumber: epNumber,
        title: finalEpTitle,
        synopsis: epSynopsis.trim() || 'Episod i ri në serinë e trashëgimisë kulturore shqiptare.',
        durationSeconds: epDuration,
      }),
    });
    if (res.ok) {
      setEpTitle('');
      setEpSynopsis('');
      setEpNumber((n) => n + 1);
      await fetchOverview();
      onCatalogChanged();
      showSuccess(`Episodi "${finalEpTitle}" u shtua me sukses!`);
    }
  };

  const handleDeleteEpisode = async (episodeId: string) => {
    setData((prev) => ({
      ...prev,
      episodes: prev.episodes.filter((ep) => ep.episodeId !== episodeId),
    }));
    await apiFetch(`/api/admin/episodes/${encodeURIComponent(episodeId)}/delete`, {
      method: 'POST',
    });
    await fetchOverview();
    onCatalogChanged();
    showSuccess('Episodi u fshi me sukses.');
  };

  const handleDeleteMediaAsset = async (assetId: string) => {
    setErrorSq(null);
    setData((prev) => ({
      ...prev,
      mediaAssets: prev.mediaAssets.filter((a) => a.assetId !== assetId),
    }));
    const res = await apiFetch(`/api/admin/media/${encodeURIComponent(assetId)}/delete`, {
      method: 'POST',
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErrorSq(json.error || 'Ky skedar nuk mund të fshihet.');
      await fetchOverview();
      return;
    }
    await fetchOverview();
    onCatalogChanged();
    showSuccess('Skedari media dhe përmbajtja e lidhur u fshinë me sukses.');
  };

  const handleAddDraftQuestion = () => {
    setDraftQuestions((prev) => [
      ...prev,
      {
        questionText: '',
        choices: ['', '', '', ''],
        correctChoiceIndex: 0,
        explanation: '',
        points: 100,
      },
    ]);
  };

  const handleSaveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalGameTitle = gameTitle.trim() || 'Kuizi i Legjendës së Rozafës';
    const finalGameDesc =
      gameDesc.trim() || 'Testoni njohuritë tuaja mbi historinë dhe besën shqiptare.';

    let validQuestions = draftQuestions.filter((q) => q.questionText.trim().length > 0);
    if (validQuestions.length === 0) {
      validQuestions = [
        {
          questionText: 'Në cilin qytet ndodhet Kalaja e Rozafës?',
          choices: ['Shkodër', 'Berat', 'Krujë', 'Gjirokastër'],
          correctChoiceIndex: 0,
          explanation: 'Kalaja e Rozafës ngrihet mbi një kodër shkëmbore në hyrje të Shkodrës.',
          points: 100,
        },
        {
          questionText: ' Çfarë përfaqëson Besa në traditën shqiptare?',
          choices: [
            'Fjalën e nderit dhe premtimin e shenjtë që nuk thyhet kurrë',
            'Një këngë feste',
            'Një lloj veshjeje',
            'Një dokument tregtar',
          ],
          correctChoiceIndex: 0,
          explanation: 'Besa është institucioni moral më i lartë i fjalës së dhënë.',
          points: 100,
        },
      ];
    }

    const res = await apiFetch('/api/admin/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: finalGameTitle,
        description: finalGameDesc,
        gameType,
        difficulty: gameDifficulty,
        linkedContentId: gameLinkedContentId || undefined,
        requireWatchToUnlock: gameLinkedContentId ? gameRequireUnlock : false,
        requiredWatchPercent: gameRequiredPercent,
        timePerQuestionSeconds: gameTimePerQuestion,
        scoringMethod: gameScoringMethod,
        xpReward: gameXpReward,
        publicationStatus: 'published',
        questions: validQuestions,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setErrorSq(json.error || 'Gabim gjatë ruajtjes së lojës.');
      return;
    }

    setGameTitle('');
    setGameDesc('');
    await fetchOverview();
    onCatalogChanged();
    showSuccess(`Loja "${finalGameTitle}" u publikua me sukses!`);
  };

  const handleDeleteGame = async (gameId: string) => {
    setData((prev) => ({
      ...prev,
      games: prev.games.filter((g) => g.gameId !== gameId),
    }));
    await apiFetch(`/api/admin/games/${encodeURIComponent(gameId)}/delete`, {
      method: 'POST',
    });
    await fetchOverview();
    onCatalogChanged();
    showSuccess('Loja u fshi me sukses.');
  };

  const handleAiGenerateQuestions = async () => {
    const sourceText =
      aiSourceText.trim() ||
      'Legjenda e Kalasë së Rozafës në Shkodër dhe Besa e Konstandinit në traditën shqiptare.';
    setAiLoading(true);
    setAiNoticeSq(null);
    setErrorSq(null);
    try {
      const res = await apiFetch('/api/admin/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'generate_quiz',
          inputText: sourceText,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorSq(json.error || 'Asistenti AI nuk u përgjigj.');
        return;
      }
      if (Array.isArray(json.questions) && json.questions.length > 0) {
        setDraftQuestions(
          json.questions.map((q: any) => ({
            questionText: String(q.questionText || ''),
            choices: Array.isArray(q.choices) ? q.choices.slice(0, 4) : ['Po', 'Jo', '', ''],
            correctChoiceIndex: Number(q.correctChoiceIndex || 0),
            explanation: String(q.explanation || ''),
            points: 100,
          }))
        );
        setAiNoticeSq(json.draftNoticeSq);
        if (!gameTitle.trim()) {
          setGameTitle('Kuizi i Trashëgimisë Shqiptare');
        }
      }
    } catch {
      setErrorSq('Gabim gjatë thirrjes së Asistentit AI.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = newUserName.trim() || `Vizitor MITO #${data.users.length + 1}`;
    setErrorSq(null);

    const customOverrides =
      newUserPreset === 'custom'
        ? {
            accessDurationMinutes: customDurationMin || null,
            dailyUsageAllowanceMinutes: customDailyMin || null,
            streamingEnabled: customStreamingEnabled,
            shortsEnabled: customShortsEnabled,
            soloGamesEnabled: customGamesEnabled,
            quizzesEnabled: customGamesEnabled,
            localMultiplayerEnabled: customMultiplayerEnabled,
            maxAvailableTitles: customMaxTitles || null,
          }
        : undefined;

    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: finalName,
        country: newUserCountry.trim() || 'Shqipëri',
        school: newUserSchool.trim(),
        preset: newUserPreset,
        accessPolicy: customOverrides,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setErrorSq(json.error || 'Nuk u krijua llogaria.');
      return;
    }

    setNewUserName('');
    setOneTimeGeneratedCode({
      userName: json.user.displayName,
      code: json.oneTimeFormattedCode,
    });
    await fetchOverview();
    showSuccess(
      `U krijua përdoruesi "${json.user.displayName}" me kodin: ${json.oneTimeFormattedCode}`
    );
  };

  const handleRegenerateUserCode = async (uid: string, displayName: string) => {
    const res = await apiFetch(`/api/admin/users/${uid}/regenerate-code`, {
      method: 'POST',
    });
    const json = await res.json();
    if (res.ok && json.oneTimeFormattedCode) {
      setOneTimeGeneratedCode({
        userName: displayName,
        code: json.oneTimeFormattedCode,
      });
      await fetchOverview();
    }
  };

  const handleUpdateUserStatus = async (uid: string, status: UserAccount['status']) => {
    await apiFetch(`/api/admin/users/${uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await fetchOverview();
  };

  const handleRevokeSessions = async (uid: string) => {
    await apiFetch(`/api/admin/users/${uid}/revoke-sessions`, { method: 'POST' });
    await fetchOverview();
    if (sessionsModalUser && sessionsModalUser.uid === uid) {
      await openUserSessionsModal(uid);
    }
    showSuccess('Të gjitha pajisjet u nxorën jashtë (Log Out) nga kjo llogari.');
  };

  const openUserSessionsModal = async (uid: string) => {
    setLoadingSessionsModal(true);
    const targetUser = data.users.find((u) => u.uid === uid) || null;
    if (targetUser) setSessionsModalUser(targetUser);
    try {
      const res = await apiFetch(`/api/admin/users/${encodeURIComponent(uid)}/sessions`);
      if (res.ok) {
        const payload = await res.json();
        if (payload.user) setSessionsModalUser(payload.user);
        setUserDeviceSessions(payload.sessions || []);
        setUserBannedDevices(payload.bannedDevices || []);
      }
    } finally {
      setLoadingSessionsModal(false);
    }
  };

  const handleStopSingleSession = async (uid: string, sessionId: string) => {
    const res = await apiFetch(
      `/api/admin/users/${encodeURIComponent(uid)}/sessions/${encodeURIComponent(sessionId)}/stop`,
      { method: 'POST' }
    );
    if (res.ok) {
      await openUserSessionsModal(uid);
      await fetchOverview();
      showSuccess('Sesioni në këtë pajisje u ndalua menjëherë.');
    }
  };

  const handleBanDeviceForever = async (
    uid: string,
    sessionId: string,
    deviceId: string,
    deviceLabel: string
  ) => {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(uid)}/devices/ban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        deviceId,
        reason: `Pajisja "${deviceLabel}" u bllokua nga Super Admini.`,
      }),
    });
    if (res.ok) {
      await openUserSessionsModal(uid);
      await fetchOverview();
      showSuccess(
        `Pajisja "${deviceLabel}" u ndalua dhe u bllokua përgjithmonë nga hyrja në këtë llogari.`
      );
    }
  };

  const handleUnbanDevice = async (uid: string, deviceId: string, banId?: string) => {
    const res = await apiFetch(`/api/admin/users/${encodeURIComponent(uid)}/devices/unban`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, banId }),
    });
    if (res.ok) {
      await openUserSessionsModal(uid);
      await fetchOverview();
      showSuccess('Bllokimi i pajisjes u hoq. Pajisja lejohet përsëri të hyjë.');
    }
  };

  const handleAdminReplySupport = async (e: React.FormEvent, ticketId: string) => {
    e.preventDefault();
    const text = adminSupportReplyText.trim();
    if (!text || sendingSupportReply) return;
    setAdminSupportReplyText('');
    setSendingSupportReply(true);

    const nowIso = new Date().toISOString();
    const optimisticMsgId = `msg_agent_opt_${Date.now()}`;
    setData((prev) => ({
      ...prev,
      supportTickets: (prev.supportTickets || []).map((t) =>
        t.ticketId === ticketId
          ? {
              ...t,
              status: 'human_active',
              unreadByAdmin: 0,
              updatedAt: nowIso,
              lastMessagePreview: text.slice(0, 120),
              messages: [
                ...(t.messages || []),
                {
                  messageId: optimisticMsgId,
                  ticketId,
                  senderRole: 'agent',
                  senderName: user.displayName || 'Agjent Supporti (Super Admin)',
                  text,
                  createdAt: nowIso,
                },
              ],
            }
          : t
      ),
    }));

    try {
      const res = await apiFetch(
        `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/reply`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        }
      );
      if (res.ok) {
        const json = await res.json();
        if (json.ticket) {
          setData((prev) => ({
            ...prev,
            supportTickets: (prev.supportTickets || []).map((t) =>
              t.ticketId === ticketId ? json.ticket : t
            ),
          }));
        }
        await fetchSupportTicketsSilently();
      }
    } finally {
      setSendingSupportReply(false);
    }
  };

  const handleAdminSupportStatus = async (
    ticketId: string,
    status: SupportTicket['status']
  ) => {
    if (status === 'resolved') {
      setData((prev) => ({
        ...prev,
        supportTickets: (prev.supportTickets || []).filter((t) => t.ticketId !== ticketId),
      }));
      if (selectedSupportTicketId === ticketId) {
        setSelectedSupportTicketId('');
      }
    }
    const res = await apiFetch(
      `/api/admin/support/tickets/${encodeURIComponent(ticketId)}/status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }
    );
    if (res.ok) {
      await fetchSupportTicketsSilently();
      if (status === 'resolved') {
        showSuccess('Kërkesa e supportit u shënua si e zgjidhur, u mbyll dhe u fshi nga paneli.');
      } else {
        showSuccess('Statusi i bisedës së supportit u përditësua.');
      }
    }
  };

  const handleUpdateSelectedUserPolicy = async (updatedFields: Partial<UserAccount['accessPolicy']>) => {
    const targetUser = data.users.find((u) => u.uid === selectedUserIdForPolicy);
    if (!targetUser) return;

    const nextPolicy = {
      ...targetUser.accessPolicy,
      ...updatedFields,
    };

    const res = await apiFetch(`/api/admin/users/${targetUser.uid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessPolicy: nextPolicy,
      }),
    });

    if (res.ok) {
      setPolicySavedBanner(true);
      setTimeout(() => setPolicySavedBanner(false), 2000);
      await fetchOverview();
    }
  };

  const handleTerminateRoom = async (roomCode: string) => {
    await apiFetch(`/api/multiplayer/rooms/${roomCode}/host-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'terminate' }),
    });
    await fetchOverview();
  };

  const handleDeleteUser = async (uid: string) => {
    setData((prev) => ({
      ...prev,
      users: prev.users.filter((u) => u.uid !== uid),
    }));
    await apiFetch(`/api/admin/users/${encodeURIComponent(uid)}/delete`, {
      method: 'POST',
    });
    await fetchOverview();
    showSuccess('Llogaria e përdoruesit u fshi me sukses.');
  };

  const handleDeleteLeaderboardEntry = async (entryId: string) => {
    setData((prev) => ({
      ...prev,
      leaderboardEntries: prev.leaderboardEntries.filter((e) => e.entryId !== entryId),
    }));
    await apiFetch(`/api/admin/leaderboard/${encodeURIComponent(entryId)}/delete`, {
      method: 'POST',
    });
    await fetchOverview();
    showSuccess('Rekordi i renditjes u fshi.');
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.siteSettings) return;
    await apiFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data.siteSettings),
    });
    await fetchOverview();
    onCatalogChanged();
    showSuccess('Cilësimet e platformës MITO u ruajtën me sukses!');
  };

  const sidebarItems: Array<{ id: AdminTabId; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'content', label: 'Përmbajtja (Shorts & Video)', icon: <Film className="w-4 h-4" /> },
    { id: 'categories', label: 'Kategoritë', icon: <FolderKanban className="w-4 h-4" /> },
    { id: 'episodes', label: 'Episodet & Sezonet', icon: <Layers className="w-4 h-4" /> },
    { id: 'media', label: 'Media Library', icon: <HardDrive className="w-4 h-4" /> },
    { id: 'games', label: 'Lojërat & Pyetjet', icon: <Gamepad2 className="w-4 h-4" /> },
    { id: 'users', label: 'Përdoruesit & Kodet', icon: <Users className="w-4 h-4" /> },
    { id: 'access', label: 'Kufizimet e Aksesit', icon: <ShieldAlert className="w-4 h-4" /> },
    { id: 'support', label: 'Support Live Chat', icon: <Headphones className="w-4 h-4" /> },
    { id: 'multiplayer', label: 'Multiplayer Live', icon: <Radio className="w-4 h-4" /> },
    { id: 'leaderboards', label: 'Renditjet', icon: <Trophy className="w-4 h-4" /> },
    { id: 'analytics', label: 'Statistikat Dual Video', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'settings', label: 'Cilësimet', icon: <Settings className="w-4 h-4" /> },
  ];

  const isPlatformCompletelyEmpty =
    data.content.length === 0 && data.games.length === 0 && data.users.length === 0;

  const filteredContent = (data.content || []).filter((c) => {
    if (contentFilter === 'short') return c.videoFormat === 'short';
    if (contentFilter === 'standard') return c.videoFormat === 'standard';
    return true;
  });

  const selectedPolicyUser = data.users.find((u) => u.uid === selectedUserIdForPolicy);

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#F4F0E8] flex flex-col lg:flex-row">
      {/* LEFT ADMIN SIDEBAR */}
      <aside className="w-full lg:w-64 bg-[#121216] border-b lg:border-b-0 lg:border-r border-[#202024] shrink-0 flex flex-col justify-between">
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <BrandLogo variant="compact" size="sm" onClick={() => handleSelectTab('dashboard')} />
            <span className="text-[11px] font-mono-code text-[#C8A66A] uppercase tracking-wider">
              Super Admin
            </span>
          </div>

          {/* Primary Google Drive Folder Sync Trigger Button (No Manual Uploads) */}
          <button
            type="button"
            onClick={() => {
              setEditingContentItem(null);
              setUploadModalMode('select');
            }}
            className="w-full py-3 px-4 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/50 flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors"
          >
            <FolderSync className="w-4 h-4 text-[#C8A66A]" />
            <span>Google Drive Video Sync</span>
          </button>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {sidebarItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#641C2B]/40 text-[#F4F0E8] border border-[#C8A66A]/45'
                      : 'text-[#F4F0E8]/70 hover:text-[#F4F0E8] hover:bg-[#19191E]'
                  }`}
                >
                  <span className={active ? 'text-[#C8A66A]' : 'text-[#F4F0E8]/55'}>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Platform Switcher & Logout */}
        <div className="p-4 border-t border-[#202024] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onNavigate('/home')}
              className="py-2 px-3 rounded-lg bg-[#19191E] hover:bg-[#23232A] text-[11px] text-[#F4F0E8]/85 border border-[#202024] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#C8A66A]" />
              <span>Kreu</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('/shorts')}
              className="py-2 px-3 rounded-lg bg-[#19191E] hover:bg-[#23232A] text-[11px] text-[#F4F0E8]/85 border border-[#202024] flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#C8A66A]" />
              <span>Shorts</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="w-full py-2.5 px-3.5 rounded-xl bg-[#0B0B0D] hover:bg-[#641C2B]/30 text-xs text-[#F4F0E8]/75 hover:text-[#F4F0E8] border border-[#202024] flex items-center justify-center gap-2 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-[#C8A66A]" />
            <span>Dil nga Llogaria</span>
          </button>
        </div>
      </aside>

      {/* MAIN ADMIN WORKSPACE */}
      <main className="flex-1 p-5 lg:p-8 overflow-y-auto space-y-6">
        {/* Top Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#202024]">
          <div>
            <div className="text-xs text-[#C8A66A] flex items-center gap-2">
              <span>MITO ADMIN PANEL</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-code">Kodi Admin: 111-222-333</span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-serif-heritage font-bold text-[#F4F0E8] mt-1">
              {sidebarItems.find((i) => i.id === activeTab)?.label || 'Paneli i Administrimit'}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleSeedStarterPack}
              disabled={seedingPack}
              className="px-4 py-2 rounded-xl bg-[#C8A66A] hover:bg-[#DEC089] text-[#0B0B0D] font-bold text-xs flex items-center gap-2 whitespace-nowrap shrink-0 shadow cursor-pointer"
            >
              <Wand2 className="w-4 h-4" />
              <span>
                {seedingPack
                  ? 'Po ngarkohet...'
                  : 'Ngarko Paketën Fillestare Kulturore (1 Klikim)'}
              </span>
            </button>
            <button
              type="button"
              onClick={handleQuickGoogleDriveSync}
              disabled={syncingDriveQuick}
              className="px-3.5 py-2 rounded-xl bg-[#141418] hover:bg-[#1E1E24] border border-[#C8A66A]/40 text-xs font-medium text-[#F4F0E8] flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#C8A66A] ${syncingDriveQuick ? 'animate-spin' : ''}`} />
              <span>
                {syncingDriveQuick ? 'Duke sinkronizuar Drive...' : 'Sinkronizo nga Google Drive'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingContentItem(null);
                setUploadModalMode('standard');
              }}
              className="px-3.5 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] border border-[#C8A66A]/45 text-xs font-semibold text-[#F4F0E8] flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FolderSync className="w-3.5 h-3.5 text-[#C8A66A]" />
              <span>Menaxho Dosjen Google Drive</span>
            </button>
            <button
              type="button"
              onClick={fetchOverview}
              title="Rifresko të dhënat"
              className="p-2 rounded-xl bg-[#141418] hover:bg-[#1E1E24] border border-[#202024] text-[#C8A66A] cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {successBannerSq && (
          <div
            role="status"
            className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-xs text-emerald-200 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">{successBannerSq}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessBannerSq(null)}
              className="text-emerald-300 hover:underline shrink-0 cursor-pointer"
            >
              Mbyll
            </button>
          </div>
        )}

        {errorSq && (
          <div className="p-4 rounded-xl bg-[#641C2B]/30 border border-[#641C2B] text-xs text-[#F4F0E8] flex items-center justify-between">
            <span>{errorSq}</span>
            <button
              type="button"
              onClick={() => setErrorSq(null)}
              className="text-[#C8A66A] hover:underline ml-4 cursor-pointer"
            >
              Mbyll
            </button>
          </div>
        )}

        {/* ONE-TIME GENERATED ACCESS CODE MODAL */}
        {oneTimeGeneratedCode && (
          <div className="p-6 rounded-2xl bg-[#141418] border-2 border-[#C8A66A] space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-mono-code uppercase text-[#C8A66A]">
                  KOD AKSESI 9-SHIFROR (GATI PËR PËRDORIM)
                </span>
                <h2 className="text-xl font-serif-heritage font-bold text-[#F4F0E8] mt-1">
                  Kodi për përdoruesin: {oneTimeGeneratedCode.userName}
                </h2>
                <p className="text-xs text-[#F4F0E8]/70 mt-1">
                  Kopjojeni këtë kod për të hyrë si ky përdorues.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOneTimeGeneratedCode(null)}
                className="text-xs text-[#F4F0E8]/60 hover:text-[#F4F0E8] cursor-pointer"
              >
                Mbyll
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="px-6 py-3.5 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/60 font-mono-code text-2xl font-bold tracking-widest text-[#C8A66A]">
                {oneTimeGeneratedCode.code}
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(oneTimeGeneratedCode.code);
                  setCopiedUserCode(true);
                  setTimeout(() => setCopiedUserCode(false), 2000);
                }}
                className="px-4 py-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 flex items-center gap-2 cursor-pointer"
              >
                {copiedUserCode ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Kodi u Kopjua!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-[#C8A66A]" />
                    <span>Kopjo Kodin</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: DASHBOARD */}
        {/* ========================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8">
            {/* Real Database Metric Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-[#141418] border border-[#202024]">
                <div className="text-xs text-[#F4F0E8]/60">Përmbajtje të Publikuara</div>
                <div className="text-3xl font-mono-code font-bold text-[#F4F0E8] mt-2">
                  {data.stats.publishedContentCount}
                </div>
                <div className="text-[11px] text-[#C8A66A] mt-1 font-mono-code">
                  {data.dualVideoAnalytics.totalShortsUploads} Shorts ·{' '}
                  {data.dualVideoAnalytics.totalStandardUploads} Standarde
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#141418] border border-[#202024]">
                <div className="text-xs text-[#F4F0E8]/60">Lojëra & Kuize</div>
                <div className="text-3xl font-mono-code font-bold text-[#F4F0E8] mt-2">
                  {data.stats.totalGamesCount}
                </div>
                <div className="text-[11px] text-[#F4F0E8]/50 mt-1 font-mono-code">
                  {data.stats.completedGameSessionsCount} sesione të luajtura
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#141418] border border-[#202024]">
                <div className="text-xs text-[#F4F0E8]/60">Përdorues me Kod</div>
                <div className="text-3xl font-mono-code font-bold text-[#F4F0E8] mt-2">
                  {data.stats.totalUsersCount}
                </div>
                <div className="text-[11px] text-emerald-400 mt-1 font-mono-code">
                  {data.stats.activeUsersCount} aktivë · {data.stats.expiredUsersCount} skaduar
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#141418] border border-[#202024]">
                <div className="text-xs text-[#F4F0E8]/60">Shikime Totale</div>
                <div className="text-3xl font-mono-code font-bold text-[#C8A66A] mt-2">
                  {data.stats.totalStreamingViews}
                </div>
                <div className="text-[11px] text-[#F4F0E8]/50 mt-1 font-mono-code">
                  {data.stats.activeMultiplayerRoomsCount} dhoma multiplayer aktive
                </div>
              </div>
            </div>

            {/* 1-CLICK AUTOMATION BAR (NO EXPERIENCE OR SECRETS REQUIRED) */}
            <div className="p-6 rounded-2xl bg-gradient-to-br from-[#141418] via-[#1C1418] to-[#281118] border border-[#C8A66A]/50 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 max-w-2xl">
                  <span className="text-xs font-mono-code uppercase tracking-wider text-[#C8A66A] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    <span>ASISTENT AUTOMATIK · PA KËRKUAR KODE SEKRETE APO EKSPERIENCË</span>
                  </span>
                  <h2 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">
                    {isPlatformCompletelyEmpty
                      ? 'Platforma është bosh — Populloni ose shtoni përmbajtje me 1 klikim'
                      : 'Menaxhim i Shpejtë i Përmbajtjes dhe Lojërave'}
                  </h2>
                  <p className="text-xs text-[#F4F0E8]/75 leading-relaxed">
                    Klikoni &ldquo;Ngarko Paketën Fillestare Kulturore&rdquo; për të krijuar automatikisht Kategoritë, Videon Standarde 16:9 (Legjenda e Rozafës), Videon Vertikale 9:16 (MITO Shorts), Kuizin me 4 pyetje dhe llogarinë Demo (kodi: 222-333-444), ose ngarkoni videot tuaja.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSeedStarterPack}
                    disabled={seedingPack}
                    className="px-5 py-3 rounded-xl bg-[#C8A66A] hover:bg-[#DEC089] text-[#0B0B0D] font-bold text-xs flex items-center gap-2 shadow-lg cursor-pointer"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>
                      {seedingPack
                        ? 'Po krijohen...'
                        : 'Ngarko Paketën Fillestare Kulturore (1 Klikim)'}
                    </span>
                  </button>

                  {!isPlatformCompletelyEmpty && (
                    <button
                      type="button"
                      onClick={handleResetEmpty}
                      disabled={seedingPack}
                      className="px-4 py-3 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] text-[#F4F0E8]/75 hover:text-[#F4F0E8] border border-[#202024] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-[#C8A66A]" />
                      <span>Pastro në Gjendje Bosh</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setUploadModalMode('select')}
                  className="p-4 rounded-xl bg-[#0B0B0D]/90 hover:bg-[#0B0B0D] border border-[#C8A66A]/50 text-left space-y-1.5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <Film className="w-5 h-5 text-[#C8A66A]" />
                    <span className="text-[10px] font-mono-code text-[#C8A66A]">HAPI 1</span>
                  </div>
                  <h3 className="text-sm font-serif-heritage font-bold text-[#F4F0E8] group-hover:text-[#C8A66A]">
                    Shto Video / Legjendë
                  </h3>
                  <p className="text-[11px] text-[#F4F0E8]/65">
                    MITO Shorts (9:16) ose Streaming (16:9).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('categories')}
                  className="p-4 rounded-xl bg-[#0B0B0D]/90 hover:bg-[#0B0B0D] border border-[#202024] hover:border-[#C8A66A]/45 text-left space-y-1.5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <FolderKanban className="w-5 h-5 text-[#C8A66A]" />
                    <span className="text-[10px] font-mono-code text-[#F4F0E8]/45">HAPI 2</span>
                  </div>
                  <h3 className="text-sm font-serif-heritage font-bold text-[#F4F0E8] group-hover:text-[#C8A66A]">
                    Krijo Kategori
                  </h3>
                  <p className="text-[11px] text-[#F4F0E8]/65">
                    Legjenda, Histori, Mitologji dhe Tradita.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('games')}
                  className="p-4 rounded-xl bg-[#0B0B0D]/90 hover:bg-[#0B0B0D] border border-[#202024] hover:border-[#C8A66A]/45 text-left space-y-1.5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <Gamepad2 className="w-5 h-5 text-[#C8A66A]" />
                    <span className="text-[10px] font-mono-code text-[#F4F0E8]/45">HAPI 3</span>
                  </div>
                  <h3 className="text-sm font-serif-heritage font-bold text-[#F4F0E8] group-hover:text-[#C8A66A]">
                    Krijo Lojë / Kuiz
                  </h3>
                  <p className="text-[11px] text-[#F4F0E8]/65">
                    Ndërto pyetje kuizi me Watch-to-Unlock.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('users')}
                  className="p-4 rounded-xl bg-[#0B0B0D]/90 hover:bg-[#0B0B0D] border border-[#202024] hover:border-[#C8A66A]/45 text-left space-y-1.5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <Users className="w-5 h-5 text-[#C8A66A]" />
                    <span className="text-[10px] font-mono-code text-[#F4F0E8]/45">HAPI 4</span>
                  </div>
                  <h3 className="text-sm font-serif-heritage font-bold text-[#F4F0E8] group-hover:text-[#C8A66A]">
                    Krijo Përdorues
                  </h3>
                  <p className="text-[11px] text-[#F4F0E8]/65">
                    Gjenero kod 9-shifror (XXX-XXX-XXX).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectTab('access')}
                  className="p-4 rounded-xl bg-[#0B0B0D]/90 hover:bg-[#0B0B0D] border border-[#202024] hover:border-[#C8A66A]/45 text-left space-y-1.5 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <ShieldAlert className="w-5 h-5 text-[#C8A66A]" />
                    <span className="text-[10px] font-mono-code text-[#F4F0E8]/45">HAPI 5</span>
                  </div>
                  <h3 className="text-sm font-serif-heritage font-bold text-[#F4F0E8] group-hover:text-[#C8A66A]">
                    Kufizimet e Aksesit
                  </h3>
                  <p className="text-[11px] text-[#F4F0E8]/65">
                    Cakto minutat, Shorts, Streaming & Multiplayer.
                  </p>
                </button>
              </div>
            </div>

            {/* Dual Video System Summary Cards (Section 6B) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#641C2B]/40 border border-[#C8A66A]/45 flex items-center justify-center text-[#C8A66A]">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                        1. VIDEO VERTIKALE — MITO SHORTS (9:16)
                      </h3>
                      <p className="text-xs text-[#F4F0E8]/60">
                        Format vertikal 1080×1920 për zbulim të shpejtë kulturor
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingContentItem(null);
                      setUploadModalMode('short');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 cursor-pointer"
                  >
                    Sinkronizo Drive
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Ngarkime</div>
                    <div className="text-lg font-mono-code font-bold text-[#F4F0E8]">
                      {data.dualVideoAnalytics.totalShortsUploads}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Shikime</div>
                    <div className="text-lg font-mono-code font-bold text-[#C8A66A]">
                      {data.dualVideoAnalytics.totalShortsViews}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Kohëzgjatja Mes.</div>
                    <div className="text-lg font-mono-code font-bold text-[#F4F0E8]">
                      {data.dualVideoAnalytics.averageShortsWatchDurationSeconds}s
                    </div>
                  </div>
                </div>

                {/* Quick list of uploaded Shorts with Edit & Hide/Show buttons */}
                {data.content.filter((c) => c.videoFormat === 'short').length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#202024]">
                    <div className="text-[11px] font-mono-code uppercase text-[#C8A66A]">
                      Videot Vertikale nga Google Drive
                    </div>
                    {data.content
                      .filter((c) => c.videoFormat === 'short')
                      .map((item) => (
                        <div
                          key={item.contentId}
                          className="p-2.5 rounded-xl bg-[#0B0B0D] border border-[#202024] flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title}
                              className="w-8 h-12 object-cover rounded border border-[#C8A66A]/30 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#F4F0E8] truncate">
                                {item.title}
                              </div>
                              <div className="text-[10px] font-mono-code text-[#F4F0E8]/55">
                                {item.resolution} · {item.viewsCount} shikime ·{' '}
                                {item.publicationStatus === 'published' ? 'E SHFAQUR' : 'E FSHEHUR'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingContentItem(item);
                                setUploadModalMode('short');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#141418] hover:bg-[#1E1E24] border border-[#C8A66A]/40 text-xs font-semibold text-[#C8A66A] flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edito</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleContentVisibility(item.contentId)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#141418] hover:bg-[#1E1E24] border border-[#202024] text-xs font-semibold text-[#F4F0E8] flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              {item.publicationStatus === 'published' ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Fshih</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Shfaq</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#641C2B]/40 border border-[#C8A66A]/45 flex items-center justify-center text-[#C8A66A]">
                      <Film className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                        2. VIDEO STANDARDE — MITO STREAMING (GOOGLE DRIVE)
                      </h3>
                      <p className="text-xs text-[#F4F0E8]/60">
                        Filma dhe dokumentarë nga Google Drive me pyetësorë të hapur menjëherë (0% Watch)
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingContentItem(null);
                      setUploadModalMode('standard');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 cursor-pointer"
                  >
                    Sinkronizo Drive
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Filma në Drive</div>
                    <div className="text-lg font-mono-code font-bold text-[#F4F0E8]">
                      {data.dualVideoAnalytics.totalStandardUploads}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Shikime</div>
                    <div className="text-lg font-mono-code font-bold text-[#C8A66A]">
                      {data.dualVideoAnalytics.totalStandardViews}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Pyetësori</div>
                    <div className="text-lg font-mono-code font-bold text-emerald-400">
                      0% Hapur
                    </div>
                  </div>
                </div>

                {/* Quick list of Google Drive Standard Videos with Edit, Hide/Show, and Delete buttons */}
                {data.content.filter((c) => c.videoFormat === 'standard').length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#202024]">
                    <div className="text-[11px] font-mono-code uppercase text-[#C8A66A]">
                      Filmat e Sinkronizuar nga Google Drive (Edito Detajet, Pyetësorin ose Fshih/Shfaq)
                    </div>
                    {data.content
                      .filter((c) => c.videoFormat === 'standard')
                      .map((item) => (
                        <div
                          key={item.contentId}
                          className="p-2.5 rounded-xl bg-[#0B0B0D] border border-[#202024] flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title}
                              className="w-14 h-9 object-cover rounded border border-[#C8A66A]/30 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-[#F4F0E8] truncate">
                                {item.title}
                              </div>
                              <div className="text-[10px] font-mono-code text-[#F4F0E8]/55">
                                {item.resolution} · {item.viewsCount} shikime ·{' '}
                                {item.publicationStatus === 'published' ? 'E SHFAQUR' : 'E FSHEHUR'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingContentItem(item);
                                setUploadModalMode('standard');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#141418] hover:bg-[#1E1E24] border border-[#C8A66A]/40 text-xs font-semibold text-[#C8A66A] flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edito & Pyetësori</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleContentVisibility(item.contentId)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#141418] hover:bg-[#1E1E24] border border-[#202024] text-xs font-semibold text-[#F4F0E8] flex items-center gap-1 shrink-0 cursor-pointer"
                            >
                              {item.publicationStatus === 'published' ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Fshih</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Shfaq</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: CONTENT MANAGEMENT (SHORTS & STANDARD) */}
        {/* ========================================================= */}
        {activeTab === 'content' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 bg-[#141418] p-1 rounded-xl border border-[#202024]">
                <button
                  type="button"
                  onClick={() => setContentFilter('all')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    contentFilter === 'all'
                      ? 'bg-[#641C2B] text-[#F4F0E8]'
                      : 'text-[#F4F0E8]/65 hover:text-[#F4F0E8]'
                  }`}
                >
                  Të gjitha ({data.content.length})
                </button>
                <button
                  type="button"
                  onClick={() => setContentFilter('short')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    contentFilter === 'short'
                      ? 'bg-[#641C2B] text-[#F4F0E8]'
                      : 'text-[#F4F0E8]/65 hover:text-[#F4F0E8]'
                  }`}
                >
                  MITO Shorts 9:16 ({data.dualVideoAnalytics.totalShortsUploads})
                </button>
                <button
                  type="button"
                  onClick={() => setContentFilter('standard')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer ${
                    contentFilter === 'standard'
                      ? 'bg-[#641C2B] text-[#F4F0E8]'
                      : 'text-[#F4F0E8]/65 hover:text-[#F4F0E8]'
                  }`}
                >
                  Standard Streaming 16:9 ({data.dualVideoAnalytics.totalStandardUploads})
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleQuickGoogleDriveSync}
                  disabled={syncingDriveQuick}
                  className="px-4 py-2.5 rounded-xl bg-[#141418] hover:bg-[#1E1E24] text-xs font-semibold text-[#C8A66A] border border-[#C8A66A]/45 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingDriveQuick ? 'animate-spin' : ''}`} />
                  <span>Sinkronizo nga Google Drive</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingContentItem(null);
                    setUploadModalMode('select');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 flex items-center gap-2 cursor-pointer"
                >
                  <FolderSync className="w-4 h-4 text-[#C8A66A]" />
                  <span>Menaxho Dosjen Google Drive</span>
                </button>
              </div>
            </div>

            {filteredContent.length === 0 ? (
              <div className="p-12 rounded-2xl bg-[#141418] border border-[#202024] text-center space-y-4">
                <FolderSync className="w-10 h-10 text-[#C8A66A] mx-auto" />
                <h3 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                  Nuk ka ende video në këtë seksion
                </h3>
                <p className="text-xs text-[#F4F0E8]/65 max-w-md mx-auto">
                  Videot dhe kopertinat e filmave shtohen vetëm përmes dosjes së Google Drive. Klikoni më poshtë për të sinkronizuar dosjen tuaj të Google Drive.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleQuickGoogleDriveSync}
                    className="px-5 py-2.5 rounded-xl bg-[#C8A66A] hover:bg-[#DEC089] text-xs font-bold text-[#0B0B0D] cursor-pointer"
                  >
                    Sinkronizo Videot nga Google Drive
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredContent.map((item) => (
                  <div
                    key={item.contentId}
                    className="p-4 lg:p-5 rounded-2xl bg-[#141418] border border-[#202024] flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-4">
                      <img
                        src={item.thumbnailUrl}
                        alt={item.title}
                        className={`object-cover rounded-xl border border-[#C8A66A]/30 ${
                          item.videoFormat === 'short' ? 'w-14 h-24' : 'w-28 h-16'
                        }`}
                      />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#C8A66A] font-mono-code">
                          <span className="px-2 py-0.5 rounded bg-[#C8A66A]/15 text-[#C8A66A]">
                            GOOGLE DRIVE SYNC
                          </span>
                          <span>
                            {item.videoFormat === 'short' ? 'SHORT 9:16' : 'STANDARD 16:9'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.resolution}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold uppercase ${
                              item.publicationStatus === 'published'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {item.publicationStatus === 'published'
                              ? 'E SHFAQUR (PUBLISHED)'
                              : 'E FSHEHUR (DRAFT)'}
                          </span>
                        </div>
                        <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                          {item.title}
                        </h3>
                        <p className="text-xs text-[#F4F0E8]/65 line-clamp-1 max-w-xl">
                          {item.synopsis || item.description}
                        </p>
                        <div className="text-[11px] font-mono-code text-[#F4F0E8]/50">
                          {item.viewsCount} shikime · Pyetësorë të lidhur:{' '}
                          {item.relatedGameIds?.length || 0} (0% Watch Requirement) · Krahina:{' '}
                          {item.region}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingContentItem(item);
                          setUploadModalMode(item.videoFormat);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] border border-[#C8A66A]/45 text-xs font-semibold text-[#F4F0E8] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-[#C8A66A]" />
                        <span>Edito Detajet & Pyetësorin</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleContentVisibility(item.contentId)}
                        className="px-3.5 py-2 rounded-xl bg-[#0B0B0D] hover:bg-[#1E1E24] border border-[#202024] text-xs font-semibold text-[#F4F0E8] flex items-center gap-1.5 cursor-pointer"
                      >
                        {item.publicationStatus === 'published' ? (
                          <>
                            <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                            <span>Fshih Videon</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Shfaq Videon</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onNavigate(
                            item.videoFormat === 'short'
                              ? `/shorts?id=${item.contentId}`
                              : `/watch/${item.contentId}`
                          )
                        }
                        className="px-3.5 py-2 rounded-xl bg-[#0B0B0D] hover:bg-[#1E1E24] border border-[#C8A66A]/35 text-xs text-[#C8A66A] cursor-pointer"
                      >
                        Shiko në Player
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: CATEGORIES MANAGEMENT */}
        {/* ========================================================= */}
        {activeTab === 'categories' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <form
              onSubmit={handleCreateCategory}
              className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4 h-fit"
            >
              <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                Krijo Kategori Kulturore
              </h2>
              <div>
                <label htmlFor="cat-name" className="block text-xs text-[#C8A66A] mb-1">
                  Emri i Kategorisë
                </label>
                <input
                  id="cat-name"
                  type="text"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="p.sh. Legjenda Shqiptare"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                />
              </div>
              <div>
                <label htmlFor="cat-slug" className="block text-xs text-[#C8A66A] mb-1">
                  Slug (Opsionale)
                </label>
                <input
                  id="cat-slug"
                  type="text"
                  value={catSlug}
                  onChange={(e) => setCatSlug(e.target.value)}
                  placeholder="legjenda-shqiptare"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                />
              </div>
              <div>
                <label htmlFor="cat-desc" className="block text-xs text-[#C8A66A] mb-1">
                  Përshkrimi
                </label>
                <textarea
                  id="cat-desc"
                  rows={3}
                  value={catDesc}
                  onChange={(e) => setCatDesc(e.target.value)}
                  placeholder="Rrëfime epike, kështjella dhe besa shqiptare..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
              >
                + Shto Kategori
              </button>
            </form>

            <div className="lg:col-span-2 space-y-3">
              {data.categories.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                  Nuk ka ende kategori të krijuara. Klikoni &ldquo;+ Shto Kategori&rdquo; majtas.
                </div>
              ) : (
                data.categories.map((cat) => (
                  <div
                    key={cat.categoryId}
                    className="p-4 rounded-2xl bg-[#141418] border border-[#202024] flex items-center justify-between"
                  >
                    <div>
                      <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                        {cat.name}
                      </h3>
                      <p className="text-xs text-[#F4F0E8]/60">{cat.description || cat.slug}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(cat.categoryId)}
                      className="p-2 rounded-xl bg-[#0B0B0D] hover:bg-[#641C2B]/40 text-[#F4F0E8]/60 hover:text-[#F4F0E8] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: EPISODES & SEASONS */}
        {/* ========================================================= */}
        {activeTab === 'episodes' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <form
              onSubmit={handleCreateEpisode}
              className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4 h-fit"
            >
              <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                Shto Episod në Seri
              </h2>
              <div>
                <label htmlFor="ep-series" className="block text-xs text-[#C8A66A] mb-1">
                  Zgjidh Përmbajtjen / Serinë Kryesore
                </label>
                <select
                  id="ep-series"
                  value={epSeriesId}
                  onChange={(e) => setEpSeriesId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                >
                  <option value="">-- Zgjidh (ose merret automatikisht e para) --</option>
                  {data.content
                    .filter((c) => c.videoFormat === 'standard')
                    .map((c) => (
                      <option key={c.contentId} value={c.contentId}>
                        {c.title}
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ep-season" className="block text-xs text-[#C8A66A] mb-1">
                    Sezoni
                  </label>
                  <input
                    id="ep-season"
                    type="number"
                    min={1}
                    value={epSeason}
                    onChange={(e) => setEpSeason(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                  />
                </div>
                <div>
                  <label htmlFor="ep-num" className="block text-xs text-[#C8A66A] mb-1">
                    Episodi
                  </label>
                  <input
                    id="ep-num"
                    type="number"
                    min={1}
                    value={epNumber}
                    onChange={(e) => setEpNumber(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="ep-title" className="block text-xs text-[#C8A66A] mb-1">
                  Titulli i Episodit
                </label>
                <input
                  id="ep-title"
                  type="text"
                  value={epTitle}
                  onChange={(e) => setEpTitle(e.target.value)}
                  placeholder="p.sh. Pjesa I: Themelet e Kalasë"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                />
              </div>
              <div>
                <label htmlFor="ep-syn" className="block text-xs text-[#C8A66A] mb-1">
                  Përmbledhja
                </label>
                <textarea
                  id="ep-syn"
                  rows={2}
                  value={epSynopsis}
                  onChange={(e) => setEpSynopsis(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
              >
                + Shto Episod
              </button>
            </form>

            <div className="lg:col-span-2 space-y-3">
              {data.episodes.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                  Nuk ka ende episode të regjistruara.
                </div>
              ) : (
                data.episodes.map((ep) => (
                  <div
                    key={ep.episodeId}
                    className="p-4 rounded-2xl bg-[#141418] border border-[#202024] flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="text-xs font-mono-code text-[#C8A66A]">
                        Sezoni {ep.seasonNumber} · Episodi {ep.episodeNumber}
                      </span>
                      <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                        {ep.title}
                      </h3>
                      <p className="text-xs text-[#F4F0E8]/60">{ep.synopsis}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteEpisode(ep.episodeId)}
                      className="px-3 py-1.5 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] border border-[#641C2B] text-xs font-semibold text-[#F4F0E8] flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Fshi</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: MEDIA LIBRARY */}
        {/* ========================================================= */}
        {activeTab === 'media' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#F4F0E8]/65">
                Të gjithë skedarët e sinkronizuar nga dosja e Google Drive. Ngarkimi manual është çaktivizuar.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingContentItem(null);
                  setUploadModalMode('select');
                }}
                className="px-4 py-2 rounded-xl bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
              >
                Sinkronizo Dosjen Google Drive
              </button>
            </div>

            {data.mediaAssets.length === 0 ? (
              <div className="p-10 rounded-2xl bg-[#141418] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                Biblioteka e medias është bosh.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {data.mediaAssets.map((asset) => (
                  <div
                    key={asset.assetId}
                    className="p-4 rounded-xl bg-[#141418] border border-[#202024] flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-mono-code text-[#C8A66A]">
                        <span>{asset.videoFormat === 'short' ? 'SHORT 9:16' : 'STANDARD 16:9'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{asset.resolution || 'Media'}</span>
                        <span aria-hidden="true">·</span>
                        <span>Raporti: {asset.aspectRatio || '-'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{asset.codec || asset.mimeType}</span>
                      </div>
                      <div className="text-sm font-semibold text-[#F4F0E8]">{asset.filename}</div>
                      <div className="text-[11px] font-mono-code text-[#F4F0E8]/50">
                        Madhësia: {(asset.fileSizeBytes / 1024).toFixed(1)} KB · Statusi:{' '}
                        {asset.processingStatus}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteMediaAsset(asset.assetId)}
                      className="px-3.5 py-2 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] border border-[#641C2B] text-xs font-semibold text-[#F4F0E8] flex items-center gap-1.5 cursor-pointer"
                      title="Fshi skedarin"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Fshi Skedarin</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: NO-CODE GAME & QUESTION BUILDER */}
        {/* ========================================================= */}
        {activeTab === 'games' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <form
              onSubmit={handleSaveGame}
              className="xl:col-span-7 p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-5"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                  Ndërtuesi i Lojërave dhe Kuizeve (Pa Kod)
                </h2>
                <span className="text-xs font-mono-code text-[#C8A66A]">SERVER-AUTHORITATIVE</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gm-title" className="block text-xs text-[#C8A66A] mb-1">
                    Titulli i Lojës / Kuizit
                  </label>
                  <input
                    id="gm-title"
                    type="text"
                    value={gameTitle}
                    onChange={(e) => setGameTitle(e.target.value)}
                    placeholder="p.sh. Kuizi i Legjendës së Rozafës"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                  />
                </div>

                <div>
                  <label htmlFor="gm-type" className="block text-xs text-[#C8A66A] mb-1">
                    Lloji i Lojës
                  </label>
                  <select
                    id="gm-type"
                    value={gameType}
                    onChange={(e) => setGameType(e.target.value as GameType)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                  >
                    <option value="quiz_battle">Quiz Battle</option>
                    <option value="true_false">E Vërtetë apo e Gabuar</option>
                    <option value="guess_legend">Gjej Legjendën</option>
                    <option value="image_recognition">Sfidë Vëzhgimi me Imazh</option>
                    <option value="memory_match">Memory Match</option>
                    <option value="speed_round">Sfidë e Shpejtësisë</option>
                    <option value="multiple_choice">Zgjedhje e Shumëfishtë</option>
                    <option value="chronological_order">Rend Kronologjik</option>
                    <option value="cultural_knowledge">Sfidë e Njohurive Kulturore</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="gm-desc" className="block text-xs text-[#C8A66A] mb-1">
                  Përshkrimi & Udhëzimet
                </label>
                <input
                  id="gm-desc"
                  type="text"
                  value={gameDesc}
                  onChange={(e) => setGameDesc(e.target.value)}
                  placeholder="Testoni njohuritë tuaja mbi historinë dhe besën shqiptare..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                />
              </div>

              {/* Watch-to-Unlock Linking */}
              <div className="p-4 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/35 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#C8A66A] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lidhja Watch-to-Unlock me Video</span>
                  </span>
                  <label className="flex items-center gap-2 text-xs text-[#F4F0E8] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameRequireUnlock}
                      onChange={(e) => setGameRequireUnlock(e.target.checked)}
                    />
                    <span>Kërko shikimin e videos para lojës</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="gm-link" className="block text-[11px] text-[#F4F0E8]/65 mb-1">
                      Videoja ose Legjenda e Lidhur
                    </label>
                    <select
                      id="gm-link"
                      value={gameLinkedContentId}
                      onChange={(e) => setGameLinkedContentId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#141418] border border-[#202024] text-xs text-[#F4F0E8]"
                    >
                      <option value="">-- Pa video të detyrueshme (E hapur) --</option>
                      {data.content.map((c) => (
                        <option key={c.contentId} value={c.contentId}>
                          [{c.videoFormat === 'short' ? 'Short' : 'Standard'}] {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="gm-pct" className="block text-[11px] text-[#F4F0E8]/65 mb-1">
                      Pragu i Shikimit për Zhbllokim (%)
                    </label>
                    <input
                      id="gm-pct"
                      type="number"
                      min={10}
                      max={100}
                      value={gameRequiredPercent}
                      onChange={(e) => setGameRequiredPercent(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-[#141418] border border-[#202024] text-xs font-mono-code text-[#F4F0E8]"
                    />
                  </div>
                </div>
              </div>

              {/* Built-in + Optional Gemini AI Question Generator (Works with zero API keys!) */}
              <div className="p-4 rounded-xl bg-[#0B0B0D] border border-[#202024] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#C8A66A] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Asistenti Editorial (Gjenero 4 Pyetje me 1 Klikim)</span>
                  </span>
                </div>
                <textarea
                  rows={2}
                  value={aiSourceText}
                  onChange={(e) => setAiSourceText(e.target.value)}
                  placeholder="Shkruani një temë (p.sh. Rozafa, Skënderbeu, Besa) ose lëreni bosh dhe klikoni butonin më poshtë..."
                  className="w-full px-3 py-2 rounded-lg bg-[#141418] border border-[#202024] text-xs text-[#F4F0E8]"
                />
                {aiNoticeSq && <p className="text-[11px] text-emerald-300">{aiNoticeSq}</p>}
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleAiGenerateQuestions}
                  className="px-3.5 py-2 rounded-lg bg-[#C8A66A] hover:bg-[#DEC089] text-xs font-bold text-[#0B0B0D] cursor-pointer disabled:opacity-50"
                >
                  {aiLoading
                    ? 'Po gjenerohen 4 pyetje...'
                    : 'Gjenero 4 Pyetje Automatiksht (1 Klikim)'}
                </button>
              </div>

              {/* Questions List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#F4F0E8]">
                    Pyetjet e Kuizit ({draftQuestions.length})
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddDraftQuestion}
                    className="text-xs text-[#C8A66A] hover:underline cursor-pointer"
                  >
                    + Shto Pyetje Tjetër
                  </button>
                </div>

                {draftQuestions.map((q, qIdx) => (
                  <div
                    key={qIdx}
                    className="p-4 rounded-xl bg-[#0B0B0D] border border-[#202024] space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono-code text-[#C8A66A]">
                        PYETJA #{qIdx + 1}
                      </span>
                      {draftQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setDraftQuestions((prev) => prev.filter((_, i) => i !== qIdx))
                          }
                          className="text-[11px] text-[#F4F0E8]/50 hover:text-[#F4F0E8] cursor-pointer"
                        >
                          Hiq
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={q.questionText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftQuestions((prev) =>
                          prev.map((item, i) =>
                            i === qIdx ? { ...item, questionText: val } : item
                          )
                        );
                      }}
                      placeholder="Shkruani pyetjen këtu..."
                      className="w-full px-3 py-2 rounded-lg bg-[#141418] border border-[#202024] text-xs text-[#F4F0E8]"
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {q.choices.map((choice, cIdx) => (
                        <div key={cIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${qIdx}`}
                            checked={q.correctChoiceIndex === cIdx}
                            onChange={() =>
                              setDraftQuestions((prev) =>
                                prev.map((item, i) =>
                                  i === qIdx ? { ...item, correctChoiceIndex: cIdx } : item
                                )
                              )
                            }
                          />
                          <input
                            type="text"
                            value={choice}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraftQuestions((prev) =>
                                prev.map((item, i) => {
                                  if (i !== qIdx) return item;
                                  const nextChoices = [...item.choices];
                                  nextChoices[cIdx] = val;
                                  return { ...item, choices: nextChoices };
                                })
                              );
                            }}
                            placeholder={`Alternativa ${['A', 'B', 'C', 'D'][cIdx]}`}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-[#141418] border border-[#202024] text-xs text-[#F4F0E8]"
                          />
                        </div>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={q.explanation}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDraftQuestions((prev) =>
                          prev.map((item, i) =>
                            i === qIdx ? { ...item, explanation: val } : item
                          )
                        );
                      }}
                      placeholder="Shpjegimi edukativ pas përgjigjes..."
                      className="w-full px-3 py-1.5 rounded-lg bg-[#141418] border border-[#202024] text-xs text-[#F4F0E8]/80"
                    />
                  </div>
                ))}
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
              >
                Publiko Lojën & Pyetjet
              </button>
            </form>

            {/* Existing Games List */}
            <div className="xl:col-span-5 space-y-4">
              <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                Lojërat Aktive ({data.games.length})
              </h2>
              {data.games.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                  Nuk ka ende lojëra të krijuara. Klikoni &ldquo;Publiko Lojën & Pyetjet&rdquo; majtas.
                </div>
              ) : (
                data.games.map((g) => (
                  <div
                    key={g.gameId}
                    className="p-4 rounded-2xl bg-[#141418] border border-[#202024] space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[11px] font-mono-code text-[#C8A66A] uppercase">
                          {g.gameType} · {g.questionCount} pyetje · +{g.xpReward} XP
                        </span>
                        <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                          {g.title}
                        </h3>
                        <p className="text-xs text-[#F4F0E8]/65">{g.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteGame(g.gameId)}
                        className="p-2 rounded-lg bg-[#0B0B0D] hover:bg-[#641C2B]/40 text-[#F4F0E8]/60 hover:text-[#F4F0E8] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#202024] text-[11px] font-mono-code text-[#F4F0E8]/55">
                      <span>
                        {g.requireWatchToUnlock
                          ? `Watch-to-Unlock: ${g.requiredWatchPercent}%`
                          : 'E hapur menjëherë'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate(`/games/${g.gameId}`)}
                        className="text-[#C8A66A] hover:underline cursor-pointer"
                      >
                        Provo Lojën →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: USERS & 9-DIGIT ACCESS CODE GENERATOR */}
        {/* ========================================================= */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            <form
              onSubmit={handleCreateUser}
              className="xl:col-span-5 p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4 h-fit"
            >
              <div className="flex items-center gap-2 text-[#C8A66A]">
                <KeyRound className="w-5 h-5" />
                <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                  Krijo Përdorues & Kod 9-Shifror
                </h2>
              </div>

              <div>
                <label htmlFor="usr-name" className="block text-xs text-[#C8A66A] mb-1">
                  Emri ose Etiketa e Përdoruesit
                </label>
                <input
                  id="usr-name"
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="p.sh. Arben Krasniqi / Klasa 9A"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                />
              </div>

              <div>
                <label htmlFor="usr-custom-code" className="block text-xs text-[#C8A66A] mb-1">
                  Kodi 9-Shifror (Opsional — lëreni bosh për gjenerim automatik)
                </label>
                <input
                  id="usr-custom-code"
                  type="text"
                  inputMode="numeric"
                  value={newUserCustomCode}
                  onChange={(e) => setNewUserCustomCode(formatAccessCodeInput(e.target.value))}
                  placeholder="Gjenerohet automatikisht (ose shkruaj p.sh. 456-789-123)"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/35 text-sm font-mono-code tracking-wider text-[#F4F0E8]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="usr-country" className="block text-xs text-[#C8A66A] mb-1">
                    Shteti / Krahina
                  </label>
                  <input
                    id="usr-country"
                    type="text"
                    value={newUserCountry}
                    onChange={(e) => setNewUserCountry(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                  />
                </div>
                <div>
                  <label htmlFor="usr-school" className="block text-xs text-[#C8A66A] mb-1">
                    Shkolla (Opsionale)
                  </label>
                  <input
                    id="usr-school"
                    type="text"
                    value={newUserSchool}
                    onChange={(e) => setNewUserSchool(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="usr-preset" className="block text-xs text-[#C8A66A] mb-1">
                  Profili i Aksesit (Preset)
                </label>
                <select
                  id="usr-preset"
                  value={newUserPreset}
                  onChange={(e) => setNewUserPreset(e.target.value as AccessPresetId)}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
                >
                  <option value="full">Full Access (Të gjitha videot, Shorts, Lojëra, Multiplayer)</option>
                  <option value="demo">Demo Access (30 min, 1 legjendë, 1 kuiz, pa multiplayer)</option>
                  <option value="viewer">Viewer Access (Vetëm Streaming & Shorts, pa lojëra)</option>
                  <option value="gamer">Gamer Access (Lojëra & Kuize, vetëm përmbajtje të lidhura)</option>
                  <option value="custom">Custom Access (Kufizime të personalizuara)</option>
                </select>
              </div>

              {newUserPreset === 'custom' && (
                <div className="p-4 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/35 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="cust-dur" className="block text-[11px] text-[#C8A66A] mb-1">
                        Kohëzgjatja (Minuta nga hyrja e parë)
                      </label>
                      <input
                        id="cust-dur"
                        type="number"
                        value={customDurationMin}
                        onChange={(e) => setCustomDurationMin(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#141418] border border-[#202024] text-xs font-mono-code text-[#F4F0E8]"
                      />
                    </div>
                    <div>
                      <label htmlFor="cust-daily" className="block text-[11px] text-[#C8A66A] mb-1">
                        Kufiri Ditor (Minuta/Ditë)
                      </label>
                      <input
                        id="cust-daily"
                        type="number"
                        value={customDailyMin}
                        onChange={(e) => setCustomDailyMin(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#141418] border border-[#202024] text-xs font-mono-code text-[#F4F0E8]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customStreamingEnabled}
                        onChange={(e) => setCustomStreamingEnabled(e.target.checked)}
                      />
                      <span>Lejo Streaming</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customShortsEnabled}
                        onChange={(e) => setCustomShortsEnabled(e.target.checked)}
                      />
                      <span>Lejo MITO Shorts</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customGamesEnabled}
                        onChange={(e) => setCustomGamesEnabled(e.target.checked)}
                      />
                      <span>Lejo Lojërat</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={customMultiplayerEnabled}
                        onChange={(e) => setCustomMultiplayerEnabled(e.target.checked)}
                      />
                      <span>Lejo Multiplayer</span>
                    </label>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
              >
                Gjenero Kodin 9-Shifror (XXX-XXX-XXX)
              </button>
            </form>

            <div className="xl:col-span-7 space-y-4">
              <div className="p-4 rounded-2xl bg-[#141418] border border-[#202024] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                    Llogaritë e Përdoruesve ({data.users.length})
                  </h2>
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: 'all', label: 'Të gjithë' },
                        { id: 'active', label: 'Aktivë' },
                        { id: 'suspended', label: 'Pezulluar' },
                        { id: 'expired', label: 'Skaduar' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setUserStatusFilter(st.id)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors ${
                          userStatusFilter === st.id
                            ? 'bg-[#641C2B] text-[#F4F0E8] border border-[#C8A66A]/40'
                            : 'bg-[#0B0B0D] text-[#F4F0E8]/70 hover:text-[#F4F0E8]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* User Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-[#C8A66A] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Kërko përdorues sipas emrit, kodit 9-shifror (p.sh. 222-333-444), shkollës ose shtetit..."
                    aria-label="Kërko përdorues"
                    className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/35 focus:border-[#C8A66A] text-xs text-[#F4F0E8] placeholder-[#F4F0E8]/40 focus:outline-none"
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUserSearchQuery('')}
                      aria-label="Pastro kërkimin"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#F4F0E8]/50 hover:text-[#F4F0E8] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {(() => {
                const q = userSearchQuery.trim().toLowerCase();
                const qDigits = q.replace(/\D/g, '');
                const filteredUsers = data.users.filter((u) => {
                  if (userStatusFilter !== 'all' && u.status !== userStatusFilter) return false;
                  if (!q) return true;
                  const fullCodeStr = (u.fullCode || u.maskedCode || '').toLowerCase();
                  const fullCodeDigits = fullCodeStr.replace(/\D/g, '');
                  const nameMatch = u.displayName.toLowerCase().includes(q);
                  const codeMatch =
                    fullCodeStr.includes(q) || (qDigits.length > 0 && fullCodeDigits.includes(qDigits));
                  const schoolMatch = (u.stats.school || '').toLowerCase().includes(q);
                  const countryMatch = (u.stats.country || '').toLowerCase().includes(q);
                  const presetMatch = (u.accessPolicy.preset || '').toLowerCase().includes(q);
                  return nameMatch || codeMatch || schoolMatch || countryMatch || presetMatch;
                });

                if (data.users.length === 0) {
                  return (
                    <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                      Nuk ka ende përdorues të regjistruar. Klikoni &ldquo;Gjenero Kodin 9-Shifror&rdquo; majtas.
                    </div>
                  );
                }

                if (filteredUsers.length === 0) {
                  return (
                    <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                      Nuk u gjet asnjë përdorues që përputhet me kërkimin &ldquo;{userSearchQuery}&rdquo;.
                    </div>
                  );
                }

                return filteredUsers.map((u) => {
                  const visibleCode = u.fullCode || u.maskedCode;
                  return (
                    <div
                      key={u.uid}
                      className="p-4 rounded-2xl bg-[#141418] border border-[#202024] flex flex-wrap items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono-code">
                          <span className="px-2.5 py-1 rounded-lg bg-[#0B0B0D] border border-[#C8A66A]/50 text-[#C8A66A] font-bold tracking-wider">
                            KODI: {visibleCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(visibleCode);
                              setCopiedUidCode(u.uid);
                              setTimeout(() => setCopiedUidCode(null), 2000);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#202024] hover:bg-[#C8A66A] hover:text-[#0B0B0D] text-[11px] font-semibold text-[#C8A66A] flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            {copiedUidCode === u.uid ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>U kopjua</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Kopjo Kodin</span>
                              </>
                            )}
                          </button>
                          <span aria-hidden="true">·</span>
                          <span className="uppercase text-[#F4F0E8]/75">
                            Preset: {u.accessPolicy.preset}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              u.status === 'active' ? 'text-emerald-400' : 'text-amber-400'
                            }
                          >
                            {u.status.toUpperCase()}
                          </span>
                        </div>
                        <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                          {u.displayName}
                        </h3>
                        <div className="text-[11px] font-mono-code text-[#F4F0E8]/55">
                          XP: {u.stats.totalXp} · Lojëra: {u.stats.gamesPlayed} · Shteti:{' '}
                          {u.stats.country || 'Shqipëri'}
                          {u.stats.school ? ` · Shkolla: ${u.stats.school}` : ''} · Kohëzgjatja:{' '}
                          {u.accessPolicy.accessDurationMinutes
                            ? `${u.accessPolicy.accessDurationMinutes} min`
                            : 'Pa kufi'}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* 1. Regenerate Code (Does NOT log out active devices; prevents kicked devices from logging back in with old code) */}
                        <button
                          type="button"
                          onClick={() => handleRegenerateUserCode(u.uid, u.displayName)}
                          title="Rigjeneron kodin 9-shifror pa nxjerrë jashtë pajisjet që janë aktualisht brenda"
                          className="px-3 py-1.5 rounded-lg bg-[#0B0B0D] hover:bg-[#1E1E24] border border-[#C8A66A]/45 text-[11px] font-semibold text-[#C8A66A] cursor-pointer"
                        >
                          Rigjenero Kodin
                        </button>

                        {/* 2. Button in between Regenerate Code and View/Stop Sessions: Log Out Every Device */}
                        <button
                          type="button"
                          onClick={() => handleRevokeSessions(u.uid)}
                          title="Nxirr jashtë (Log Out) çdo pajisje nga kjo llogari"
                          className="px-3 py-1.5 rounded-lg bg-[#641C2B]/40 hover:bg-[#641C2B] border border-[#C8A66A]/40 text-[11px] font-semibold text-[#F4F0E8] flex items-center gap-1.5 cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5 text-[#C8A66A]" />
                          <span>Dil nga Çdo Pajisje</span>
                        </button>

                        {/* 3. View Sessions & Stop / Ban Individual Devices */}
                        <button
                          type="button"
                          onClick={() => openUserSessionsModal(u.uid)}
                          className="px-3 py-1.5 rounded-lg bg-[#641C2B] hover:bg-[#7D2336] border border-[#C8A66A] text-[11px] font-semibold text-[#F4F0E8] flex items-center gap-1.5 cursor-pointer shadow"
                        >
                          <Monitor className="w-3.5 h-3.5 text-[#C8A66A]" />
                          <span>Shiko Sesionet & Pajisjet</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateUserStatus(
                              u.uid,
                              u.status === 'active' ? 'suspended' : 'active'
                            )
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-[#0B0B0D] hover:bg-[#1E1E24] border border-[#202024] text-[11px] text-[#F4F0E8]/80 cursor-pointer"
                        >
                          {u.status === 'active' ? 'Pezullo' : 'Riaktivizo'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteUser(u.uid)}
                          aria-label={`Fshi përdoruesin ${u.displayName}`}
                          className="px-2.5 py-1.5 rounded-lg bg-[#641C2B]/50 hover:bg-[#641C2B] border border-[#C8A66A]/35 text-[11px] font-semibold text-[#F4F0E8] flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Fshi</span>
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 8: GRANULAR ACCESS RESTRICTIONS EDITOR */}
        {/* ========================================================= */}
        {activeTab === 'access' && (
          <div className="space-y-6">
            {data.users.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center space-y-3">
                <p className="text-xs text-[#F4F0E8]/65">
                  Krijoni fillimisht një përdorues tek seksioni &ldquo;Përdoruesit & Kodet&rdquo; për të konfiguruar kufizimet e detajuara.
                </p>
                <button
                  type="button"
                  onClick={() => handleSelectTab('users')}
                  className="px-4 py-2 rounded-xl bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] cursor-pointer"
                >
                  Shko tek Përdoruesit
                </button>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex-1 min-w-[260px]">
                    <label htmlFor="pol-user" className="block text-xs text-[#C8A66A] mb-1">
                      Zgjidh Përdoruesin për Konfigurim Aksesesh (Kodi i Plotë)
                    </label>
                    <select
                      id="pol-user"
                      value={selectedUserIdForPolicy}
                      onChange={(e) => setSelectedUserIdForPolicy(e.target.value)}
                      className="w-full max-w-xl px-4 py-2.5 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/45 text-sm font-mono-code text-[#F4F0E8]"
                    >
                      {data.users.map((u) => (
                        <option key={u.uid} value={u.uid}>
                          {u.displayName} — KODI: {u.fullCode || u.maskedCode} [{u.accessPolicy.preset}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {policySavedBanner && (
                    <div className="px-4 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Kufizimet u përditësuan në server!</span>
                    </div>
                  )}
                </div>

                {selectedPolicyUser && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#202024]">
                    {/* Time Controls */}
                    <div className="p-5 rounded-xl bg-[#0B0B0D] border border-[#202024] space-y-4">
                      <h3 className="text-sm font-serif-heritage font-bold text-[#C8A66A] flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>Kontrolli i Kohëzgjatjes së Aksesit</span>
                      </h3>

                      <div>
                        <label htmlFor="pol-dur" className="block text-xs text-[#F4F0E8]/75 mb-1">
                          Kohëzgjatja totale në minuta (nga hyrja e parë, bosh = pa kufi)
                        </label>
                        <input
                          id="pol-dur"
                          type="number"
                          value={selectedPolicyUser.accessPolicy.accessDurationMinutes ?? ''}
                          onChange={(e) =>
                            handleUpdateSelectedUserPolicy({
                              accessDurationMinutes: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          placeholder="Pa kufi kohor"
                          className="w-full px-3.5 py-2 rounded-xl bg-[#141418] border border-[#202024] text-sm font-mono-code text-[#F4F0E8]"
                        />
                      </div>

                      <div>
                        <label htmlFor="pol-daily" className="block text-xs text-[#F4F0E8]/75 mb-1">
                          Kuota Ditore (Minuta në ditë)
                        </label>
                        <input
                          id="pol-daily"
                          type="number"
                          value={selectedPolicyUser.accessPolicy.dailyUsageAllowanceMinutes ?? ''}
                          onChange={(e) =>
                            handleUpdateSelectedUserPolicy({
                              dailyUsageAllowanceMinutes: e.target.value
                                ? Number(e.target.value)
                                : null,
                            })
                          }
                          placeholder="Pa kufi ditor"
                          className="w-full px-3.5 py-2 rounded-xl bg-[#141418] border border-[#202024] text-sm font-mono-code text-[#F4F0E8]"
                        />
                      </div>

                      <div>
                        <label htmlFor="pol-max-titles" className="block text-xs text-[#F4F0E8]/75 mb-1">
                          Numri Maksimal i Video-Materialeve të Lejuara
                        </label>
                        <input
                          id="pol-max-titles"
                          type="number"
                          value={selectedPolicyUser.accessPolicy.maxAvailableTitles ?? ''}
                          onChange={(e) =>
                            handleUpdateSelectedUserPolicy({
                              maxAvailableTitles: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          placeholder="Të gjitha materialet"
                          className="w-full px-3.5 py-2 rounded-xl bg-[#141418] border border-[#202024] text-sm font-mono-code text-[#F4F0E8]"
                        />
                      </div>
                    </div>

                    {/* Feature Permissions */}
                    <div className="p-5 rounded-xl bg-[#0B0B0D] border border-[#202024] space-y-4">
                      <h3 className="text-sm font-serif-heritage font-bold text-[#C8A66A]">
                        Lejet e Seksioneve (Server-Enforced)
                      </h3>

                      <div className="space-y-3 text-sm">
                        <label className="flex items-center justify-between p-3 rounded-lg bg-[#141418] border border-[#202024] cursor-pointer">
                          <span>Lejo Shikimin e Videove Standarde (16:9)</span>
                          <input
                            type="checkbox"
                            checked={selectedPolicyUser.accessPolicy.streamingEnabled}
                            onChange={(e) =>
                              handleUpdateSelectedUserPolicy({
                                streamingEnabled: e.target.checked,
                              })
                            }
                          />
                        </label>

                        <label className="flex items-center justify-between p-3 rounded-lg bg-[#141418] border border-[#202024] cursor-pointer">
                          <span>Lejo MITO Shorts (9:16)</span>
                          <input
                            type="checkbox"
                            checked={selectedPolicyUser.accessPolicy.shortsEnabled}
                            onChange={(e) =>
                              handleUpdateSelectedUserPolicy({
                                shortsEnabled: e.target.checked,
                              })
                            }
                          />
                        </label>

                        <label className="flex items-center justify-between p-3 rounded-lg bg-[#141418] border border-[#202024] cursor-pointer">
                          <span>Lejo Lojërat & Kuizet Solo</span>
                          <input
                            type="checkbox"
                            checked={selectedPolicyUser.accessPolicy.soloGamesEnabled}
                            onChange={(e) =>
                              handleUpdateSelectedUserPolicy({
                                soloGamesEnabled: e.target.checked,
                                quizzesEnabled: e.target.checked,
                              })
                            }
                          />
                        </label>

                        <label className="flex items-center justify-between p-3 rounded-lg bg-[#141418] border border-[#202024] cursor-pointer">
                          <span>Lejo Multiplayer Lokal (Telefon si Kontroller)</span>
                          <input
                            type="checkbox"
                            checked={selectedPolicyUser.accessPolicy.localMultiplayerEnabled}
                            onChange={(e) =>
                              handleUpdateSelectedUserPolicy({
                                localMultiplayerEnabled: e.target.checked,
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 9: MULTIPLAYER LIVE ROOM INSPECTOR */}
        {/* ========================================================= */}
        {activeTab === 'multiplayer' && (
          <div className="space-y-4">
            <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
              Dhomat Multiplayer ({data.multiplayerRooms.length})
            </h2>
            {data.multiplayerRooms.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                Nuk ka dhoma multiplayer aktive në këtë moment.
              </div>
            ) : (
              data.multiplayerRooms.map((room) => (
                <div
                  key={room.roomCode}
                  className="p-5 rounded-2xl bg-[#141418] border border-[#202024] flex flex-wrap items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-xs font-mono-code text-[#C8A66A]">
                      KODI I DHOMËS: {room.roomCode} · STATUSI: {room.status.toUpperCase()}
                    </div>
                    <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                      {room.gameTitle}
                    </h3>
                    <p className="text-xs text-[#F4F0E8]/60">
                      {room.players.length} lojtarë të lidhur
                    </p>
                  </div>
                  {room.status !== 'terminated' && room.status !== 'finished' && (
                    <button
                      type="button"
                      onClick={() => handleTerminateRoom(room.roomCode)}
                      className="px-3.5 py-2 rounded-xl bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] cursor-pointer"
                    >
                      Mbyll Dhomën
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 10: LEADERBOARDS MODERATION */}
        {/* ========================================================= */}
        {activeTab === 'leaderboards' && (
          <div className="space-y-4">
            <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
              Moderimi i Renditjes Globale ({data.leaderboardEntries.length})
            </h2>
            {data.leaderboardEntries.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                Renditja është bosh.
              </div>
            ) : (
              data.leaderboardEntries.map((entry, idx) => (
                <div
                  key={entry.entryId}
                  className="p-4 rounded-2xl bg-[#141418] border border-[#202024] flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <span className="font-mono-code text-sm font-bold text-[#C8A66A]">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="text-sm font-bold text-[#F4F0E8]">
                        {entry.displayName}{' '}
                        <span className="text-xs font-mono-code text-[#F4F0E8]/50">
                          ({entry.maskedCode})
                        </span>
                      </div>
                      <div className="text-xs font-mono-code text-[#C8A66A]">
                        {entry.totalPoints} pikë · {entry.totalXp} XP · Saktësia:{' '}
                        {entry.accuracyPercent}%
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteLeaderboardEntry(entry.entryId)}
                    aria-label={`Fshi renditjen e ${entry.displayName}`}
                    className="px-3 py-1.5 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] border border-[#C8A66A]/35 text-xs font-semibold text-[#F4F0E8] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Fshi</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 11: DUAL VIDEO ANALYTICS & AUDIT LOGS (SECTION 6B) */}
        {/* ========================================================= */}
        {activeTab === 'analytics' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Shorts Analytics */}
              <div className="p-6 rounded-2xl bg-[#141418] border border-[#C8A66A]/35 space-y-4">
                <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-[#C8A66A]" />
                  <span>Analitika: MITO Shorts (9:16)</span>
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Total Shorts</div>
                    <div className="text-xl font-mono-code font-bold text-[#F4F0E8]">
                      {data.dualVideoAnalytics.totalShortsUploads}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Shikime Shorts</div>
                    <div className="text-xl font-mono-code font-bold text-[#C8A66A]">
                      {data.dualVideoAnalytics.totalShortsViews}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Kohëzgjatja Mes.</div>
                    <div className="text-xl font-mono-code font-bold text-[#F4F0E8]">
                      {data.dualVideoAnalytics.averageShortsWatchDurationSeconds}s
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-mono-code uppercase text-[#C8A66A]">
                    Shorts më të Shikuara
                  </h3>
                  {data.dualVideoAnalytics.mostViewedShorts.length === 0 ? (
                    <p className="text-xs text-[#F4F0E8]/50">Nuk ka ende të dhëna shikimi.</p>
                  ) : (
                    data.dualVideoAnalytics.mostViewedShorts.map((s) => (
                      <div
                        key={s.contentId}
                        className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024] flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[#F4F0E8] truncate">{s.title}</div>
                          <div className="font-mono-code text-[11px] text-[#C8A66A]">
                            {s.viewsCount} shikime · {s.likesCount} pëlqime · {s.resolution}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteContent(s.contentId)}
                          aria-label={`Fshi ${s.title}`}
                          className="px-2.5 py-1 rounded-lg bg-[#641C2B]/40 hover:bg-[#641C2B] border border-[#C8A66A]/35 text-[11px] font-semibold text-[#F4F0E8] flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Fshi</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Standard Streaming Analytics */}
              <div className="p-6 rounded-2xl bg-[#141418] border border-[#C8A66A]/35 space-y-4">
                <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
                  <Film className="w-5 h-5 text-[#C8A66A]" />
                  <span>Analitika: Video Standarde (16:9)</span>
                </h2>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Total Standarde</div>
                    <div className="text-xl font-mono-code font-bold text-[#F4F0E8]">
                      {data.dualVideoAnalytics.totalStandardUploads}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Shikime Standarde</div>
                    <div className="text-xl font-mono-code font-bold text-[#C8A66A]">
                      {data.dualVideoAnalytics.totalStandardViews}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                    <div className="text-[11px] text-[#F4F0E8]/55">Përfundimi Mes.</div>
                    <div className="text-xl font-mono-code font-bold text-[#F4F0E8]">
                      {data.dualVideoAnalytics.averageStandardCompletionPercent}%
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-mono-code uppercase text-[#C8A66A]">
                    Videot Standarde më të Shikuara
                  </h3>
                  {data.dualVideoAnalytics.mostViewedStandardVideos.length === 0 ? (
                    <p className="text-xs text-[#F4F0E8]/50">Nuk ka ende të dhëna shikimi.</p>
                  ) : (
                    data.dualVideoAnalytics.mostViewedStandardVideos.map((v) => (
                      <div
                        key={v.contentId}
                        className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024] flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-medium text-[#F4F0E8] truncate">{v.title}</div>
                          <div className="font-mono-code text-[11px] text-[#C8A66A]">
                            {v.viewsCount} shikime · {v.completionCount} zhbllokime · {v.resolution}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteContent(v.contentId)}
                          aria-label={`Fshi ${v.title}`}
                          className="px-2.5 py-1 rounded-lg bg-[#641C2B]/40 hover:bg-[#641C2B] border border-[#C8A66A]/35 text-[11px] font-semibold text-[#F4F0E8] flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Fshi</span>
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Security Audit Logs */}
            <div className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4">
              <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                Regjistri i Auditimit dhe Sigurisë ({data.auditLogs.length})
              </h2>
              {data.auditLogs.length === 0 ? (
                <p className="text-xs text-[#F4F0E8]/55">Nuk ka ende ngjarje të regjistruara.</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {data.auditLogs.slice(0, 30).map((log) => (
                    <div
                      key={log.logId}
                      className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024] flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono-code text-[#C8A66A]">{log.action}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#F4F0E8]/85">{log.details}</span>
                      </div>
                      <span className="font-mono-code text-[11px] text-[#F4F0E8]/45">
                        {new Date(log.timestamp).toLocaleString('sq-AL')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 12: SITE SETTINGS */}
        {/* ========================================================= */}
        {activeTab === 'settings' && (
          <form
            onSubmit={handleUpdateSettings}
            className="max-w-2xl p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-5"
          >
            <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
              Cilësimet e Platformës MITO
            </h2>

            <div>
              <label htmlFor="set-name" className="block text-xs text-[#C8A66A] mb-1">
                Emri i Platformës
              </label>
              <input
                id="set-name"
                type="text"
                value={data.siteSettings.platformName}
                onChange={(e) =>
                  setData({
                    ...data,
                    siteSettings: { ...data.siteSettings, platformName: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
              />
            </div>

            <div>
              <label htmlFor="set-tag" className="block text-xs text-[#C8A66A] mb-1">
                Tagline Zyrtare
              </label>
              <input
                id="set-tag"
                type="text"
                value={data.siteSettings.tagline}
                onChange={(e) =>
                  setData({
                    ...data,
                    siteSettings: { ...data.siteSettings, tagline: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="set-unlock" className="block text-xs text-[#C8A66A] mb-1">
                  Pragu Standard Watch-to-Unlock (%)
                </label>
                <input
                  id="set-unlock"
                  type="number"
                  min={10}
                  max={100}
                  value={data.siteSettings.defaultWatchToUnlockPercent}
                  onChange={(e) =>
                    setData({
                      ...data,
                      siteSettings: {
                        ...data.siteSettings,
                        defaultWatchToUnlockPercent: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm font-mono-code text-[#F4F0E8]"
                />
              </div>

              <div>
                <label htmlFor="set-upload" className="block text-xs text-[#C8A66A] mb-1">
                  Kufiri Maksimal i Ngarkimit (MB)
                </label>
                <input
                  id="set-upload"
                  type="number"
                  value={data.siteSettings.maxUploadSizeMb}
                  onChange={(e) =>
                    setData({
                      ...data,
                      siteSettings: {
                        ...data.siteSettings,
                        maxUploadSizeMb: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm font-mono-code text-[#F4F0E8]"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-center justify-between p-3 rounded-xl bg-[#0B0B0D] border border-[#202024] text-xs cursor-pointer">
                <span>Shfaq filigranin e sigurisë (Watermark me kodin e maskuar në video)</span>
                <input
                  type="checkbox"
                  checked={data.siteSettings.watermarkEnabled}
                  onChange={(e) =>
                    setData({
                      ...data,
                      siteSettings: {
                        ...data.siteSettings,
                        watermarkEnabled: e.target.checked,
                      },
                    })
                  }
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-[#0B0B0D] border border-[#202024] text-xs cursor-pointer">
                <span>Aktivizo Renditjen sipas Shkollave në Leaderboard</span>
                <input
                  type="checkbox"
                  checked={data.siteSettings.schoolRankingsEnabled}
                  onChange={(e) =>
                    setData({
                      ...data,
                      siteSettings: {
                        ...data.siteSettings,
                        schoolRankingsEnabled: e.target.checked,
                      },
                    })
                  }
                />
              </label>
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
            >
              Ruaj Cilësimet
            </button>
          </form>
        )}

        {/* ========================================================= */}
        {/* TAB 9: SUPPORT LIVE CHAT (AI + HUMAN SUPER ADMIN AGENT)   */}
        {/* ========================================================= */}
        {activeTab === 'support' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Left Column: Ticket Queue */}
            <div className="xl:col-span-4 p-4 rounded-2xl bg-[#141418] border border-[#202024] space-y-3 h-fit">
              <div className="flex items-center justify-between pb-2 border-b border-[#202024]">
                <div className="flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-[#C8A66A]" />
                  <h2 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                    Kërkesat e Supportit ({(data.supportTickets || []).filter((t) => t.status !== 'resolved').length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={fetchOverview}
                  className="px-2.5 py-1 rounded-lg bg-[#0B0B0D] border border-[#202024] text-[11px] text-[#C8A66A] cursor-pointer"
                >
                  Rifresko
                </button>
              </div>

              {(data.supportTickets || []).filter((t) => t.status !== 'resolved').length === 0 ? (
                <div className="p-6 rounded-xl bg-[#0B0B0D] border border-[#202024] text-center text-xs text-[#F4F0E8]/60">
                  Nuk ka ende biseda aktive të supportit. Kur një përdorues shkruan në faqen &ldquo;Kontakto Supportin&rdquo;, biseda shfaqet këtu.
                </div>
              ) : (
                <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                  {(data.supportTickets || [])
                    .filter((t) => t.status !== 'resolved')
                    .map((tkt) => {
                      const activeList = (data.supportTickets || []).filter(
                        (t) => t.status !== 'resolved'
                      );
                      const isSelected =
                        (selectedSupportTicketId || activeList[0]?.ticketId) ===
                        tkt.ticketId;
                      return (
                        <button
                          key={tkt.ticketId}
                          type="button"
                          onClick={() => setSelectedSupportTicketId(tkt.ticketId)}
                          className={`w-full p-3.5 rounded-xl border text-left transition-colors cursor-pointer space-y-1.5 ${
                            isSelected
                              ? 'bg-[#641C2B]/35 border-[#C8A66A]'
                              : 'bg-[#0B0B0D] border-[#202024] hover:border-[#C8A66A]/40'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-[#F4F0E8] truncate">
                              {tkt.userDisplayName}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                tkt.status === 'human_requested'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : tkt.status === 'human_active'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-[#641C2B]/40 text-[#C8A66A]'
                              }`}
                            >
                              {tkt.status === 'human_requested'
                                ? 'KËRKON NJERI'
                                : tkt.status === 'human_active'
                                ? 'AGJENT AKTIV'
                                : 'AI CHATBOT'}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono-code text-[#C8A66A]">
                            Kodi: {tkt.userMaskedCode}
                          </div>
                          <p className="text-xs text-[#F4F0E8]/70 line-clamp-2">
                            {tkt.lastMessagePreview}
                          </p>
                        </button>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Right Column: Active Support Conversation */}
            <div className="xl:col-span-8 p-5 rounded-2xl bg-[#141418] border border-[#202024] flex flex-col min-h-[540px]">
              {(() => {
                const activeList = (data.supportTickets || []).filter(
                  (t) => t.status !== 'resolved'
                );
                const activeTkt =
                  activeList.find(
                    (t) => t.ticketId === selectedSupportTicketId
                  ) || activeList[0];

                if (!activeTkt) {
                  return (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-2">
                      <Headphones className="w-10 h-10 text-[#C8A66A]" />
                      <h3 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                        Qendra e Supportit Live (AI + Agjent Njerëzor)
                      </h3>
                      <p className="text-xs text-[#F4F0E8]/60 max-w-md">
                        Zgjidhni një bisedë majtas për të parë mesazhet e përdoruesit me AI Chatbotin, për t&apos;iu përgjigjur si Agjent Njerëzor ose për të kontrolluar pajisjet e tij.
                      </p>
                    </div>
                  );
                }

                return (
                  <>
                    {/* Ticket Header */}
                    <div className="pb-4 border-b border-[#202024] flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                          {activeTkt.userDisplayName}{' '}
                          <span className="text-xs font-mono-code text-[#C8A66A]">
                            ({activeTkt.userMaskedCode})
                          </span>
                        </h3>
                        <p className="text-xs text-[#F4F0E8]/60">
                          Statusi:{' '}
                          <span className="text-[#C8A66A] font-semibold">
                            {activeTkt.status.toUpperCase()}
                          </span>
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openUserSessionsModal(activeTkt.userId)}
                          className="px-3 py-1.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] border border-[#C8A66A] text-xs font-semibold text-[#F4F0E8] flex items-center gap-1.5 cursor-pointer"
                        >
                          <Monitor className="w-3.5 h-3.5 text-[#C8A66A]" />
                          <span>Shiko Sesionet & Pajisjet e Përdoruesit</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleAdminSupportStatus(activeTkt.ticketId, 'ai_active')
                          }
                          className="px-3 py-1.5 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] border border-[#202024] text-xs text-[#C8A66A] cursor-pointer"
                        >
                          Kalo te AI
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            handleAdminSupportStatus(activeTkt.ticketId, 'resolved')
                          }
                          className="px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 text-xs text-emerald-300 cursor-pointer"
                        >
                          Shëno të Zgjidhur & Fshi
                        </button>
                      </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto py-4 space-y-3 max-h-[420px] pr-1">
                      {activeTkt.messages.map((m) => {
                        const isUser = m.senderRole === 'user';
                        const isAgent = m.senderRole === 'agent';
                        const isSystem = m.senderRole === 'system';

                        if (isSystem) {
                          return (
                            <div key={m.messageId} className="flex justify-center">
                              <span className="px-3 py-1 rounded-lg bg-[#0B0B0D] border border-[#C8A66A]/30 text-[11px] text-[#C8A66A]">
                                {m.text}
                              </span>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={m.messageId}
                            className={`flex flex-col ${
                              isAgent ? 'items-end' : 'items-start'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-1 text-[11px] text-[#F4F0E8]/65">
                              {isUser ? (
                                <Users className="w-3 h-3 text-[#C8A66A]" />
                              ) : isAgent ? (
                                <UserCheck className="w-3 h-3 text-emerald-400" />
                              ) : (
                                <Bot className="w-3 h-3 text-[#C8A66A]" />
                              )}
                              <span className="font-semibold">{m.senderName}</span>
                              <span className="font-mono-code text-[10px] text-[#F4F0E8]/45">
                                {new Date(
                                  m.createdAt || m.timestamp || new Date().toISOString()
                                ).toLocaleTimeString('sq-AL', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed ${
                                isAgent
                                  ? 'bg-emerald-950/60 border border-emerald-500/40 text-[#F4F0E8]'
                                  : isUser
                                  ? 'bg-[#641C2B] border border-[#C8A66A]/45 text-[#F4F0E8]'
                                  : 'bg-[#0B0B0D] border border-[#202024] text-[#F4F0E8]/90'
                              }`}
                            >
                              {m.text}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Reply Box */}
                    <form
                      onSubmit={(e) => handleAdminReplySupport(e, activeTkt.ticketId)}
                      className="pt-3 border-t border-[#202024] flex items-center gap-2.5"
                    >
                      <input
                        type="text"
                        value={adminSupportReplyText}
                        onChange={(e) => setAdminSupportReplyText(e.target.value)}
                        placeholder={`Shkruaj përgjigjen si Agjent Supporti për ${activeTkt.userDisplayName}...`}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/40 text-xs sm:text-sm text-[#F4F0E8] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={sendingSupportReply || !adminSupportReplyText.trim()}
                        className="px-5 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] disabled:opacity-50 border border-[#C8A66A]/50 text-xs font-semibold text-[#F4F0E8] flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5 text-[#C8A66A]" />
                        <span>Dërgo si Agjent</span>
                      </button>
                    </form>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* USER SESSIONS, DEVICES, WATCH HISTORY & DEVICE BANNING MODAL          */}
      {/* ===================================================================== */}
      {sessionsModalUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-4xl rounded-2xl bg-[#141418] border-2 border-[#C8A66A]/50 shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-5 bg-[#0B0B0D] border-b border-[#202024] flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono-code text-[#C8A66A] uppercase flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  <span>INSPEKTORI I PAJISJEVE & SESIONEVE TË LLOGARISË</span>
                </div>
                <h2 className="text-xl font-serif-heritage font-bold text-[#F4F0E8] mt-1">
                  {sessionsModalUser.displayName}{' '}
                  <span className="text-sm font-mono-code text-[#C8A66A]">
                    (Kodi: {sessionsModalUser.fullCode || sessionsModalUser.maskedCode})
                  </span>
                </h2>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleRegenerateUserCode(
                      sessionsModalUser.uid,
                      sessionsModalUser.displayName
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-[#141418] hover:bg-[#202024] border border-[#C8A66A]/45 text-xs font-semibold text-[#C8A66A] cursor-pointer"
                >
                  Rigjenero Kodin (Pa Log Out)
                </button>
                <button
                  type="button"
                  onClick={() => handleRevokeSessions(sessionsModalUser.uid)}
                  className="px-3 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] border border-[#C8A66A]/45 text-xs font-semibold text-[#F4F0E8] cursor-pointer"
                >
                  Dil nga Çdo Pajisje
                </button>
                <button
                  type="button"
                  onClick={() => setSessionsModalUser(null)}
                  className="p-2 rounded-xl bg-[#141418] hover:bg-[#202024] text-[#F4F0E8]/70 hover:text-[#F4F0E8] cursor-pointer"
                  aria-label="Mbyll modalin"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 max-h-[75vh] overflow-y-auto space-y-6">
              {loadingSessionsModal ? (
                <div className="py-10 text-center text-xs text-[#F4F0E8]/60">
                  Po ngarkohen pajisjet dhe aktiviteti i shikimit...
                </div>
              ) : (
                <>
                  {/* Active & Past Device Sessions */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-serif-heritage font-bold text-[#C8A66A] uppercase tracking-wider">
                      Pajisjet e Lidhura në Llogari ({userDeviceSessions.length})
                    </h3>

                    {userDeviceSessions.length === 0 ? (
                      <div className="p-6 rounded-xl bg-[#0B0B0D] border border-[#202024] text-xs text-[#F4F0E8]/60 text-center">
                        Ky përdorues nuk ka asnjë sesion të regjistruar aktualisht.
                      </div>
                    ) : (
                      userDeviceSessions.map((sess) => (
                        <div
                          key={sess.sessionId}
                          className={`p-4 rounded-2xl border space-y-3 ${
                            sess.isBanned
                              ? 'bg-red-950/25 border-red-500/50'
                              : sess.revoked
                              ? 'bg-[#0B0B0D]/60 border-[#202024] opacity-75'
                              : 'bg-[#0B0B0D] border-[#C8A66A]/40'
                          }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-[#F4F0E8] flex items-center gap-1.5">
                                  <Smartphone className="w-4 h-4 text-[#C8A66A]" />
                                  <span>{sess.deviceLabel}</span>
                                </span>

                                {sess.isBanned ? (
                                  <span className="px-2 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-[10px] font-bold text-red-300">
                                    E BLLOKUAR PËRGJITHMONË
                                  </span>
                                ) : sess.revoked ? (
                                  <span className="px-2 py-0.5 rounded bg-[#202024] text-[10px] font-semibold text-[#F4F0E8]/60">
                                    SESION I NDALUAR (LOGGED OUT)
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold text-emerald-300">
                                    AKTIVE TANI
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] font-mono-code text-[#F4F0E8]/60">
                                Pajisja ID: {sess.deviceId} · IP: {sess.ipAddress} · Aktiviteti i fundit:{' '}
                                {new Date(sess.lastSeenAt).toLocaleString('sq-AL')}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {!sess.revoked && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleStopSingleSession(
                                      sessionsModalUser.uid,
                                      sess.sessionId
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-xl bg-[#202024] hover:bg-[#641C2B] border border-[#C8A66A]/40 text-xs font-semibold text-[#F4F0E8] cursor-pointer"
                                >
                                  Ndalo Sesionin
                                </button>
                              )}

                              {!sess.isBanned ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleBanDeviceForever(
                                      sessionsModalUser.uid,
                                      sess.sessionId,
                                      sess.deviceId,
                                      sess.deviceLabel
                                    )
                                  }
                                  className="px-3 py-1.5 rounded-xl bg-red-900/60 hover:bg-red-800 border border-red-400/50 text-xs font-semibold text-red-100 flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Blloko Pajisjen Përgjithmonë</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUnbanDevice(sessionsModalUser.uid, sess.deviceId)
                                  }
                                  className="px-3 py-1.5 rounded-xl bg-emerald-900/50 hover:bg-emerald-800 border border-emerald-400/50 text-xs font-semibold text-emerald-100 flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Lejo Pajisjen Përsëri</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Device Activity Log: What they have been watching & at what time of the day */}
                          <div className="pt-2 border-t border-[#202024] space-y-1.5">
                            <div className="text-[11px] font-mono-code text-[#C8A66A] flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5" />
                              <span>
                                Çfarë ka parë dhe bërë kjo pajisje (Sipas Orës së Ditës):
                              </span>
                            </div>

                            {sess.activityLog.length === 0 ? (
                              <p className="text-xs text-[#F4F0E8]/50">
                                Nuk ka ende aktivitet shikimi në këtë sesion.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {sess.activityLog.slice(0, 8).map((act, aIdx) => (
                                  <div
                                    key={act.activityId || act.id || `act_${aIdx}`}
                                    className="p-2.5 rounded-xl bg-[#141418] border border-[#202024] flex items-start justify-between gap-2"
                                  >
                                    <div className="min-w-0">
                                      <div className="text-xs font-semibold text-[#F4F0E8] truncate">
                                        {act.title}
                                      </div>
                                      <div className="text-[11px] text-[#F4F0E8]/65">
                                        {act.details || act.detail}
                                      </div>
                                    </div>
                                    <span className="px-2 py-0.5 rounded bg-[#0B0B0D] border border-[#C8A66A]/35 text-[10px] font-mono-code text-[#C8A66A] shrink-0">
                                      Ora {act.timeOfDay}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Banned Devices List */}
                  {userBannedDevices.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-[#202024]">
                      <h3 className="text-sm font-serif-heritage font-bold text-red-300 uppercase">
                        Pajisjet e Ndaluara Përgjithmonë ({userBannedDevices.length})
                      </h3>
                      <div className="space-y-2">
                        {userBannedDevices.map((ban) => (
                          <div
                            key={ban.banId}
                            className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/40 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div>
                              <div className="text-xs font-bold text-[#F4F0E8]">
                                {ban.deviceLabel} ({ban.deviceId})
                              </div>
                              <div className="text-[11px] text-red-200/80">
                                Arsyeja: {ban.reason} · Bllokuar më:{' '}
                                {new Date(ban.bannedAt).toLocaleString('sq-AL')}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                handleUnbanDevice(
                                  sessionsModalUser.uid,
                                  ban.deviceId,
                                  ban.banId
                                )
                              }
                              className="px-3 py-1.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-400/50 text-xs font-semibold text-emerald-100 flex items-center gap-1.5 cursor-pointer"
                            >
                              <Unlock className="w-3.5 h-3.5" />
                              <span>Lejo Përsëri Hyrjen</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE DRIVE FOLDER SYNC & VIDEO CONTENT/QUESTIONNAIRE EDITOR MODAL */}
      {uploadModalMode && (
        <DualVideoUploadModal
          initialMode={uploadModalMode}
          existingContent={data.content}
          categories={data.categories}
          editingContent={editingContentItem}
          games={data.games}
          onClose={() => {
            setUploadModalMode(null);
            setEditingContentItem(null);
          }}
          onSaved={async (savedItem) => {
            setUploadModalMode(null);
            setEditingContentItem(null);
            await fetchOverview();
            onCatalogChanged();
            showSuccess(
              `Videoja "${savedItem.title}" u përditësua dhe u sinkronizua me sukses!`
            );
          }}
        />
      )}
    </div>
  );
};
