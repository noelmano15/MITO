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
  Smartphone,
  Award,
  BookOpen,
} from 'lucide-react';
import { apiFetch } from '../utils/sessionToken';
import { formatCinemaTitle } from '../utils/displayTitle';
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
  catalogLoading?: boolean;
  filterCategoryType?: ContentCategoryType | null;
  categoryTitleSq?: string;
  onNavigate: (path: string) => void;
  onRefreshCatalog?: () => void;
}

export const StreamingHomeView: React.FC<StreamingHomeViewProps> = ({
  standardVideos,
  shortVideos = [],
  progressList,
  games,
  user,
  catalogLoading = false,
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

  // Display primary film (BESA) in Legjenda
  const primaryFilm =
    standardVideos.find(
      (v) =>
        v.contentId === 'cnt_1793701774719_0bebb6e7' ||
        v.title.toLowerCase().includes('besa')
    ) || standardVideos[0];

  const legjendaVideos = primaryFilm ? [primaryFilm] : [];

  if (catalogLoading && legjendaVideos.length === 0) {
    return (
      <div className="safe-main-content max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="h-[400px] sm:h-[480px] rounded-3xl mito-surface-card animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div className="h-48 rounded-2xl mito-surface-card animate-pulse" />
          <div className="h-48 rounded-2xl mito-surface-card animate-pulse" />
          <div className="h-48 rounded-2xl mito-surface-card animate-pulse" />
        </div>
      </div>
    );
  }

  if (legjendaVideos.length === 0) {
    return (
      <section className="max-w-6xl mx-auto px-4 lg:px-8 py-12 sm:py-16 safe-main-content">
        <div className="mito-surface-gold rounded-3xl p-8 sm:p-14 text-center max-w-2xl mx-auto mito-reveal">
          <div className="w-16 h-16 rounded-2xl bg-[#641C2B]/30 border border-[#C8A66A]/35 flex items-center justify-center mx-auto mb-6">
            <Film className="w-8 h-8 text-[#C8A66A]" />
          </div>
          <h1 className="text-xl sm:text-3xl font-serif-heritage font-bold text-[#F4F0E8]">
            Katalogu i Transmetimit MITO është i zbrazët
          </h1>
          <p className="mt-3 text-sm text-[#F4F0E8]/65 leading-relaxed">
            Filmi dhe kopertina sinkronizohen drejtpërdrejt nga dosja zyrtare e Google Drive (&ldquo;MITO content&rdquo;).
          </p>

          {user.role === 'super_admin' && (
            <div className="mt-7 flex items-center justify-center">
              <button
                type="button"
                onClick={() => onNavigate('/admin/content')}
                className="min-h-[48px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 mito-cta-primary cursor-pointer"
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
  const heroFormatted = featuredHero ? formatCinemaTitle(featuredHero.title) : null;
  const heroProgress = featuredHero ? progressMap.get(featuredHero.contentId) : undefined;

  const continueWatching = legjendaVideos.filter((v) => {
    const p = progressMap.get(v.contentId);
    return p && p.completionPercent > 0 && p.completionPercent < 98;
  });

  return (
    <div className="safe-main-content space-y-8 sm:space-y-14">
      {/* 1. EDITORIAL CINEMA HERO — BESA */}
      {featuredHero && heroFormatted && (
        <section className="relative w-full min-h-[400px] sm:min-h-[500px] lg:min-h-[560px] flex items-end overflow-hidden border-b border-white/[0.08]">
          {/* Slow Ken Burns Cinema Stage */}
          <img
            src={featuredHero.heroUrl || featuredHero.posterUrl || featuredHero.thumbnailUrl}
            alt={featuredHero.title}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-60 sm:opacity-55 mito-ken-burns"
          />

          {/* Layered Dramatic Scrims */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090C] via-[#09090C]/70 to-[#09090C]/20" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#09090C]/95 via-[#09090C]/55 to-transparent" />
          <div
            className="pointer-events-none absolute -bottom-24 left-12 w-[520px] h-[280px] blur-3xl opacity-45"
            style={{
              background: 'radial-gradient(circle, rgba(100, 28, 43, 0.75) 0%, transparent 70%)',
            }}
          />

          <div className="relative z-10 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
              <div className="max-w-2xl space-y-3 sm:space-y-4 mito-reveal">
                {/* Unboxed Museum Eyebrow Metadata */}
                <p className="text-[11px] sm:text-xs font-mono-code uppercase tracking-wider sm:tracking-[0.22em] text-[#C8A66A] flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#E4C88E]">PREMIERA KRYESORE · LEGJENDA</span>
                  <span aria-hidden="true">·</span>
                  <span>{featuredHero.region || 'Shqipëri'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{Math.max(1, Math.round(featuredHero.durationSeconds / 60))} MIN</span>
                  <span aria-hidden="true">·</span>
                  <span>{featuredHero.resolution}</span>
                </p>

                <div>
                  <h1 className="text-4xl sm:text-6xl lg:text-7xl font-serif-heritage font-bold text-[#F4F0E8] leading-[1.02] tracking-[0.04em]">
                    {heroFormatted.primaryTitle}
                  </h1>
                  {heroFormatted.subtitle && (
                    <p className="mt-2 font-editorial italic text-base sm:text-xl text-[#E4C88E]/90">
                      {heroFormatted.subtitle}
                    </p>
                  )}
                </div>

                <p className="text-sm sm:text-base text-[#F4F0E8]/80 line-clamp-2 sm:line-clamp-3 leading-relaxed max-w-xl">
                  {featuredHero.synopsis || featuredHero.description}
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate(`/watch/${featuredHero.contentId}`)}
                    className="min-h-[48px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 sm:px-7 py-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs sm:text-sm font-semibold text-[#F4F0E8] border border-[#C8A66A]/55 mito-cta-primary whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current text-[#C8A66A] shrink-0" />
                    <span>
                      {heroProgress && heroProgress.completionPercent > 0 && heroProgress.completionPercent < 98
                        ? `Vazhdo (${heroProgress.completionPercent}%)`
                        : 'Shiko Filmin'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate(`/content/${featuredHero.contentId}`)}
                    className="min-h-[48px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-3 rounded-xl bg-[#111116]/85 hover:bg-[#1A1A22] backdrop-blur-md text-xs sm:text-sm font-medium text-[#F4F0E8] border border-white/[0.12] hover:border-[#C8A66A]/45 whitespace-nowrap transition-all cursor-pointer"
                  >
                    <Info className="w-4 h-4 text-[#C8A66A] shrink-0" />
                    <span>Detaje & Kuiz</span>
                  </button>

                  {user.role === 'super_admin' && (
                    <button
                      type="button"
                      disabled={deletingId === featuredHero.contentId}
                      onClick={(e) => handleAdminDeleteContent(e, featuredHero.contentId)}
                      className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-[#C8A66A]" />
                      <span>{deletingId === featuredHero.contentId ? 'Duke fshirë...' : 'Fshi'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Desktop Right-Edge Editorial Member Strip */}
              <div className="hidden lg:flex flex-col items-end text-right space-y-2 pb-1 mito-reveal-delay-2">
                <p className="text-[11px] font-mono-code uppercase tracking-[0.2em] text-[#C8A66A]">
                  SESIONI YT NË MITO
                </p>
                <p className="text-lg font-serif-heritage font-semibold text-[#F4F0E8]">
                  {user.displayName}
                </p>
                <p className="text-xs font-mono-code text-[#F4F0E8]/60">
                  {user.stats.totalXp} XP · Pozicioni #{user.stats.rank || 1}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 space-y-10 sm:space-y-14">
        {/* Category 1: Vazhdo Shikimin (Continue Watching) */}
        {continueWatching.length > 0 && (
          <section className="space-y-4 mito-reveal-delay-1">
            <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-3">
              <div>
                <p className="text-[11px] font-mono-code uppercase tracking-[0.2em] text-[#C8A66A]">
                  SESIONI AKTIV
                </p>
                <h2 className="text-lg sm:text-2xl font-serif-heritage font-semibold text-[#F4F0E8] mt-0.5">
                  Vazhdo Shikimin
                </h2>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {continueWatching.map((item) => {
                const prog = progressMap.get(item.contentId);
                const pct = Math.max(0, Math.min(100, prog?.completionPercent || 0));
                return (
                  <div
                    key={item.contentId}
                    onClick={() => onNavigate(`/watch/${item.contentId}`)}
                    className="group mito-surface-card mito-card-hover rounded-2xl overflow-hidden cursor-pointer"
                  >
                    <div className="relative aspect-video bg-[#09090C] overflow-hidden">
                      <img
                        src={item.posterUrl || item.thumbnailUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/35 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-[#641C2B]/95 border border-[#C8A66A] flex items-center justify-center text-[#F4F0E8] shadow-lg transition-transform duration-300 group-hover:scale-110">
                          <Play className="w-5 h-5 fill-current text-[#C8A66A] ml-0.5" />
                        </div>
                      </div>
                      {/* GPU scaleX progress bar */}
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-black/70 overflow-hidden">
                        <div
                          className="h-full w-full bg-[#C8A66A] origin-left transition-transform duration-500"
                          style={{ transform: `scaleX(${pct / 100})` }}
                        />
                      </div>
                    </div>
                    <div className="p-4 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-serif-heritage font-semibold text-[#F4F0E8] truncate">
                        {item.title}
                      </h3>
                      <span className="text-xs font-mono-code text-[#C8A66A] shrink-0">
                        {pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Category 2: Legjendat (Architectural Feature Showcase for BESA Film) */}
        <section className="space-y-4 mito-reveal-delay-2">
          <div className="flex items-baseline justify-between border-b border-white/[0.06] pb-3">
            <div>
              <p className="text-[11px] font-mono-code uppercase tracking-[0.2em] text-[#C8A66A]">
                KOLEKSIONI I KINEMASË
              </p>
              <h2 className="text-lg sm:text-2xl font-serif-heritage font-semibold text-[#F4F0E8] mt-0.5">
                Legjendat
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigate(`/content/${primaryFilm.contentId}`)}
              className="text-xs font-semibold text-[#C8A66A] hover:text-[#E4C88E] inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Dosja e Filmit</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {legjendaVideos.length === 1 ? (
            /* Single Monumental Feature Presentation (avoids sparse 1/3 empty columns on desktop) */
            (() => {
              const item = legjendaVideos[0];
              const itemFormatted = formatCinemaTitle(item.title);
              const prog = progressMap.get(item.contentId);
              const pct = Math.max(0, Math.min(100, prog?.completionPercent || 0));
              const hasLinkedGame =
                item.relatedGameIds.length > 0 ||
                games.some((g) => g.linkedContentId === item.contentId);

              return (
                <article className="mito-surface-gold mito-card-hover rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                  {/* Visual Cinema Frame */}
                  <div
                    onClick={() => onNavigate(`/watch/${item.contentId}`)}
                    className="lg:col-span-7 relative aspect-video lg:aspect-auto lg:min-h-[340px] bg-[#09090C] cursor-pointer group overflow-hidden"
                  >
                    <img
                      src={item.posterUrl || item.thumbnailUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#09090C]/75 via-black/15 to-transparent flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-[#641C2B]/90 border-2 border-[#C8A66A] flex items-center justify-center text-[#F4F0E8] shadow-2xl transition-transform duration-300 group-hover:scale-110">
                        <Play className="w-7 h-7 fill-current text-[#C8A66A] ml-0.5" />
                      </div>
                    </div>
                    {pct > 0 && (
                      <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black/70 overflow-hidden">
                        <div
                          className="h-full w-full bg-[#C8A66A] origin-left"
                          style={{ transform: `scaleX(${pct / 100})` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Editorial Dossier & Launch Actions */}
                  <div className="lg:col-span-5 p-6 sm:p-8 flex flex-col justify-between gap-6">
                    <div className="space-y-3.5">
                      <div className="text-[11px] font-mono-code uppercase tracking-wider text-[#C8A66A] flex flex-wrap items-center gap-2">
                        <span>LEGJENDË</span>
                        <span aria-hidden="true">·</span>
                        <span>{Math.max(1, Math.round(item.durationSeconds / 60))} MIN</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.resolution}</span>
                        {hasLinkedGame && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-[#F4F0E8]/85">
                              <Gamepad2 className="w-3 h-3 text-[#C8A66A]" />
                              <span>KUIZ INTERAKTIV</span>
                            </span>
                          </>
                        )}
                      </div>

                      <div>
                        <h3 className="text-2xl sm:text-4xl font-serif-heritage font-bold text-[#F4F0E8]">
                          {itemFormatted.primaryTitle}
                        </h3>
                        {itemFormatted.subtitle && (
                          <p className="text-sm font-editorial italic text-[#E4C88E]/85 mt-1">
                            {itemFormatted.subtitle}
                          </p>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm text-[#F4F0E8]/75 leading-relaxed line-clamp-3">
                        {item.synopsis || item.description}
                      </p>

                      <div className="pt-2 border-t border-white/[0.07] grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[#F4F0E8]/45 block text-[11px]">Krahina</span>
                          <span className="text-[#F4F0E8] font-medium">
                            {item.provenance?.regionOfOrigin || item.region || 'Shqipëri'}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#F4F0E8]/45 block text-[11px]">Formati</span>
                          <span className="text-[#F4F0E8] font-medium font-mono-code">
                            {item.codec || 'H.264 Cinema'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 pt-2">
                      <button
                        type="button"
                        onClick={() => onNavigate(`/watch/${item.contentId}`)}
                        className="min-h-[46px] flex-1 py-2.5 px-4 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 mito-cta-primary flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current text-[#C8A66A]" />
                        <span>Shiko Tani</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onNavigate(`/content/${item.contentId}`)}
                        className="min-h-[46px] py-2.5 px-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] text-xs font-medium text-[#F4F0E8] border border-white/[0.09] flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-[#C8A66A]" />
                        <span>Detaje</span>
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
                  </div>
                </article>
              );
            })()
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {legjendaVideos.map((item) => {
                const prog = progressMap.get(item.contentId);
                const pct = Math.max(0, Math.min(100, prog?.completionPercent || 0));
                return (
                  <article
                    key={item.contentId}
                    className="mito-surface-card mito-card-hover rounded-2xl overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div
                        onClick={() => onNavigate(`/watch/${item.contentId}`)}
                        className="relative aspect-video bg-[#09090C] cursor-pointer group overflow-hidden"
                      >
                        <img
                          src={item.posterUrl || item.thumbnailUrl}
                          alt={item.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <div className="w-12 h-12 rounded-full bg-[#641C2B]/90 border border-[#C8A66A] flex items-center justify-center text-[#F4F0E8] shadow-lg">
                            <Play className="w-5 h-5 fill-current text-[#C8A66A] ml-0.5" />
                          </div>
                        </div>
                        {pct > 0 && (
                          <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 overflow-hidden">
                            <div
                              className="h-full w-full bg-[#C8A66A] origin-left"
                              style={{ transform: `scaleX(${pct / 100})` }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="p-4 space-y-1.5">
                        <div className="text-xs font-mono-code text-[#C8A66A] flex items-center gap-1.5">
                          <span>LEGJENDË</span>
                          <span aria-hidden="true">·</span>
                          <span>{Math.max(1, Math.round(item.durationSeconds / 60))} MIN</span>
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
                        className="min-h-[46px] flex-1 py-2.5 px-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 flex items-center justify-center gap-1.5 mito-cta-primary cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current text-[#C8A66A]" />
                        <span>Shiko Tani</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate(`/content/${item.contentId}`)}
                        className="min-h-[46px] py-2.5 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] text-xs font-medium text-[#F4F0E8]/85 border border-white/[0.08] transition-colors cursor-pointer"
                      >
                        Detaje
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Category 3: MITO Shorts (9:16 Vertical Stories) */}
        {shortVideos.length > 0 && (
          <section className="space-y-4 mito-reveal-delay-3">
            <div className="flex items-end justify-between border-b border-white/[0.06] pb-3">
              <div>
                <p className="text-[11px] font-mono-code uppercase tracking-[0.2em] text-[#C8A66A] flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>FORMAT VERTIKAL NË EKRAN TË PLOTË</span>
                </p>
                <h2 className="text-lg sm:text-2xl font-serif-heritage font-semibold text-[#F4F0E8] mt-0.5">
                  MITO Shorts (9:16)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/shorts')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-semibold text-[#C8A66A] cursor-pointer flex items-center gap-1 transition-colors"
              >
                <span>Hap të gjitha</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-5">
              {shortVideos.map((shortItem) => (
                <div
                  key={shortItem.contentId}
                  onClick={() => onNavigate(`/shorts?id=${shortItem.contentId}`)}
                  className="group relative aspect-[9/16] rounded-2xl overflow-hidden mito-surface-card mito-card-hover cursor-pointer flex flex-col justify-end p-3.5"
                >
                  <img
                    src={shortItem.thumbnailUrl || shortItem.posterUrl}
                    alt={shortItem.title}
                    referrerPolicy="no-referrer"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/10" />
                  <div className="relative z-10 space-y-1">
                    <p className="text-[10px] font-mono-code uppercase tracking-[0.18em] text-[#C8A66A]">
                      SHORTS 9:16 · {shortItem.durationSeconds}S
                    </p>
                    <h3 className="text-xs sm:text-sm font-serif-heritage font-semibold text-[#F4F0E8] line-clamp-2 leading-snug">
                      {shortItem.title}
                    </h3>
                  </div>
                  <div className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/55 backdrop-blur-md border border-[#C8A66A]/45 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <Play className="w-4 h-4 fill-current text-[#C8A66A] ml-0.5" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recommended Games — Compact Phone Rows & Desktop Arena Cards */}
        {games.length > 0 && (
          <section className="space-y-4 mito-reveal-delay-4">
            <div className="flex items-end justify-between border-b border-white/[0.06] pb-3">
              <div>
                <p className="text-[11px] font-mono-code uppercase tracking-[0.2em] text-[#C8A66A] flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" />
                  <span>ARENA KULTURORE & KUIZE</span>
                </p>
                <h2 className="text-lg sm:text-2xl font-serif-heritage font-semibold text-[#F4F0E8] mt-0.5">
                  Kuize & Sfida Shpejtë
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('/games')}
                className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-xs font-semibold text-[#C8A66A] flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Të gjitha</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Compact Phone Game Element */}
            <div className="md:hidden space-y-2.5">
              {games.slice(0, 3).map((game) => (
                <button
                  key={game.gameId}
                  type="button"
                  onClick={() => onNavigate(`/games/${game.gameId}`)}
                  className="w-full min-h-[58px] px-4 py-3 rounded-2xl mito-surface-card flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#641C2B]/40 border border-[#C8A66A]/35 flex items-center justify-center shrink-0">
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
                    className="p-6 rounded-2xl mito-surface-card mito-card-hover flex flex-col justify-between gap-5"
                  >
                    <div className="space-y-2.5">
                      <p className="text-[11px] font-mono-code uppercase tracking-wider text-[#C8A66A] flex items-center gap-1.5">
                        <span>{game.difficulty}</span>
                        <span aria-hidden="true">·</span>
                        <span>{game.questionCount} pyetje</span>
                        <span aria-hidden="true">·</span>
                        <span>+{game.xpReward} XP</span>
                      </p>
                      <h3 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                        {game.title}
                      </h3>
                      <p className="text-xs text-[#F4F0E8]/65 line-clamp-2 leading-relaxed">
                        {game.description}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-3.5 border-t border-white/[0.07]">
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
                        className="px-4 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 mito-cta-primary cursor-pointer"
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

        {/* Executive Support Concierge Banner */}
        <section className="pt-1">
          <div className="p-5 sm:p-6 rounded-3xl mito-surface-gold flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[#641C2B]/40 border border-[#C8A66A]/40 flex items-center justify-center shrink-0">
                <Headphones className="w-5 h-5 text-[#C8A66A]" />
              </div>
              <div>
                <p className="text-[10px] font-mono-code uppercase tracking-[0.2em] text-[#C8A66A]">
                  QENDRA E NDIHMËS MITO
                </p>
                <h3 className="text-sm sm:text-base font-serif-heritage font-bold text-[#F4F0E8] mt-0.5">
                  Keni nevojë për ndihmë ose nuk njihni një pajisje në llogari?
                </h3>
                <p className="text-xs text-[#F4F0E8]/65 mt-0.5">
                  Bisedoni drejtpërdrejt me Asistentin AI Gemini dhe Agjentët tanë të Supportit 24/7.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('/support')}
              className="w-full sm:w-auto min-h-[46px] px-5 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 mito-cta-primary flex items-center justify-center gap-2 cursor-pointer shrink-0"
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
