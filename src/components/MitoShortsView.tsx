import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Heart,
  Bookmark,
  Share2,
  Volume2,
  VolumeX,
  Play,
  Pause,
  ChevronUp,
  ChevronDown,
  BookOpen,
  Gamepad2,
  Smartphone,
  Plus,
  Check,
  Trash2,
  Home,
  Headphones,
  User as UserIcon,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../utils/sessionToken';
import type { VideoContent, UserAccount, GameItem } from '../types/mito';

interface MitoShortsViewProps {
  shorts: VideoContent[];
  allContent: VideoContent[];
  games: GameItem[];
  user: UserAccount;
  initialShortId?: string | null;
  onNavigate: (path: string) => void;
  onRefreshCatalog: () => void;
}

const TOP_TABS: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Për Ty' },
  { id: 'legend', label: 'Legjenda' },
  { id: 'folklore', label: 'Trashëgimi' },
];

export const MitoShortsView: React.FC<MitoShortsViewProps> = ({
  shorts,
  allContent,
  games,
  user,
  initialShortId,
  onNavigate,
  onRefreshCatalog,
}) => {
  const [selectedTab, setSelectedTab] = useState<string>('all');
  // activeIndex ranges from 0 .. filteredShorts.length
  // where index === filteredShorts.length is the "No more shorts" blank page at the end
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [localLikes, setLocalLikes] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [localSaves, setLocalSaves] = useState<Record<string, { saved: boolean; count: number }>>({});

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const touchStartYRef = useRef<number | null>(null);
  const wheelCooldownRef = useRef<number>(0);
  const watchedTimerRef = useRef<number>(0);

  const filteredShorts = shorts.filter((item) => {
    if (selectedTab === 'all') return true;
    if (selectedTab === 'legend') return item.type === 'legend' || item.type === 'history';
    return true;
  });

  // Total slides = all shorts + 1 final "no more shorts" blank screen
  const totalSlides = filteredShorts.length + 1;
  const isOnEndSlide = activeIndex >= filteredShorts.length;
  const activeShort = !isOnEndSlide ? filteredShorts[activeIndex] || null : null;

  const scrollToSlide = useCallback(
    (targetIndex: number) => {
      const clamped = Math.max(0, Math.min(totalSlides - 1, targetIndex));
      setActiveIndex(clamped);
      setProgressPercent(0);
      setCurrentTimeSec(0);
      setIsPlaying(clamped < filteredShorts.length);

      const container = feedContainerRef.current;
      if (container) {
        container.scrollTo({
          top: clamped * container.clientHeight,
          behavior: 'smooth',
        });
      }
    },
    [filteredShorts.length, totalSlides]
  );

  const prevShortsCountRef = useRef<number>(filteredShorts.length);

  useEffect(() => {
    const prevCount = prevShortsCountRef.current;
    prevShortsCountRef.current = filteredShorts.length;

    if (initialShortId && filteredShorts.length > 0) {
      const idx = filteredShorts.findIndex((s) => s.contentId === initialShortId);
      if (idx >= 0) {
        scrollToSlide(idx);
        return;
      }
    }

    // When catalog finishes loading asynchronously (0 -> N shorts), snap cleanly back to Slide 0
    if (prevCount === 0 && filteredShorts.length > 0) {
      requestAnimationFrame(() => {
        const container = feedContainerRef.current;
        if (container) {
          container.scrollTo({ top: 0, behavior: 'auto' });
        }
        setActiveIndex(0);
        setIsPlaying(true);
      });
    }
  }, [initialShortId, filteredShorts.length, scrollToSlide]);

  const goToNext = useCallback(() => {
    if (activeIndex < totalSlides - 1) {
      scrollToSlide(activeIndex + 1);
    }
  }, [activeIndex, totalSlides, scrollToSlide]);

  const goToPrev = useCallback(() => {
    if (activeIndex > 0) {
      scrollToSlide(activeIndex - 1);
    }
  }, [activeIndex, scrollToSlide]);

  // Sync activeIndex when user scrolls natively via CSS scroll-snap
  const handleFeedScroll = () => {
    const container = feedContainerRef.current;
    if (!container || container.clientHeight === 0) return;
    const newIndex = Math.round(container.scrollTop / container.clientHeight);
    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < totalSlides) {
      setActiveIndex(newIndex);
      setProgressPercent(0);
      setCurrentTimeSec(0);
      setIsPlaying(newIndex < filteredShorts.length);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === ' ') {
        e.preventDefault();
        if (!isOnEndSlide) {
          setIsPlaying((p) => !p);
        }
      } else if (e.key.toLowerCase() === 'm') {
        setIsMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, isOnEndSlide]);

  // Record playback session & progress for active short
  useEffect(() => {
    if (!activeShort) return;
    let cancelled = false;
    watchedTimerRef.current = 0;

    apiFetch(`/api/content/${activeShort.contentId}/playback-session`, {
      method: 'POST',
    }).catch(() => {});

    const duration = Math.max(5, activeShort.durationSeconds || 10);
    const interval = window.setInterval(() => {
      if (cancelled || !isPlaying) return;
      watchedTimerRef.current += 1;
      const nextSec = watchedTimerRef.current % (duration + 1);
      setCurrentTimeSec(nextSec);
      setProgressPercent(Math.min(100, Math.round((nextSec / duration) * 100)));

      if (watchedTimerRef.current % 5 === 0) {
        apiFetch(`/api/content/${activeShort.contentId}/heartbeat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentTimeSeconds: nextSec,
            segmentStart: Math.max(0, nextSec - 5),
            segmentEnd: nextSec,
          }),
        }).catch(() => {});
      }
    }, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeShort?.contentId, isPlaying]);

  // Play active short video and pause all inactive ones (including when scrolled to the blank end page)
  useEffect(() => {
    filteredShorts.forEach((shortItem, idx) => {
      const vid = videoRefs.current[shortItem.contentId];
      if (!vid) return;

      if (idx === activeIndex && !isOnEndSlide) {
        vid.muted = isMuted;
        if (isPlaying) {
          const playPromise = vid.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              vid.muted = true;
              setIsMuted(true);
              vid.play().catch(() => {});
            });
          }
        } else {
          vid.pause();
        }
      } else {
        vid.pause();
        vid.currentTime = 0;
      }
    });
  }, [activeIndex, isOnEndSlide, isPlaying, isMuted, filteredShorts]);

  const handleInteract = async (contentId: string, action: 'like' | 'save') => {
    try {
      const res = await apiFetch(`/api/shorts/${contentId}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setLocalLikes((prev) => ({
          ...prev,
          [contentId]: { liked: data.liked, count: data.likesCount },
        }));
        setLocalSaves((prev) => ({
          ...prev,
          [contentId]: { saved: data.saved, count: data.savesCount },
        }));
        onRefreshCatalog();
      }
    } catch {
      // Ignore error
    }
  };

  const handleShare = (shortItem: VideoContent) => {
    const shareUrl = `${window.location.origin}/shorts?id=${shortItem.contentId}`;
    navigator.clipboard?.writeText(shareUrl);
    setCopiedShareId(shortItem.contentId);
    setTimeout(() => setCopiedShareId(null), 2000);
  };

  const handleDeleteActiveShort = async (contentId: string) => {
    try {
      let res = await apiFetch(`/api/admin/content/${contentId}/delete`, {
        method: 'POST',
      });
      if (!res.ok) {
        res = await apiFetch(`/api/admin/content/${contentId}`, {
          method: 'DELETE',
        });
      }
      if (res.ok) {
        scrollToSlide(0);
        onRefreshCatalog();
      }
    } catch {
      // Ignore error
    }
  };

  const isSuperAdmin = user.role === 'super_admin';
  const policy = user.accessPolicy;

  const bottomNavTabs = [
    { label: 'Kreu', path: '/home', icon: Home, visible: true },
    { label: 'Shorts', path: '/shorts', icon: Smartphone, visible: true },
    {
      label: 'Lojëra',
      path: '/games',
      icon: Gamepad2,
      visible:
        isSuperAdmin ||
        policy.soloGamesEnabled ||
        policy.quizzesEnabled ||
        policy.localMultiplayerEnabled ||
        policy.globalChallengesEnabled,
    },
    { label: 'Support', path: '/support', icon: Headphones, visible: true },
    { label: 'Profili', path: '/profile', icon: UserIcon, visible: true },
  ].filter((t) => t.visible);

  return (
    <div
      data-testid="mito-shorts-fullscreen"
      className="fixed inset-0 z-50 bg-black text-[#F4F0E8] flex flex-col overflow-hidden select-none"
    >
      {/* 1. TIKTOK-STYLE FLOATING TOP TABS BAR */}
      <header className="absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/85 via-black/45 to-transparent pt-[env(safe-area-inset-top,0px)]">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          {/* Left: MITO Back Button */}
          <button
            type="button"
            onClick={() => onNavigate('/home')}
            className="min-h-[38px] flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/50 hover:bg-black/75 backdrop-blur-md border border-white/15 text-xs font-serif-heritage font-bold text-[#C8A66A] transition-colors cursor-pointer"
          >
            <span>MITO</span>
          </button>

          {/* Center: TikTok-Style Feed Tabs */}
          <nav aria-label="Kategoritë Shorts" className="flex items-center gap-5">
            {TOP_TABS.map((tab) => {
              const active = selectedTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSelectedTab(tab.id);
                    scrollToSlide(0);
                  }}
                  className={`relative py-1.5 text-sm font-semibold transition-colors cursor-pointer ${
                    active ? 'text-[#F4F0E8]' : 'text-[#F4F0E8]/60 hover:text-[#F4F0E8]/90'
                  }`}
                >
                  <span>{tab.label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-[#C8A66A]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Mute / Sound Toggle */}
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? 'Aktivizo zërin' : 'Hesht zërin'}
            className="w-9 h-9 rounded-full bg-black/45 backdrop-blur-md border border-white/15 flex items-center justify-center text-[#F4F0E8] hover:border-[#C8A66A] transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-[#C8A66A]" /> : <Volume2 className="w-4 h-4 text-[#C8A66A]" />}
          </button>
        </div>
      </header>

      {/* 2. FULL-SCREEN VERTICAL SNAP FEED (Shorts Slides + Final "No More Shorts" Blank Slide) */}
      <div
        ref={feedContainerRef}
        onScroll={handleFeedScroll}
        onWheel={(e) => {
          const now = Date.now();
          if (now - wheelCooldownRef.current < 550) return;
          if (e.deltaY > 35) {
            wheelCooldownRef.current = now;
            goToNext();
          } else if (e.deltaY < -35) {
            wheelCooldownRef.current = now;
            goToPrev();
          }
        }}
        onTouchStart={(e) => {
          touchStartYRef.current = e.touches[0].clientY;
        }}
        onTouchEnd={(e) => {
          if (touchStartYRef.current === null) return;
          const deltaY = touchStartYRef.current - e.changedTouches[0].clientY;
          if (deltaY > 55) goToNext();
          else if (deltaY < -55) goToPrev();
          touchStartYRef.current = null;
        }}
        className="flex-1 w-full h-full overflow-y-scroll snap-y snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {filteredShorts.map((shortItem, idx) => {
          const isCurrentSlide = idx === activeIndex && !isOnEndSlide;
          const isLiked =
            localLikes[shortItem.contentId]?.liked ??
            user.likedShortIds.includes(shortItem.contentId);
          const likesCount =
            localLikes[shortItem.contentId]?.count ?? shortItem.likesCount ?? 0;

          const isSaved =
            localSaves[shortItem.contentId]?.saved ??
            user.savedContentIds.includes(shortItem.contentId);
          const savesCount =
            localSaves[shortItem.contentId]?.count ?? shortItem.savesCount ?? 0;

          const linkedFullStory = shortItem.linkedContentId
            ? allContent.find((c) => c.contentId === shortItem.linkedContentId)
            : null;

          const linkedGame =
            shortItem.relatedGameIds.length > 0
              ? games.find((g) => shortItem.relatedGameIds.includes(g.gameId))
              : games.find((g) => g.linkedContentId === shortItem.contentId);

          return (
            <div
              key={shortItem.contentId}
              data-testid="mito-shorts-player"
              className="relative w-full h-full snap-start snap-always flex items-center justify-center bg-black overflow-hidden"
            >
              {/* Full-Screen 9:16 Video Stage */}
              <div
                onClick={() => setIsPlaying((p) => !p)}
                className="relative w-full h-full sm:w-auto sm:h-full sm:aspect-[9/16] bg-black flex items-center justify-center cursor-pointer overflow-hidden"
              >
                <img
                  src={shortItem.thumbnailUrl || shortItem.posterUrl}
                  alt={shortItem.title}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover opacity-60 blur-sm scale-105"
                />
                <video
                  ref={(el) => {
                    videoRefs.current[shortItem.contentId] = el;
                  }}
                  src={shortItem.playbackUrl}
                  poster={shortItem.thumbnailUrl || shortItem.posterUrl}
                  playsInline
                  loop
                  muted={isMuted}
                  className="relative z-10 w-full h-full object-cover"
                />

                {/* Center Pause Indicator Overlay */}
                {isCurrentSlide && !isPlaying && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/25 pointer-events-none">
                    <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-md border border-[#C8A66A]/50 flex items-center justify-center text-[#F4F0E8]">
                      <Play className="w-7 h-7 fill-current text-[#C8A66A] ml-1" />
                    </div>
                  </div>
                )}

                {/* Bottom Gradient Scrim for Readability */}
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/15 to-black/35 pointer-events-none" />

                {/* Bottom-Left Video Info & Right-Side TikTok Action Column */}
                <div className="absolute inset-x-0 bottom-0 z-20 p-4 pb-6 flex items-end justify-between gap-3 pointer-events-none">
                  {/* Left: Creator, Title, Description, Tags */}
                  <div className="flex-1 min-w-0 space-y-2 pointer-events-auto">
                    <p className="text-[11px] font-mono-code text-[#E4C88E] tracking-wide drop-shadow flex items-center gap-1.5">
                      <span>@{shortItem.creatorAttribution?.replace(/\s+/g, '') || 'MITO_Zyrtare'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{shortItem.region || 'Shqipëri'}</span>
                    </p>

                    <h2 className="text-base sm:text-lg font-serif-heritage font-bold text-[#F4F0E8] leading-snug drop-shadow">
                      {shortItem.title}
                    </h2>

                    <p className="text-xs text-[#F4F0E8]/85 line-clamp-2 leading-relaxed">
                      {shortItem.description || shortItem.synopsis}
                    </p>

                    {shortItem.tags.length > 0 && (
                      <div className="text-[11px] font-medium text-[#C8A66A] flex flex-wrap items-center gap-1.5">
                        {shortItem.tags.slice(0, 4).map((tag) => (
                          <span key={tag}>#{tag}</span>
                        ))}
                      </div>
                    )}

                    {(linkedFullStory || linkedGame) && (
                      <div className="pt-1 flex flex-wrap items-center gap-2">
                        {linkedFullStory && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate(`/content/${linkedFullStory.contentId}`);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 transition-colors cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5 text-[#C8A66A]" />
                            <span>Shiko historinë</span>
                          </button>
                        )}
                        {linkedGame && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate(`/games/${linkedGame.gameId}`);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202024]/90 hover:bg-[#C8A66A] hover:text-[#0B0B0D] text-xs font-semibold text-[#C8A66A] border border-[#C8A66A]/40 transition-colors cursor-pointer"
                          >
                            <Gamepad2 className="w-3.5 h-3.5" />
                            <span>Luaj Kuizin</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Right: TikTok Vertical Action Bar */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex flex-col items-center gap-4 shrink-0 pointer-events-auto"
                  >
                    {/* Like */}
                    <button
                      type="button"
                      onClick={() => handleInteract(shortItem.contentId, 'like')}
                      aria-label="Pëlqeje videon"
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center border transition-transform active:scale-90 ${
                          isLiked
                            ? 'bg-[#641C2B] border-[#C8A66A] text-[#C8A66A]'
                            : 'bg-black/55 backdrop-blur-md border-white/20 text-[#F4F0E8]'
                        }`}
                      >
                        <Heart className={`w-5 h-5 ${isLiked ? 'fill-[#C8A66A]' : ''}`} />
                      </div>
                      <span className="text-[11px] font-mono-code text-[#F4F0E8]">{likesCount}</span>
                    </button>

                    {/* Save */}
                    <button
                      type="button"
                      onClick={() => handleInteract(shortItem.contentId, 'save')}
                      aria-label="Ruaje videon"
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <div
                        className={`w-11 h-11 rounded-full flex items-center justify-center border transition-transform active:scale-90 ${
                          isSaved
                            ? 'bg-[#C8A66A] border-[#C8A66A] text-[#0B0B0D]'
                            : 'bg-black/55 backdrop-blur-md border-white/20 text-[#F4F0E8]'
                        }`}
                      >
                        <Bookmark className={`w-5 h-5 ${isSaved ? 'fill-current' : ''}`} />
                      </div>
                      <span className="text-[11px] font-mono-code text-[#F4F0E8]">{savesCount}</span>
                    </button>

                    {/* Share */}
                    <button
                      type="button"
                      onClick={() => handleShare(shortItem)}
                      aria-label="Ndaje videon"
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <div className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-md border border-white/20 flex items-center justify-center text-[#F4F0E8]">
                        {copiedShareId === shortItem.contentId ? (
                          <Check className="w-5 h-5 text-[#C8A66A]" />
                        ) : (
                          <Share2 className="w-5 h-5" />
                        )}
                      </div>
                      <span className="text-[11px] text-[#F4F0E8]/90">
                        {copiedShareId === shortItem.contentId ? 'U kopjua' : 'Ndaj'}
                      </span>
                    </button>

                    {/* Super Admin Delete */}
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => handleDeleteActiveShort(shortItem.contentId)}
                        aria-label={`Fshi ${shortItem.title}`}
                        className="flex flex-col items-center gap-1 cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-[#641C2B]/90 border border-[#C8A66A]/45 flex items-center justify-center text-[#F4F0E8]">
                          <Trash2 className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] text-[#C8A66A]">Fshi</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Thin Bottom Progress Bar along bottom edge of the video */}
                {isCurrentSlide && (
                  <div className="absolute bottom-0 inset-x-0 z-30 h-1 bg-white/20">
                    <div
                      className="h-full bg-[#C8A66A] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Desktop Floating Up/Down Scroll Controls */}
              <div className="hidden sm:flex flex-col items-center gap-3 absolute right-6 top-1/2 -translate-y-1/2 z-30">
                <button
                  type="button"
                  onClick={goToPrev}
                  disabled={activeIndex === 0}
                  aria-label="Videoja e mëparshme"
                  className="w-11 h-11 rounded-full bg-[#141418]/90 hover:bg-[#202024] disabled:opacity-30 border border-[#C8A66A]/35 flex items-center justify-center text-[#F4F0E8] transition-colors cursor-pointer"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  aria-label=" Kaloni më poshtë"
                  className="w-11 h-11 rounded-full bg-[#141418]/90 hover:bg-[#202024] border border-[#C8A66A]/35 flex items-center justify-center text-[#F4F0E8] transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
              </div>
            </div>
          );
        })}

        {/* FINAL SLIDE: Blank Screen when scrolling past the last Short ("No more shorts, soon others will be uploaded") */}
        <div
          data-testid="mito-shorts-end-screen"
          className="relative w-full h-full snap-start snap-always bg-[#09090C] flex flex-col items-center justify-center px-6 text-center overflow-hidden"
        >
          <div
            className="pointer-events-none absolute inset-0 mito-aura-drift"
            style={{
              background:
                'radial-gradient(circle at 50% 45%, rgba(100,28,43,0.22) 0%, rgba(200,166,106,0.05) 38%, transparent 70%)',
            }}
          />
          <div className="relative z-10 max-w-md mx-auto space-y-5 mito-reveal">
            <div className="w-16 h-16 rounded-full bg-[#111116] border border-[#C8A66A]/45 flex items-center justify-center mx-auto shadow-[0_0_40px_rgba(200,166,106,0.18)] mito-float-subtle">
              <Sparkles className="w-7 h-7 text-[#C8A66A]" />
            </div>

            <div className="space-y-2.5">
              <h2 className="text-xl sm:text-2xl font-serif-heritage font-bold text-[#F4F0E8]">
                Nuk ka më video Shorts për momentin
              </h2>
              <p className="text-sm text-[#F4F0E8]/70 leading-relaxed">
                Keni parë të gjitha videot e shkurtra aktuale. Së shpejti do të ngarkohen video të tjera në platformë!
              </p>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              {filteredShorts.length > 0 && (
                <button
                  type="button"
                  onClick={() => scrollToSlide(0)}
                  className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 mito-cta-primary flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-[#C8A66A]" />
                  <span>Shiko Përsëri nga Fillimi</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onNavigate('/home')}
                className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-[#C8A66A] border border-white/[0.1] flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Kthehu në Kreu</span>
              </button>
            </div>

            {isSuperAdmin && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('/admin/content?upload=short')}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C8A66A]/85 hover:text-[#C8A66A] underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ngarko Shorts të reja nga Paneli Admin</span>
                </button>
              </div>
            )}
          </div>

          {/* Desktop Up Button to return to previous video */}
          {filteredShorts.length > 0 && (
            <div className="hidden sm:flex flex-col items-center gap-3 absolute right-6 top-1/2 -translate-y-1/2 z-30">
              <button
                type="button"
                onClick={goToPrev}
                aria-label="Kthehu te videoja"
                className="w-11 h-11 rounded-full bg-[#111116]/90 hover:bg-[#1E1E26] border border-[#C8A66A]/35 flex items-center justify-center text-[#F4F0E8] transition-colors cursor-pointer"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. TIKTOK-STYLE BOTTOM NAVIGATION TABS BAR */}
      <nav
        aria-label="Navigimi i poshtëm Shorts"
        className="relative z-30 w-full bg-[#09090C]/92 backdrop-blur-xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom,0px)]"
      >
        <div className="max-w-lg mx-auto grid grid-cols-5 gap-1 px-2 py-1.5">
          {bottomNavTabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.path === '/shorts';
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => onNavigate(tab.path)}
                className={`min-h-[48px] py-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'text-[#C8A66A] font-semibold'
                    : 'text-[#F4F0E8]/65 hover:text-[#F4F0E8]'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#C8A66A]' : 'text-[#F4F0E8]/70'}`} />
                <span className="text-[11px] leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
