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
  Search,
  Check,
  Trash2,
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

const SHORT_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all', label: 'Të gjitha' },
  { id: 'legend', label: 'Legjenda' },
  { id: 'folklore', label: 'Folklor' },
  { id: 'mythology', label: 'Mitologji' },
  { id: 'tradition', label: 'Tradita & Valle' },
  { id: 'history', label: 'Fakte Historike' },
  { id: 'documentary', label: 'Klipe Dokumentare' },
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
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [copiedShareId, setCopiedShareId] = useState<string | null>(null);
  const [localLikes, setLocalLikes] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [localSaves, setLocalSaves] = useState<Record<string, { saved: boolean; count: number }>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const watchedTimerRef = useRef<number>(0);

  const filteredShorts = shorts.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.type === selectedCategory;
    const matchesSearch =
      !searchFilter.trim() ||
      item.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.description.toLowerCase().includes(searchFilter.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchFilter.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  useEffect(() => {
    if (initialShortId && filteredShorts.length > 0) {
      const idx = filteredShorts.findIndex((s) => s.contentId === initialShortId);
      if (idx >= 0) setActiveIndex(idx);
    }
  }, [initialShortId, filteredShorts.length]);

  const activeShort = filteredShorts[activeIndex] || filteredShorts[0] || null;

  const goToNext = useCallback(() => {
    if (filteredShorts.length <= 1) return;
    setActiveIndex((prev) => (prev + 1) % filteredShorts.length);
    setProgressPercent(0);
    setCurrentTimeSec(0);
    setIsPlaying(true);
  }, [filteredShorts.length]);

  const goToPrev = useCallback(() => {
    if (filteredShorts.length <= 1) return;
    setActiveIndex((prev) => (prev - 1 + filteredShorts.length) % filteredShorts.length);
    setProgressPercent(0);
    setCurrentTimeSec(0);
    setIsPlaying(true);
  }, [filteredShorts.length]);

  // Keyboard navigation for desktop & TV
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
        setIsPlaying((p) => !p);
      } else if (e.key.toLowerCase() === 'm') {
        setIsMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev]);

  // Start playback session & record real view + periodic heartbeat when activeShort changes
  useEffect(() => {
    if (!activeShort) return;
    let cancelled = false;
    watchedTimerRef.current = 0;

    apiFetch(`/api/content/${activeShort.contentId}/playback-session`, {
      method: 'POST',
    }).catch(() => {});

    const duration = Math.max(5, activeShort.durationSeconds || 30);
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

  // Sync HTML5 video play/pause/mute state with automatic muted fallback if browser blocks unmuted autoplay
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    vid.muted = isMuted;
    vid.volume = volume;
    if (isPlaying) {
      const p = vid.play();
      if (p !== undefined) {
        p.catch(() => {
          vid.muted = true;
          setIsMuted(true);
          vid.play().catch(() => {});
        });
      }
    } else {
      vid.pause();
    }
  }, [isPlaying, isMuted, volume, activeShort?.contentId]);

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
        setActiveIndex(0);
        onRefreshCatalog();
      }
    } catch {
      // Ignore error
    }
  };

  if (shorts.length === 0) {
    return (
      <section className="max-w-5xl mx-auto px-4 py-16 text-center">
        <div className="bg-[#141418] border border-[#202024] rounded-2xl p-12 max-w-xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-[#641C2B]/25 border border-[#C8A66A]/35 flex items-center justify-center mx-auto mb-5">
            <Smartphone className="w-7 h-7 text-[#C8A66A]" />
          </div>
          <h1 className="text-2xl font-serif-heritage font-bold text-[#F4F0E8]">
            MITO Shorts (9:16) është ende e zbrazët
          </h1>
          <p className="mt-2 text-sm text-[#F4F0E8]/65">
            Ende nuk është publikuar asnjë video e shkurtër vertikale (legjenda të shkurtra, fakte folklorike, valle tradicionale ose klipe dokumentare).
          </p>
          {user.role === 'super_admin' && (
            <button
              type="button"
              onClick={() => onNavigate('/admin/content?upload=short')}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#C8A66A]" />
              <span>Ngarko Video Vertikale (MITO Shorts)</span>
            </button>
          )}
        </div>
      </section>
    );
  }

  const nextShort =
    filteredShorts.length > 1
      ? filteredShorts[(activeIndex + 1) % filteredShorts.length]
      : null;

  const isLiked = activeShort
    ? localLikes[activeShort.contentId]?.liked ?? user.likedShortIds.includes(activeShort.contentId)
    : false;
  const likesCount = activeShort
    ? localLikes[activeShort.contentId]?.count ?? activeShort.likesCount ?? 0
    : 0;

  const isSaved = activeShort
    ? localSaves[activeShort.contentId]?.saved ?? user.savedContentIds.includes(activeShort.contentId)
    : false;
  const savesCount = activeShort
    ? localSaves[activeShort.contentId]?.count ?? activeShort.savesCount ?? 0
    : 0;

  const linkedFullStory =
    activeShort?.linkedContentId
      ? allContent.find((c) => c.contentId === activeShort.linkedContentId)
      : null;

  const linkedGame =
    activeShort && activeShort.relatedGameIds.length > 0
      ? games.find((g) => activeShort.relatedGameIds.includes(g.gameId))
      : games.find((g) => g.linkedContentId === activeShort?.contentId);

  return (
    <section className="min-h-[calc(100vh-4rem)] bg-[#0B0B0D] flex flex-col">
      {/* Top Discovery Filter Strip */}
      <div className="border-b border-[#202024] bg-[#141418]/80 px-4 lg:px-8 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {SHORT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setActiveIndex(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-[#641C2B] text-[#F4F0E8] border border-[#C8A66A]/40'
                    : 'text-[#F4F0E8]/70 hover:text-[#F4F0E8] hover:bg-[#202024]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#C8A66A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => {
                  setSearchFilter(e.target.value);
                  setActiveIndex(0);
                }}
                placeholder="Filtro MITO Shorts..."
                aria-label="Filtro MITO Shorts"
                className="pl-8 pr-3 py-1.5 rounded-lg bg-[#0B0B0D] border border-[#202024] focus:border-[#C8A66A] text-xs text-[#F4F0E8] placeholder-[#F4F0E8]/40 focus:outline-none"
              />
            </div>
            <span className="text-xs font-mono-code text-[#C8A66A] whitespace-nowrap">
              {filteredShorts.length > 0 ? `${activeIndex + 1} / ${filteredShorts.length}` : '0 / 0'}
            </span>
          </div>
        </div>
      </div>

      {/* Main 9:16 Vertical Viewport */}
      {!activeShort ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-sm text-[#F4F0E8]/60">
            Nuk u gjet asnjë MITO Short për këtë filtër.
          </p>
        </div>
      ) : (
        <div
          className="flex-1 flex items-center justify-center px-2 py-4 lg:py-6 relative select-none"
          onTouchStart={(e) => {
            touchStartYRef.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            if (touchStartYRef.current === null) return;
            const deltaY = touchStartYRef.current - e.changedTouches[0].clientY;
            if (deltaY > 50) goToNext();
            else if (deltaY < -50) goToPrev();
            touchStartYRef.current = null;
          }}
        >
          {/* Preload next vertical video invisibly for instant swipe transition */}
          {nextShort && (
            <link rel="preload" as="video" href={nextShort.playbackUrl} />
          )}

          <div className="flex items-center gap-4 lg:gap-6">
            {/* Centered 9:16 Vertical Player Frame */}
            <div
              data-testid="mito-shorts-player"
              className="relative w-[min(92vw,410px)] aspect-[9/16] bg-[#141418] rounded-2xl overflow-hidden border border-[#C8A66A]/30 shadow-[0_24px_64px_rgba(0,0,0,0.85)] flex flex-col justify-between"
            >
              {/* Background Poster + Video Element */}
              <div
                onClick={() => setIsPlaying((p) => !p)}
                className="absolute inset-0 bg-[#0B0B0D] flex items-center justify-center cursor-pointer"
              >
                <img
                  src={activeShort.thumbnailUrl || activeShort.posterUrl}
                  alt={activeShort.title}
                  referrerPolicy="no-referrer"
                  className={`w-full h-full ${
                    activeShort.cropMode === 'crop_9_16' ? 'object-cover' : 'object-contain'
                  } opacity-85`}
                />
                <video
                  ref={videoRef}
                  key={activeShort.contentId}
                  src={activeShort.playbackUrl}
                  poster={activeShort.thumbnailUrl || activeShort.posterUrl}
                  playsInline
                  loop
                  muted={isMuted}
                  className={`absolute inset-0 w-full h-full ${
                    activeShort.cropMode === 'crop_9_16' ? 'object-cover' : 'object-contain'
                  }`}
                />
                {/* Scrim for readable text */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/40 pointer-events-none" />
              </div>

              {/* Top Controls Bar inside 9:16 frame */}
              <div className="relative z-10 flex items-center justify-between p-4">
                <div className="text-xs font-medium text-[#F4F0E8]/90">
                  <span>MITO Shorts</span>
                  <span aria-hidden="true" className="mx-1.5 text-[#C8A66A]">·</span>
                  <span className="font-mono-code text-[#C8A66A]">{activeShort.resolution}</span>
                </div>

                <div className="flex items-center gap-2">
                  {user.role === 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteActiveShort(activeShort.contentId)}
                      aria-label={`Fshi ${activeShort.title}`}
                      className="px-2.5 py-1.5 rounded-lg bg-[#641C2B]/90 hover:bg-[#641C2B] text-[#F4F0E8] border border-[#C8A66A]/45 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Fshi</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsPlaying((p) => !p)}
                    aria-label={isPlaying ? 'Ndalo videon' : 'Luaj videon'}
                    className="p-2 rounded-lg bg-black/55 hover:bg-black/80 text-[#F4F0E8] border border-white/15 cursor-pointer"
                  >
                    {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMuted((m) => !m)}
                    aria-label={isMuted ? 'Aktivizo zërin' : 'Hesht zërin'}
                    className="p-2 rounded-lg bg-black/55 hover:bg-black/80 text-[#F4F0E8] border border-white/15 cursor-pointer"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setVolume(val);
                      setIsMuted(val === 0);
                    }}
                    aria-label="Volumi i zërit"
                    className="w-16 accent-[#C8A66A] cursor-pointer"
                  />
                </div>
              </div>

              {/* Right Action Dock & Bottom Metadata inside 9:16 frame */}
              <div className="relative z-10 p-4 space-y-3">
                <div className="flex items-end justify-between gap-3">
                  {/* Left Story Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="text-xs text-[#C8A66A] flex flex-wrap items-center gap-1.5">
                      <span>{activeShort.type.toUpperCase()}</span>
                      <span aria-hidden="true">·</span>
                      <span>{activeShort.region || 'Shqipëri'}</span>
                      {activeShort.creatorAttribution && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{activeShort.creatorAttribution}</span>
                        </>
                      )}
                    </div>

                    <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8] leading-snug">
                      {activeShort.title}
                    </h2>

                    <p className="text-xs text-[#F4F0E8]/80 line-clamp-3">
                      {activeShort.description || activeShort.synopsis}
                    </p>

                    {activeShort.tags.length > 0 && (
                      <div className="text-[11px] text-[#C8A66A]/90 flex flex-wrap items-center gap-1.5">
                        {activeShort.tags.map((tag, i) => (
                          <React.Fragment key={tag}>
                            {i > 0 && <span aria-hidden="true">·</span>}
                            <span>#{tag}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}

                    {/* Optional Linked Full Story & Related Quiz Actions */}
                    <div className="pt-1 flex flex-wrap items-center gap-2">
                      {linkedFullStory && (
                        <button
                          type="button"
                          onClick={() => onNavigate(`/content/${linkedFullStory.contentId}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 transition-colors cursor-pointer"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-[#C8A66A]" />
                          <span>Shiko historinë e plotë</span>
                        </button>
                      )}

                      {linkedGame && (
                        <button
                          type="button"
                          onClick={() => onNavigate(`/games/${linkedGame.gameId}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#202024] hover:bg-[#C8A66A] hover:text-[#0B0B0D] text-xs font-semibold text-[#C8A66A] border border-[#C8A66A]/40 transition-colors cursor-pointer"
                        >
                          <Gamepad2 className="w-3.5 h-3.5" />
                          <span>Luaj Kuizin</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right Vertical Action Buttons (Like, Save, Share) */}
                  <div className="flex flex-col items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleInteract(activeShort.contentId, 'like')}
                      aria-label="Pëlqeje videon"
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
                          isLiked
                            ? 'bg-[#641C2B] border-[#C8A66A] text-[#C8A66A]'
                            : 'bg-black/60 border-white/20 text-[#F4F0E8] group-hover:border-[#C8A66A]'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${isLiked ? 'fill-[#C8A66A]' : ''}`} />
                      </div>
                      <span className="text-[11px] font-mono-code text-[#F4F0E8]">{likesCount}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleInteract(activeShort.contentId, 'save')}
                      aria-label="Ruaje videon"
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
                          isSaved
                            ? 'bg-[#C8A66A] border-[#C8A66A] text-[#0B0B0D]'
                            : 'bg-black/60 border-white/20 text-[#F4F0E8] group-hover:border-[#C8A66A]'
                        }`}
                      >
                        <Bookmark className={`w-4 h-4 ${isSaved ? 'fill-current' : ''}`} />
                      </div>
                      <span className="text-[11px] font-mono-code text-[#F4F0E8]">{savesCount}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleShare(activeShort)}
                      aria-label="Ndaje videon"
                      className="flex flex-col items-center gap-1 cursor-pointer group"
                    >
                      <div className="w-10 h-10 rounded-full bg-black/60 border border-white/20 group-hover:border-[#C8A66A] flex items-center justify-center text-[#F4F0E8] transition-colors">
                        {copiedShareId === activeShort.contentId ? (
                          <Check className="w-4 h-4 text-[#C8A66A]" />
                        ) : (
                          <Share2 className="w-4 h-4" />
                        )}
                      </div>
                      <span className="text-[11px] text-[#F4F0E8]/80">
                        {copiedShareId === activeShort.contentId ? 'U kopjua' : 'Ndaj'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Progress Indicator Bar */}
                <div className="pt-1">
                  <div className="flex items-center justify-between text-[10px] font-mono-code text-[#F4F0E8]/65 mb-1">
                    <span>{currentTimeSec}s</span>
                    <span>{activeShort.durationSeconds}s</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#C8A66A] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Desktop Vertical Navigation Controls */}
            <div className="hidden sm:flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={goToPrev}
                disabled={filteredShorts.length <= 1}
                aria-label="Videoja e mëparshme"
                className="w-11 h-11 rounded-full bg-[#141418] hover:bg-[#202024] disabled:opacity-40 border border-[#C8A66A]/35 flex items-center justify-center text-[#F4F0E8] transition-colors cursor-pointer"
              >
                <ChevronUp className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={goToNext}
                disabled={filteredShorts.length <= 1}
                aria-label="Videoja tjetër"
                className="w-11 h-11 rounded-full bg-[#141418] hover:bg-[#202024] disabled:opacity-40 border border-[#C8A66A]/35 flex items-center justify-center text-[#F4F0E8] transition-colors cursor-pointer"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
