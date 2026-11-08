import React, { useState } from 'react';
import {
  Play,
  Info,
  Gamepad2,
  Film,
  Plus,
  Lock,
  CheckCircle2,
  Trash2,
  Headphones,
  ChevronRight,
} from 'lucide-react';
import { apiFetch } from '../utils/sessionToken';
import type {
  VideoContent,
  PlaybackProgressRecord,
  GameItem,
  UserAccount,
  ContentCategoryType,
} from '../types/mito';

interface StreamingHomeViewProps {
  standardVideos: VideoContent[];
  shortVideos: VideoContent[];
  progressList: PlaybackProgressRecord[];
  games: Array<
    GameItem & {
      unlockStatus?: {
        unlocked: boolean;
        requiredPercent: number;
        currentPercent: number;
      };
    }
  >;
  user: UserAccount;
  filterCategoryType?: ContentCategoryType | null;
  categoryTitleSq?: string;
  onNavigate: (path: string) => void;
  onRefreshCatalog?: () => void;
}

export const StreamingHomeView: React.FC<StreamingHomeViewProps> = ({
  standardVideos,
  progressList,
  games,
  user,
  onNavigate,
  onRefreshCatalog,
}) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdminDeleteContent = async (e: React.MouseEvent, contentId: string) => {
    e.stopPropagation();
    if (deletingId) return;
    setDeletingId(contentId);
    try {
      let res = await apiFetch(`/api/admin/content/${contentId}/delete`, {
        method: 'POST',
      });
      if (!res.ok) {
        res = await apiFetch(`/api/admin/content/${contentId}`, {
          method: 'DELETE',
        });
      }
      if (res.ok && onRefreshCatalog) {
        onRefreshCatalog();
      }
    } finally {
      setDeletingId(null);
    }
  };

  const progressMap = new Map<string, PlaybackProgressRecord>();
  progressList.forEach((p) => progressMap.set(p.contentId, p));

  // Display only the single primary film (BESA) in Legjenda
  const primaryFilm =
    standardVideos.find(
      (v) =>
        v.contentId === 'cnt_1793701774719_0bebb6e7' ||
        v.title.toLowerCase().includes('besa')
    ) || standardVideos[0];

  const legjendaVideos = primaryFilm ? [primaryFilm] : [];

  if (legjendaVideos.length === 0) {
    return (
      <section className="max-w-6xl mx-auto px-4 lg:px-8 py-10 sm:py-16 safe-main-content">
        <div className="bg-[#141418] border border-[#202024] rounded-2xl p-8 sm:p-14 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-[#641C2B]/25 border border-[#C8A66A]/35 flex items-center justify-center mx-auto mb-6">
            <Film className="w-8 h-8 text-[#C8A66A]" />
          </div>
          <h1 className="text-xl sm:text-3xl font-serif-heritage font-bold text-[#F4F0E8]">
            Katalogu i Transmetimit MITO është i zbrazët
          </h1>
          <p className="mt-3 text-sm text-[#F4F0E8]/65 leading-relaxed">
            Filmi dhe kopertina sinkronizohen drejtpërdrejt nga dosja zyrtare e Google Drive ("MITO content").
          </p>

          {user.role === 'super_admin' && (
            <div className="mt-7 flex items-center justify-center">
              <button
                type="button"
                onClick={() => onNavigate('/admin/content')}
                className="min-h-[48px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#141418] hover:bg-[#202024] text-xs font-semibold text-[#C8A66A] border border-[#C8A66A]/45 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-[#C8A66A]" />
                <span>Sinkronizo Google Drive në Admin</span>
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  const featuredHero = primaryFilm;

  const continueWatching = legjendaVideos.filter((v) => {
    const p = progressMap.get(v.contentId);
    return p && p.completionPercent > 0 && p.completionPercent < 98;
  });

  return (
    <div className="safe-main-content space-y-6 sm:space-y-10">
      {/* 1. Featured Cinematic Hero — BESA */}
      {featuredHero && (
        <section className="relative w-full min-h-[360px] sm:min-h-[450px] lg:min-h-[520px] flex items-end overflow-hidden border-b border-[#202024]">
          <img
            src={featuredHero.heroUrl || featuredHero.posterUrl || featuredHero.thumbnailUrl}
            alt={featuredHero.title}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-65 sm:opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/65 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B0B0D] via-[#0B0B0D]/40 to-transparent" />

          <div className="relative z-10 max-w-[1440px] w-full mx-auto px-4 lg:px-8 py-6 sm:py-12 lg:py-16">
            <div className="max-w-2xl space-y-3 sm:space-y-4">
              <div className="text-[11px] sm:text-xs font-medium text-[#C8A66A] flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#641C2B]/80 border border-[#C8A66A]/40 text-[#F4F0E8] font-semibold">
                  LEGJENDA
                </span>
                <span>{featuredHero.region || 'Shqipëri'}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-code">
                  {Math.max(1, Math.round(featuredHero.durationSeconds / 60))} min
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-code">{featuredHero.resolution}</span>
              </div>

              <h1 className="text-2xl sm:text-5xl font-serif-heritage font-bold text-[#F4F0E8] leading-tight">
                {featuredHero.title}
              </h1>

              <p className="text-xs sm:text-base text-[#F4F0E8]/80 line-clamp-2 sm:line-clamp-3 leading-relaxed">
                {featuredHero.synopsis || featuredHero.description}
              </p>

              <div className="pt-2 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate(`/watch/${featuredHero.contentId}`)}
                  className="min-h-[48px] inline-flex items-center justify-center gap-2 px-5 sm:px-6 py-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-sm font-semibold text-[#F4F0E8] border border-[#C8A66A]/50 shadow-lg transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current text-[#C8A66A]" />
                  <span>Shiko Filmin</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate(`/content/${featuredHero.contentId}`)}
                  className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-xl bg-[#141418]/95 hover:bg-[#202024] text-sm font-medium text-[#F4F0E8] border border-[#202024] transition-colors cursor-pointer"
                >
                  <Info className="w-4 h-4 text-[#C8A66A]" />
                  <span>Detaje & Kuiz</span>
                </button>

                {user.role === 'super_admin' && (
                  <button
                    type="button"
                    disabled={deletingId === featuredHero.contentId}
                    onClick={(e) => handleAdminDeleteContent(e, featuredHero.contentId)}
                    className="col-span-2 sm:col-span-1 min-h-[44px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-[#C8A66A]" />
                    <span>{deletingId === featuredHero.contentId ? 'Duke fshirë...' : 'Fshi'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="max-w-[1440px] mx-auto px-3 sm:px-4 lg:px-8 space-y-8 sm:space-y-10">
        {/* Category 1: Vazhdo Shikimin (Continue Watching) */}
        {continueWatching.length > 0 && (
          <section className="space-y-3 sm:space-y-4">
            <h2 className="text-lg sm:text-xl font-serif-heritage font-semibold text-[#F4F0E8]">
              Vazhdo Shikimin
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {continueWatching.map((item) => {
                const prog = progressMap.get(item.contentId);
                return (
                  <div
                    key={item.contentId}
                    onClick={() => onNavigate(`/watch/${item.contentId}`)}
                    className="group bg-[#141418] border border-[#202024] hover:border-[#C8A66A]/50 rounded-2xl overflow-hidden transition-colors cursor-pointer"
                  >
                    <div className="relative aspect-video bg-[#0B0B0D]">
                      <img
                        src={item.posterUrl || item.thumbnailUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-[#641C2B]/95 border border-[#C8A66A] flex items-center justify-center text-[#F4F0E8] shadow-lg">
                          <Play className="w-5 h-5 fill-current text-[#C8A66A]" />
                        </div>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/60">
                        <div
                          className="h-full bg-[#C8A66A]"
                          style={{ width: `${prog?.completionPercent || 0}%` }}
                        />
                      </div>
                    </div>
                    <div className="p-3.5 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[#F4F0E8] truncate">
                        {item.title}
                      </h3>
                      <span className="text-xs font-mono-code text-[#C8A66A] shrink-0">
                        {prog?.completionPercent || 0}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Category 2: Legjendat (Containing the BESA Film) */}
        <section className="space-y-3.5 sm:space-y-4">
          <h2 className="text-lg sm:text-xl font-serif-heritage font-semibold text-[#F4F0E8]">
            Legjendat
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {legjendaVideos.map((item) => {
              const prog = progressMap.get(item.contentId);
              const hasLinkedGame =
                item.relatedGameIds.length > 0 ||
                games.some((g) => g.linkedContentId === item.contentId);

              return (
                <article
                  key={item.contentId}
                  className="bg-[#141418] border border-[#202024] hover:border-[#C8A66A]/45 rounded-2xl overflow-hidden flex flex-col justify-between transition-colors shadow-md"
                >
                  <div>
                    <div
                      onClick={() => onNavigate(`/watch/${item.contentId}`)}
                      className="relative aspect-video bg-[#0B0B0D] cursor-pointer group"
                    >
                      <img
                        src={item.posterUrl || item.thumbnailUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <div className="w-12 h-12 rounded-full bg-[#641C2B]/90 border border-[#C8A66A] flex items-center justify-center text-[#F4F0E8] shadow-lg">
                          <Play className="w-5 h-5 fill-current text-[#C8A66A] ml-0.5" />
                        </div>
                      </div>
                      {prog && prog.completionPercent > 0 && (
                        <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60">
                          <div
                            className="h-full bg-[#C8A66A]"
                            style={{ width: `${prog.completionPercent}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-1.5">
                      <div className="text-xs text-[#C8A66A] flex items-center gap-1.5">
                        <span>Legjendë</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-code">
                          {Math.max(1, Math.round(item.durationSeconds / 60))} min
                        </span>
                        {hasLinkedGame && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-[#F4F0E8]/80">
                              <Gamepad2 className="w-3 h-3 text-[#C8A66A]" />
                              <span>Kuiz</span>
                            </span>
                          </>
                        )}
                      </div>

                      <h3 className="text-base font-serif-heritage font-semibold text-[#F4F0E8] line-clamp-1">
                        {item.title}
                      </h3>

                      <p className="text-xs text-[#F4F0E8]/65 line-clamp-2">
                        {item.synopsis || item.description}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigate(`/watch/${item.contentId}`)}
                      className="min-h-[46px] flex-1 py-2.5 px-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current text-[#C8A66A]" />
                      <span>Shiko Tani</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate(`/content/${item.contentId}`)}
                      className="min-h-[46px] py-2.5 px-3.5 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] text-xs font-medium text-[#F4F0E8]/85 border border-[#202024] transition-colors cursor-pointer"
                    >
                      Detaje
                    </button>
                    {user.role === 'super_admin' && (
                      <button
                        type="button"
                        disabled={deletingId === item.contentId}
                        onClick={(e) => handleAdminDeleteContent(e, item.contentId)}
                        aria-label={`Fshi ${item.title}`}
                        className="min-h-[46px] py-2.5 px-3 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/35 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* Recommended Games — Compact Strip on Phone, Cards on Desktop */}
        {games.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-[#C8A66A]" />
                <h2 className="text-base sm:text-xl font-serif-heritage font-semibold text-[#F4F0E8]">
                  Kuize & Sfida Shpejtë
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/games')}
                className="min-h-[38px] px-3 rounded-xl bg-[#141418] border border-[#202024] text-xs font-semibold text-[#C8A66A] flex items-center gap-1 cursor-pointer"
              >
                <span>Të gjitha</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Compact Phone Game Element */}
            <div className="md:hidden space-y-2">
              {games.slice(0, 3).map((game) => (
                <button
                  key={game.gameId}
                  type="button"
                  onClick={() => onNavigate(`/games/${game.gameId}`)}
                  className="w-full min-h-[54px] px-3.5 py-2.5 rounded-xl bg-[#141418] hover:bg-[#202024] border border-[#202024] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#641C2B]/40 border border-[#C8A66A]/35 flex items-center justify-center shrink-0">
                      <Gamepad2 className="w-4 h-4 text-[#C8A66A]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-serif-heritage font-bold text-[#F4F0E8] truncate">
                        {game.title}
                      </h3>
                      <p className="text-[11px] font-mono-code text-[#C8A66A]">
                        {game.questionCount} pyetje · +{game.xpReward} XP
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 rounded-lg bg-[#641C2B] text-[11px] font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 shrink-0">
                    Luaj →
                  </span>
                </button>
              ))}
            </div>

            {/* Desktop Game Cards */}
            <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {games.slice(0, 3).map((game) => {
                const unlocked = game.unlockStatus ? game.unlockStatus.unlocked : true;
                return (
                  <div
                    key={game.gameId}
                    className="p-5 rounded-xl bg-[#141418] border border-[#202024] flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2">
                      <div className="text-xs text-[#C8A66A] flex items-center gap-1.5">
                        <span>{game.difficulty.toUpperCase()}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-code">{game.questionCount} pyetje</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-code">+{game.xpReward} XP</span>
                      </div>
                      <h3 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                        {game.title}
                      </h3>
                      <p className="text-xs text-[#F4F0E8]/65 line-clamp-2">
                        {game.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-[#202024]">
                      <span className="text-xs flex items-center gap-1.5 text-[#F4F0E8]/75">
                        {unlocked ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>E hapur për lojë</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5 text-[#C8A66A]" />
                            <span>Kërkon {game.unlockStatus?.requiredPercent}% shikim</span>
                          </>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate(`/games/${game.gameId}`)}
                        className="px-4 py-2 rounded-lg bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/35 cursor-pointer"
                      >
                        Hap Sfidën
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Quick Support Contact Card */}
        <section className="pt-1">
          <div className="p-4 rounded-2xl bg-[#141418] border border-[#202024] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#641C2B]/35 border border-[#C8A66A]/35 flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5 text-[#C8A66A]" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-serif-heritage font-bold text-[#F4F0E8]">
                  Keni nevojë për ndihmë ose nuk njihni një pajisje në llogari?
                </h3>
                <p className="text-[11px] sm:text-xs text-[#F4F0E8]/65">
                  Bisedoni drejtpërdrejt me Asistentin AI dhe ekipin tonë të Supportit 24/7.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/support')}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <Headphones className="w-4 h-4 text-[#C8A66A]" />
              <span>Kontakto Supportin</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
