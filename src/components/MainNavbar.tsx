import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Clock,
  Shield,
  LogOut,
  X,
  Play,
  Smartphone,
  Gamepad2,
  MoreHorizontal,
  Headphones,
  User as UserIcon,
  Trophy,
  Home,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import type { UserAccount, VideoContent, GameItem } from '../types/mito';

interface MainNavbarProps {
  user: UserAccount & {
    accessEvaluation?: {
      remainingMinutes?: number | null;
      lowTimeWarningSq?: string | null;
    };
  };
  currentPath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}

export const MainNavbar: React.FC<MainNavbarProps> = ({
  user,
  currentPath,
  onNavigate,
  onLogout,
}) => {
  const [threeDotsOpen, setThreeDotsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    shorts: VideoContent[];
    standardVideos: VideoContent[];
    games: GameItem[];
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const policy = user.accessPolicy;
  const isSuperAdmin = user.role === 'super_admin';

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(ev.target as Node)) {
        setThreeDotsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Desktop navigation items filtered by user permissions
  const navItems = [
    { label: 'Kreu', path: '/home', visible: true },
    { label: 'Legjenda', path: '/legjenda', visible: isSuperAdmin || policy.streamingEnabled },
    { label: 'Shorts', path: '/shorts', visible: isSuperAdmin || policy.shortsEnabled },
    {
      label: 'Lojëra',
      path: '/games',
      visible:
        isSuperAdmin ||
        policy.soloGamesEnabled ||
        policy.quizzesEnabled ||
        policy.localMultiplayerEnabled ||
        policy.globalChallengesEnabled,
    },
    { label: 'Renditja', path: '/leaderboard', visible: true },
    { label: 'Support', path: '/support', visible: true },
    { label: 'Profili', path: '/profile', visible: true },
  ].filter((item) => item.visible);

  // Phone bottom navigation bar items (large 48px touch targets)
  const mobileBottomTabs = [
    { label: 'Kreu', path: '/home', icon: Home, visible: true },
    { label: 'Shorts', path: '/shorts', icon: Smartphone, visible: isSuperAdmin || policy.shortsEnabled },
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
  ].filter((item) => item.visible);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch {
      // Ignore search error
    } finally {
      setSearching(false);
    }
  };

  const remainingMin = user.accessEvaluation?.remainingMinutes;
  const lowTimeWarningSq = user.accessEvaluation?.lowTimeWarningSq;

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-[#0B0B0D]/95 backdrop-blur-md border-b border-[#202024] safe-top-header">
        {/* Low remaining time alert banner */}
        {lowTimeWarningSq && (
          <div className="bg-[#641C2B] text-[#F4F0E8] text-xs py-1.5 px-4 text-center font-medium">
            {lowTimeWarningSq}
          </div>
        )}

        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('/home')}
            className="cursor-pointer focus:outline-none whitespace-nowrap shrink-0 min-h-[44px] flex items-center"
          >
            <BrandLogo variant="compact" size="sm" />
          </button>

          {/* Zone 2: Desktop Navigation Links */}
          <nav
            aria-label="Navigimi kryesor"
            className="hidden xl:flex items-center gap-5 text-sm font-medium"
          >
            {navItems.map((item) => {
              const active =
                currentPath === item.path ||
                (item.path !== '/home' && currentPath.startsWith(item.path));
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => onNavigate(item.path)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    active
                      ? 'text-[#C8A66A] border-[#C8A66A] font-semibold'
                      : 'text-[#F4F0E8]/75 border-transparent hover:text-[#F4F0E8]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Search, Profile, Three-Dots Support Menu & Admin Switch */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {remainingMin !== null && remainingMin !== undefined && (
              <div
                title="Koha e mbetur e aksesit"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#C8A66A] font-mono-code px-2.5 py-1 rounded bg-[#141418] border border-[#202024] whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{remainingMin} min</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Kërko në MITO"
              className="min-h-[42px] min-w-[42px] rounded-xl text-[#F4F0E8]/85 hover:text-[#C8A66A] bg-[#141418] hover:bg-[#202024] border border-[#202024] flex items-center justify-center transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('/admin')}
                className="min-h-[42px] inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-[#C8A66A]" />
                <span className="hidden sm:inline">Paneli Admin</span>
                <span className="sm:hidden">Admin</span>
              </button>
            )}

            {/* Profile & Three-Dots (•••) Menu with Contact Support */}
            <div className="relative flex items-center gap-1" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => onNavigate('/profile')}
                className={`min-h-[42px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-l-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  currentPath === '/profile'
                    ? 'bg-[#641C2B] text-[#F4F0E8] border-[#C8A66A]/50'
                    : 'bg-[#141418] hover:bg-[#202024] text-[#F4F0E8] border-[#202024]'
                }`}
              >
                <UserIcon className="w-3.5 h-3.5 text-[#C8A66A]" />
                <span>Profili</span>
              </button>

              <button
                type="button"
                onClick={() => setThreeDotsOpen((prev) => !prev)}
                aria-label="Më shumë opsione dhe Kontakto Supportin"
                title="Menuja e Profilit & Supportit"
                className={`min-h-[42px] min-w-[40px] px-2 rounded-r-xl border flex items-center justify-center transition-colors cursor-pointer ${
                  threeDotsOpen || currentPath === '/support'
                    ? 'bg-[#641C2B] text-[#C8A66A] border-[#C8A66A]/50'
                    : 'bg-[#141418] hover:bg-[#202024] text-[#C8A66A] border-[#202024]'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {threeDotsOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-2xl bg-[#141418] border border-[#C8A66A]/40 shadow-2xl p-2 z-50 space-y-1">
                  <div className="px-3 py-2 border-b border-[#202024]">
                    <p className="text-xs font-semibold text-[#F4F0E8] truncate">
                      {user.displayName}
                    </p>
                    <p className="text-[11px] font-mono-code text-[#C8A66A]">
                      {user.maskedCode}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setThreeDotsOpen(false);
                      onNavigate('/support');
                    }}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] border border-[#C8A66A]/35 text-left text-xs font-semibold text-[#F4F0E8] flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Headphones className="w-4 h-4 text-[#C8A66A] shrink-0" />
                    <div>
                      <div className="text-[#F4F0E8]">Kontakto Supportin</div>
                      <div className="text-[10px] text-[#C8A66A] font-normal">
                        Live Chat me AI & Agjent Njerëzor
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setThreeDotsOpen(false);
                      onNavigate('/profile');
                    }}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl hover:bg-[#202024] text-left text-xs font-medium text-[#F4F0E8]/90 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4 text-[#C8A66A]" />
                    <span>Profili & Llogaria Ime</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setThreeDotsOpen(false);
                      onNavigate('/leaderboard');
                    }}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl hover:bg-[#202024] text-left text-xs font-medium text-[#F4F0E8]/90 flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Trophy className="w-4 h-4 text-[#C8A66A]" />
                    <span>Renditja Kombëtare</span>
                  </button>

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setThreeDotsOpen(false);
                        onNavigate('/admin/support');
                      }}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl hover:bg-[#202024] text-left text-xs font-medium text-[#C8A66A] flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Shield className="w-4 h-4 text-[#C8A66A]" />
                      <span>Qendra e Supportit (Admin)</span>
                    </button>
                  )}

                  <div className="pt-1 border-t border-[#202024]">
                    <button
                      type="button"
                      onClick={() => {
                        setThreeDotsOpen(false);
                        onLogout();
                      }}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl hover:bg-red-950/40 text-left text-xs font-medium text-red-300 flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-red-400" />
                      <span>Dil nga Llogaria</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Phone-Friendly Fixed Bottom Tab Bar (Thumb Zone for iPhone 17 & Mobile) */}
      <nav
        aria-label="Navigimi celular"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0B0B0D]/95 backdrop-blur-lg border-t border-[#202024] safe-bottom-nav"
      >
        <div className="grid grid-cols-5 gap-1 px-2 pt-1.5">
          {mobileBottomTabs.map((tab) => {
            const Icon = tab.icon;
            const active =
              currentPath === tab.path ||
              (tab.path !== '/home' && currentPath.startsWith(tab.path));
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => onNavigate(tab.path)}
                className={`min-h-[48px] py-1.5 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                  active
                    ? 'text-[#C8A66A] bg-[#641C2B]/30 font-semibold'
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

      {/* Global Search Overlay */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B0B0D]/90 flex items-start justify-center pt-20 px-4">
          <div className="w-full max-w-2xl bg-[#141418] border border-[#C8A66A]/35 rounded-2xl p-5 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#202024]">
              <div className="flex items-center gap-3 flex-1">
                <Search className="w-5 h-5 text-[#C8A66A]" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Kërko legjenda, MITO Shorts (9:16), dokumentarë ose lojëra..."
                  aria-label="Kërko në platformë"
                  className="w-full bg-transparent text-sm text-[#F4F0E8] placeholder-[#F4F0E8]/40 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Mbyll kërkimin"
                className="p-2 rounded-lg text-[#F4F0E8]/60 hover:text-[#F4F0E8] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-5">
              {searching && (
                <p className="text-xs text-[#F4F0E8]/60 text-center py-4">Po kërkohet...</p>
              )}

              {!searching && searchQuery && searchResults && (
                <>
                  {/* Standard Videos */}
                  <div>
                    <h3 className="text-xs font-semibold text-[#C8A66A] mb-2">
                      Video Standarde & Legjenda ({searchResults.standardVideos.length})
                    </h3>
                    {searchResults.standardVideos.length === 0 ? (
                      <p className="text-xs text-[#F4F0E8]/45">Nuk u gjet asnjë video standarde.</p>
                    ) : (
                      <div className="space-y-2">
                        {searchResults.standardVideos.map((vid) => (
                          <button
                            key={vid.contentId}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              onNavigate(`/watch/${vid.contentId}`);
                            }}
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] text-left transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <Play className="w-4 h-4 text-[#C8A66A]" />
                              <div>
                                <p className="text-sm font-medium text-[#F4F0E8]">{vid.title}</p>
                                <p className="text-xs text-[#F4F0E8]/55">
                                  {vid.type} · {vid.resolution} · {Math.max(1, Math.round(vid.durationSeconds / 60))} min
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-[#C8A66A]">Shiko →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* MITO Shorts */}
                  <div>
                    <h3 className="text-xs font-semibold text-[#C8A66A] mb-2">
                      MITO Shorts 9:16 ({searchResults.shorts.length})
                    </h3>
                    {searchResults.shorts.length === 0 ? (
                      <p className="text-xs text-[#F4F0E8]/45">Nuk u gjet asnjë video vertikale Shorts.</p>
                    ) : (
                      <div className="space-y-2">
                        {searchResults.shorts.map((sh) => (
                          <button
                            key={sh.contentId}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              onNavigate(`/shorts?id=${sh.contentId}`);
                            }}
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] text-left transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <Smartphone className="w-4 h-4 text-[#C8A66A]" />
                              <div>
                                <p className="text-sm font-medium text-[#F4F0E8]">{sh.title}</p>
                                <p className="text-xs text-[#F4F0E8]/55">
                                  MITO Short · {sh.resolution} · {sh.durationSeconds}s
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-[#C8A66A]">Hap Shorts →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Games */}
                  <div>
                    <h3 className="text-xs font-semibold text-[#C8A66A] mb-2">
                      Lojëra & Kuize ({searchResults.games.length})
                    </h3>
                    {searchResults.games.length === 0 ? (
                      <p className="text-xs text-[#F4F0E8]/45">Nuk u gjet asnjë lojë.</p>
                    ) : (
                      <div className="space-y-2">
                        {searchResults.games.map((gm) => (
                          <button
                            key={gm.gameId}
                            type="button"
                            onClick={() => {
                              setSearchOpen(false);
                              onNavigate(`/games/${gm.gameId}`);
                            }}
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] text-left transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-3">
                              <Gamepad2 className="w-4 h-4 text-[#C8A66A]" />
                              <div>
                                <p className="text-sm font-medium text-[#F4F0E8]">{gm.title}</p>
                                <p className="text-xs text-[#F4F0E8]/55">
                                  {gm.difficulty} · {gm.questionCount} pyetje
                                </p>
                              </div>
                            </div>
                            <span className="text-xs text-[#C8A66A]">Luaj →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
