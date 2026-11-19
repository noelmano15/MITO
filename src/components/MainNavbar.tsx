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
    const handleKey = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        setSearchOpen((prev) => !prev);
      } else if (ev.key === 'Escape') {
        setSearchOpen(false);
        setThreeDotsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
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

  // Compact mobile bottom navigation bar (maintains <= 15% sticky height cap)
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
      <header className="sticky top-0 z-40 w-full bg-[#09090C]/85 backdrop-blur-xl border-b border-white/[0.07] safe-top-header">
        {/* Low remaining time alert banner */}
        {lowTimeWarningSq && (
          <div className="bg-[#641C2B] text-[#F4F0E8] text-xs py-1 px-4 text-center font-medium">
            {lowTimeWarningSq}
          </div>
        )}

        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 h-13 sm:h-16 flex items-center justify-between gap-2 sm:gap-6">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('/home')}
            className="cursor-pointer focus:outline-none whitespace-nowrap shrink-0 min-h-[44px] flex items-center transition-opacity hover:opacity-90"
          >
            <BrandLogo variant="compact" size="sm" />
          </button>

          {/* Zone 2: Desktop Navigation Links */}
          <nav
            aria-label="Navigimi kryesor"
            className="hidden xl:flex items-center gap-6 text-[13px] font-medium"
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
                  className={`relative py-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'text-[#C8A66A] font-semibold'
                      : 'text-[#F4F0E8]/70 hover:text-[#F4F0E8]'
                  }`}
                >
                  <span>{item.label}</span>
                  <span
                    className={`absolute bottom-0 inset-x-0 h-[2px] rounded-full bg-[#C8A66A] transition-transform duration-300 origin-center ${
                      active ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Remaining Time (Unboxed), Search, Admin Switch, Profile & Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {remainingMin !== null && remainingMin !== undefined && (
              <div
                title="Koha e mbetur e aksesit"
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#C8A66A] font-mono-code pr-2 whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{remainingMin} min</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSearchOpen(!searchOpen)}
              aria-label="Kërko në MITO"
              title="Kërko (Ctrl+K)"
              className="min-h-[40px] min-w-[40px] sm:min-h-[42px] sm:px-3.5 rounded-xl text-[#F4F0E8]/85 hover:text-[#C8A66A] bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Search className="w-4 h-4" />
              <span className="hidden md:inline text-xs text-[#F4F0E8]/60">Kërko</span>
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('/admin')}
                className="min-h-[40px] sm:min-h-[42px] inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-[#C8A66A]" />
                <span className="hidden sm:inline">Paneli Admin</span>
                <span className="sm:hidden">Admin</span>
              </button>
            )}

            {/* Profile & Three-Dots Menu */}
            <div className="relative flex items-center gap-1" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => onNavigate('/profile')}
                className={`min-h-[40px] sm:min-h-[42px] inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-l-xl border text-xs font-semibold transition-colors cursor-pointer ${
                  currentPath === '/profile'
                    ? 'bg-[#641C2B] text-[#F4F0E8] border-[#C8A66A]/50'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#F4F0E8] border-white/[0.08]'
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
                className={`min-h-[40px] sm:min-h-[42px] min-w-[38px] px-2 rounded-r-xl border flex items-center justify-center transition-colors cursor-pointer ${
                  threeDotsOpen || currentPath === '/support'
                    ? 'bg-[#641C2B] text-[#C8A66A] border-[#C8A66A]/50'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#C8A66A] border-white/[0.08]'
                }`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {threeDotsOpen && (
                <div className="absolute right-0 top-[calc(100%+10px)] w-68 rounded-2xl mito-surface-gold p-2 z-50 space-y-1 mito-reveal">
                  <div className="px-3 py-2.5 border-b border-white/[0.07]">
                    <p className="text-xs font-semibold text-[#F4F0E8] truncate">
                      {user.displayName}
                    </p>
                    <p className="text-[11px] font-mono-code text-[#C8A66A] mt-0.5">
                      {user.maskedCode}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setThreeDotsOpen(false);
                      onNavigate('/support');
                    }}
                    className="w-full min-h-[44px] px-3 py-2.5 rounded-xl bg-[#641C2B]/45 hover:bg-[#641C2B] border border-[#C8A66A]/35 text-left text-xs font-semibold text-[#F4F0E8] flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Headphones className="w-4 h-4 text-[#C8A66A] shrink-0" />
                    <div>
                      <div className="text-[#F4F0E8]">Kontakto Supportin</div>
                      <div className="text-[10px] text-[#C8A66A] font-normal">
                        Live Chat me Gemini AI & Agjent
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setThreeDotsOpen(false);
                      onNavigate('/profile');
                    }}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl hover:bg-white/[0.06] text-left text-xs font-medium text-[#F4F0E8]/90 flex items-center gap-2.5 transition-colors cursor-pointer"
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
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl hover:bg-white/[0.06] text-left text-xs font-medium text-[#F4F0E8]/90 flex items-center gap-2.5 transition-colors cursor-pointer"
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
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl hover:bg-white/[0.06] text-left text-xs font-medium text-[#C8A66A] flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <Shield className="w-4 h-4 text-[#C8A66A]" />
                      <span>Qendra e Supportit (Admin)</span>
                    </button>
                  )}

                  <div className="pt-1 border-t border-white/[0.07]">
                    <button
                      type="button"
                      onClick={() => {
                        setThreeDotsOpen(false);
                        onLogout();
                      }}
                      className="w-full min-h-[42px] px-3 py-2 rounded-xl hover:bg-red-950/45 text-left text-xs font-medium text-red-300 flex items-center gap-2.5 transition-colors cursor-pointer"
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

      {/* Mobile Fixed Bottom Dock (Ergonomic Thumb Zone) */}
      <nav
        aria-label="Navigimi celular"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#09090C]/92 backdrop-blur-xl border-t border-white/[0.08] safe-bottom-nav"
      >
        <div className="grid grid-cols-5 gap-1 px-2 pt-1">
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
                className={`min-h-[46px] py-1 rounded-xl flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                  active
                    ? 'text-[#C8A66A] bg-[#641C2B]/35 font-semibold'
                    : 'text-[#F4F0E8]/60 hover:text-[#F4F0E8]'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#C8A66A]' : 'text-[#F4F0E8]/70'}`} />
                <span className="text-[10px] leading-none">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Global Search Spotlight Modal */}
      {searchOpen && (
        <div
          onClick={() => setSearchOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-20 px-4 mito-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl mito-surface-gold rounded-3xl p-5 sm:p-6 mito-reveal"
          >
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3 flex-1">
                <Search className="w-5 h-5 text-[#C8A66A]" />
                <input
                  type="text"
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Kërko legjenda, MITO Shorts (9:16), dokumentarë ose lojëra..."
                  aria-label="Kërko në platformë"
                  className="w-full bg-transparent text-sm text-[#F4F0E8] placeholder-[#F4F0E8]/35 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label="Mbyll kërkimin"
                className="min-h-[38px] min-w-[38px] rounded-xl text-[#F4F0E8]/60 hover:text-[#F4F0E8] hover:bg-white/[0.06] flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 max-h-[60vh] overflow-y-auto space-y-5">
              {!searchQuery && (
                <p className="text-xs text-[#F4F0E8]/50 text-center py-6">
                  Shkruani një titull (p.sh. BESA, MITO fushatë promocionale, kuiz) për të kërkuar në të gjithë katalogun.
                </p>
              )}

              {searching && (
                <p className="text-xs text-[#C8A66A] text-center py-4">Po kërkohet në arkivë...</p>
              )}

              {!searching && searchQuery && searchResults && (
                <>
                  {/* Standard Videos */}
                  <div>
                    <h3 className="text-[11px] font-mono-code uppercase tracking-wider text-[#C8A66A] mb-2">
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
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#09090C]/80 hover:bg-white/[0.06] border border-white/[0.06] text-left transition-colors cursor-pointer"
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
                            <span className="text-xs font-semibold text-[#C8A66A]">Shiko →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* MITO Shorts */}
                  <div>
                    <h3 className="text-[11px] font-mono-code uppercase tracking-wider text-[#C8A66A] mb-2">
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
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#09090C]/80 hover:bg-white/[0.06] border border-white/[0.06] text-left transition-colors cursor-pointer"
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
                            <span className="text-xs font-semibold text-[#C8A66A]">Hap Shorts →</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Games */}
                  <div>
                    <h3 className="text-[11px] font-mono-code uppercase tracking-wider text-[#C8A66A] mb-2">
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
                            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#09090C]/80 hover:bg-white/[0.06] border border-white/[0.06] text-left transition-colors cursor-pointer"
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
                            <span className="text-xs font-semibold text-[#C8A66A]">Luaj →</span>
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
