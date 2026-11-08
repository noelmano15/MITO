/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, ArrowRight } from 'lucide-react';
import { testFirestoreConnection } from './lib/firebase';
import { apiFetch } from './utils/sessionToken';
import { BrandLogo } from './components/BrandLogo';
import { StartupIntroOverlay } from './components/StartupIntroOverlay';
import { LoginView } from './components/LoginView';
import { MainNavbar } from './components/MainNavbar';
import { StreamingHomeView } from './components/StreamingHomeView';
import { MitoShortsView } from './components/MitoShortsView';
import { ContentDetailsView } from './components/ContentDetailsView';
import { StandardVideoPlayerView } from './components/StandardVideoPlayerView';
import { GameCenterView } from './components/GameCenterView';
import { MultiplayerHostView, MobileControllerView } from './components/MultiplayerViews';
import { LeaderboardView, UserProfileView } from './components/LeaderboardProfileViews';
import { SupportChatView } from './components/SupportChatView';
import { AdminDashboardView, type AdminTabId } from './components/AdminDashboardView';
import type {
  UserAccount,
  VideoContent,
  CategoryItem,
  EpisodeItem,
  PlaybackProgressRecord,
  GameItem,
} from './types/mito';

export default function App() {
  const [showStartupIntro, setShowStartupIntro] = useState<boolean>(() => {
    try {
      if (window.location.pathname.startsWith('/watch/')) return false;
      return sessionStorage.getItem('mito_intro_seen_session') !== '1';
    } catch {
      return true;
    }
  });
  const [currentPath, setCurrentPath] = useState<string>(() => window.location.pathname || '/');
  const [currentSearch, setCurrentSearch] = useState<string>(() => window.location.search || '');
  const [authChecking, setAuthChecking] = useState(true);
  const [superAdminExists, setSuperAdminExists] = useState(false);
  const [requiresBootstrapSecret, setRequiresBootstrapSecret] = useState(false);
  const [user, setUser] = useState<UserAccount | null>(null);
  const [expiredReasonSq, setExpiredReasonSq] = useState<string | null>(null);

  // User Catalog State
  const [standardVideos, setStandardVideos] = useState<VideoContent[]>([]);
  const [shortVideos, setShortVideos] = useState<VideoContent[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [progressList, setProgressList] = useState<PlaybackProgressRecord[]>([]);
  const [games, setGames] = useState<
    Array<
      GameItem & {
        unlockStatus?: {
          unlocked: boolean;
          requiredPercent: number;
          currentPercent: number;
          remainingPercent?: number;
        };
      }
    >
  >([]);

  const navigate = useCallback((nextUrl: string) => {
    const [pathname, searchPart] = nextUrl.split('?');
    const cleanPath = pathname || '/';
    const cleanSearch = searchPart ? `?${searchPart}` : '';
    window.history.pushState({}, '', `${cleanPath}${cleanSearch}`);
    setCurrentPath(cleanPath);
    setCurrentSearch(cleanSearch);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    testFirestoreConnection();
    const onPopState = () => {
      setCurrentPath(window.location.pathname || '/');
      setCurrentSearch(window.location.search || '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const fetchCatalog = useCallback(async () => {
    try {
      const res = await apiFetch('/api/catalog');
      if (!res.ok) return;
      const data = await res.json();
      setStandardVideos(data.standardVideos || []);
      setShortVideos(data.shortVideos || []);
      setCategories(data.categories || []);
      setEpisodes(data.episodes || []);
      setProgressList(data.progress || []);
      setGames(data.games || []);
    } catch {
      // Ignore network error during initial load
    }
  }, []);

  const checkSessionAndBootstrap = useCallback(async () => {
    setAuthChecking(true);
    try {
      const [sessionRes, bootRes] = await Promise.all([
        apiFetch('/api/auth/session'),
        apiFetch('/api/auth/bootstrap-status'),
      ]);
      const sessionData = await sessionRes.json();
      const bootData = await bootRes.json();

      setSuperAdminExists(Boolean(bootData.superAdminExists ?? sessionData.superAdminExists));
      setRequiresBootstrapSecret(Boolean(bootData.requiresBootstrapSecret));

      if (sessionData.expiredReasonSq) {
        setExpiredReasonSq(sessionData.expiredReasonSq);
        setUser(null);
        navigate('/access-expired');
        return;
      }

      if (sessionData.authenticated && sessionData.user) {
        setUser(sessionData.user);
        await fetchCatalog();
        if (window.location.pathname === '/' || window.location.pathname === '/login') {
          navigate(sessionData.user.role === 'super_admin' ? '/admin' : '/home');
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthChecking(false);
    }
  }, [fetchCatalog, navigate]);

  useEffect(() => {
    checkSessionAndBootstrap();
  }, [checkSessionAndBootstrap]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    navigate('/login');
  };

  // =========================================================
  // 0. STARTUP INTRO ANIMATION WITH AUDIO ON EVERY WEBSITE OPEN
  // =========================================================
  if (showStartupIntro) {
    return (
      <StartupIntroOverlay
        onComplete={() => {
          try {
            sessionStorage.setItem('mito_intro_seen_session', '1');
          } catch {
            // Ignore
          }
          setShowStartupIntro(false);
        }}
      />
    );
  }

  // =========================================================
  // 1. PUBLIC CONTROLLER ROUTES (/join AND /controller/:roomCode)
  // Mobile phone controller does not require a personal account
  // =========================================================
  if (currentPath === '/join' || currentPath.startsWith('/controller/')) {
    const urlParams = new URLSearchParams(currentSearch);
    const roomFromPath = currentPath.startsWith('/controller/')
      ? currentPath.replace('/controller/', '').split('/')[0]
      : urlParams.get('room');
    return <MobileControllerView initialRoomCode={roomFromPath} onNavigate={navigate} />;
  }

  // =========================================================
  // 2. ACCESS EXPIRED ROUTE (/access-expired)
  // =========================================================
  if (currentPath === '/access-expired') {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-[#F4F0E8] flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full p-8 rounded-2xl bg-[#141418] border border-[#641C2B] text-center space-y-5 shadow-2xl">
          <BrandLogo variant="emblem" size="md" className="mx-auto" />
          <ShieldAlert className="w-12 h-12 text-[#C8A66A] mx-auto" />
          <h1 className="text-2xl font-serif-heritage font-bold text-[#F4F0E8]">
            Sesioni yt ka përfunduar.
          </h1>
          <p className="text-sm text-[#F4F0E8]/75 leading-relaxed">
            {expiredReasonSq ||
              'Koha e caktuar e aksesit për kodin tuaj ka përfunduar. Kontakti me administratorin kërkohet për të aktivizuar aksesin.'}
          </p>
          <button
            type="button"
            onClick={() => {
              setExpiredReasonSq(null);
              navigate('/login');
            }}
            className="w-full py-3.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>Kthehu në Hyrje</span>
            <ArrowRight className="w-4 h-4 text-[#C8A66A]" />
          </button>
        </div>
      </div>
    );
  }

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-[#F4F0E8] flex flex-col items-center justify-center gap-4">
        <BrandLogo variant="emblem" size="md" />
        <div className="text-xs font-mono-code tracking-widest text-[#C8A66A] uppercase">
          MITO · LEGJENDA · HISTORI · LOJËRA
        </div>
      </div>
    );
  }

  // =========================================================
  // 3. UNauthenticated -> LOGIN VIEW (/login or /)
  // =========================================================
  if (!user) {
    return (
      <LoginView
        superAdminExists={superAdminExists}
        requiresBootstrapSecret={requiresBootstrapSecret}
        initialErrorSq={expiredReasonSq}
        onLoginSuccess={async (loggedInUser, redirectTo) => {
          setUser(loggedInUser);
          await fetchCatalog();
          navigate(redirectTo);
        }}
        onNavigate={navigate}
        onBootstrapCompleted={() => {
          setSuperAdminExists(true);
        }}
      />
    );
  }

  // =========================================================
  // 4. SUPER ADMIN PANEL ROUTES (/admin/*)
  // Strictly isolated to Super Admin role
  // =========================================================
  if (currentPath.startsWith('/admin')) {
    if (user.role !== 'super_admin') {
      return (
        <div className="min-h-screen bg-[#0B0B0D] text-[#F4F0E8] flex flex-col items-center justify-center p-6">
          <div className="max-w-md w-full p-8 rounded-2xl bg-[#141418] border border-[#641C2B] text-center space-y-4">
            <ShieldAlert className="w-10 h-10 text-[#C8A66A] mx-auto" />
            <h1 className="text-xl font-serif-heritage font-bold">Akses i Kufizuar</h1>
            <p className="text-xs text-[#F4F0E8]/70">
              Ky seksion është i rezervuar vetëm për Super Administratorin e platformës MITO.
            </p>
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="px-5 py-2.5 rounded-xl bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] cursor-pointer"
            >
              Kthehu në Kreu
            </button>
          </div>
        </div>
      );
    }

    const subTab = currentPath.replace('/admin', '').replace(/^\//, '') as AdminTabId;
    const validTabs: AdminTabId[] = [
      'dashboard',
      'content',
      'categories',
      'episodes',
      'media',
      'games',
      'users',
      'access',
      'support',
      'multiplayer',
      'leaderboards',
      'analytics',
      'settings',
    ];
    const resolvedTab: AdminTabId = validTabs.includes(subTab) ? subTab : 'dashboard';

    return (
      <AdminDashboardView
        user={user}
        initialTab={resolvedTab}
        onNavigate={navigate}
        onLogout={handleLogout}
        onCatalogChanged={fetchCatalog}
      />
    );
  }

  // =========================================================
  // 5. AUTHENTICATED USER PLATFORM ROUTES
  // =========================================================
  const allContent = [...standardVideos, ...shortVideos];
  const searchParams = new URLSearchParams(currentSearch);

  let mainView: React.ReactNode = null;

  if (currentPath === '/shorts') {
    const initialShortId = searchParams.get('id');
    mainView = (
      <MitoShortsView
        shorts={shortVideos}
        allContent={allContent}
        games={games}
        user={user}
        initialShortId={initialShortId}
        onNavigate={navigate}
        onRefreshCatalog={fetchCatalog}
      />
    );
  } else if (currentPath.startsWith('/content/')) {
    const contentId = currentPath.replace('/content/', '').split('/')[0];
    mainView = (
      <ContentDetailsView
        contentId={contentId}
        user={user}
        onNavigate={navigate}
        onRefreshCatalog={fetchCatalog}
      />
    );
  } else if (currentPath.startsWith('/watch/')) {
    const contentId = currentPath.replace('/watch/', '').split('/')[0];
    mainView = (
      <StandardVideoPlayerView
        contentId={contentId}
        onNavigate={navigate}
        onAccessExpired={(reasonSq) => {
          setExpiredReasonSq(reasonSq);
          setUser(null);
          navigate('/access-expired');
        }}
      />
    );
  } else if (currentPath === '/games' || currentPath.startsWith('/games/')) {
    const selectedGameId = currentPath.startsWith('/games/')
      ? currentPath.replace('/games/', '').split('/')[0]
      : null;
    mainView = (
      <GameCenterView
        games={games}
        selectedGameId={selectedGameId}
        user={user}
        onNavigate={navigate}
        onRefreshSession={() => {
          checkSessionAndBootstrap();
          fetchCatalog();
        }}
      />
    );
  } else if (currentPath.startsWith('/play/') && currentPath.endsWith('/host')) {
    const roomCode = currentPath.replace('/play/', '').replace('/host', '').split('/')[0];
    mainView = <MultiplayerHostView roomCode={roomCode} onNavigate={navigate} />;
  } else if (currentPath === '/leaderboard') {
    mainView = <LeaderboardView />;
  } else if (currentPath === '/support') {
    mainView = <SupportChatView user={user} onNavigate={navigate} />;
  } else if (currentPath === '/profile') {
    mainView = (
      <UserProfileView
        user={user}
        onNavigate={navigate}
        onProfileUpdated={(updatedUser) => {
          setUser(updatedUser);
        }}
      />
    );
  } else if (currentPath === '/legjenda') {
    mainView = (
      <StreamingHomeView
        standardVideos={standardVideos}
        shortVideos={shortVideos}
        progressList={progressList}
        games={games}
        user={user}
        filterCategoryType="legend"
        categoryTitleSq="Legjenda Shqiptare"
        onNavigate={navigate}
        onRefreshCatalog={fetchCatalog}
      />
    );
  } else if (currentPath === '/histori') {
    mainView = (
      <StreamingHomeView
        standardVideos={standardVideos}
        shortVideos={shortVideos}
        progressList={progressList}
        games={games}
        user={user}
        filterCategoryType="history"
        categoryTitleSq="Histori Kombëtare"
        onNavigate={navigate}
        onRefreshCatalog={fetchCatalog}
      />
    );
  } else if (currentPath === '/mitologji') {
    mainView = (
      <StreamingHomeView
        standardVideos={standardVideos}
        shortVideos={shortVideos}
        progressList={progressList}
        games={games}
        user={user}
        filterCategoryType="mythology"
        categoryTitleSq="Mitologji & Folklor"
        onNavigate={navigate}
        onRefreshCatalog={fetchCatalog}
      />
    );
  } else if (currentPath === '/tradita') {
    mainView = (
      <StreamingHomeView
        standardVideos={standardVideos}
        shortVideos={shortVideos}
        progressList={progressList}
        games={games}
        user={user}
        filterCategoryType="tradition"
        categoryTitleSq="Tradita, Zakone & Valle"
        onNavigate={navigate}
        onRefreshCatalog={fetchCatalog}
      />
    );
  } else if (currentPath === '/dokumentare') {
    mainView = (
      <StreamingHomeView
        standardVideos={standardVideos}
        shortVideos={shortVideos}
        progressList={progressList}
        games={games}
        user={user}
        filterCategoryType="documentary"
        categoryTitleSq="Dokumentarë Kulturorë"
        onNavigate={navigate}
        onRefreshCatalog={fetchCatalog}
      />
    );
  } else {
    mainView = (
      <StreamingHomeView
        standardVideos={standardVideos}
        shortVideos={shortVideos}
        progressList={progressList}
        games={games}
        user={user}
        filterCategoryType={null}
        onNavigate={navigate}
        onRefreshCatalog={fetchCatalog}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#F4F0E8] flex flex-col">
      <MainNavbar
        user={user}
        currentPath={currentPath}
        onNavigate={navigate}
        onLogout={handleLogout}
      />
      <div className="flex-1">{mainView}</div>
    </div>
  );
}
