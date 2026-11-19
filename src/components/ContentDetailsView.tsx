import React, { useEffect, useState } from 'react';
import {
  Play,
  ArrowLeft,
  Gamepad2,
  CheckCircle2,
  BookOpen,
  Film,
  ShieldCheck,
  AlertCircle,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../utils/sessionToken';
import { formatCinemaTitle } from '../utils/displayTitle';
import type {
  VideoContent,
  EpisodeItem,
  GameItem,
  PlaybackProgressRecord,
  UserAccount,
} from '../types/mito';

interface ContentDetailsViewProps {
  contentId: string;
  user?: UserAccount;
  onNavigate: (path: string) => void;
  onRefreshCatalog?: () => void;
}

export const ContentDetailsView: React.FC<ContentDetailsViewProps> = ({
  contentId,
  user,
  onNavigate,
  onRefreshCatalog,
}) => {
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [errorSq, setErrorSq] = useState<string | null>(null);
  const [content, setContent] = useState<VideoContent | null>(null);
  const [progress, setProgress] = useState<PlaybackProgressRecord | null>(null);
  const [episodes, setEpisodes] = useState<EpisodeItem[]>([]);
  const [relatedGames, setRelatedGames] = useState<
    Array<
      GameItem & {
        unlockStatus: {
          unlocked: boolean;
          requiredPercent: number;
          currentPercent: number;
          remainingPercent: number;
        };
      }
    >
  >([]);
  const [linkedContent, setLinkedContent] = useState<VideoContent | null>(null);
  const [relatedStories, setRelatedStories] = useState<VideoContent[]>([]);

  const handleDeleteCurrentContent = async () => {
    if (!content || deleting) return;
    setDeleting(true);
    try {
      let res = await apiFetch(`/api/admin/content/${content.contentId}/delete`, {
        method: 'POST',
      });
      if (!res.ok) {
        res = await apiFetch(`/api/admin/content/${content.contentId}`, {
          method: 'DELETE',
        });
      }
      if (res.ok) {
        if (onRefreshCatalog) onRefreshCatalog();
        onNavigate('/home');
      }
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorSq(null);

    apiFetch(`/api/content/${contentId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setErrorSq(data.error || 'Ky material nuk është i disponueshëm për llogarinë tënde.');
          setLoading(false);
          return;
        }
        setContent(data.content);
        setProgress(data.progress);
        setEpisodes(data.episodes || []);
        setRelatedGames(data.relatedGames || []);
        setLinkedContent(data.linkedContent || null);
        setRelatedStories(data.relatedStories || []);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setErrorSq('Gabim gjatë ngarkimit të detajeve të përmbajtjes.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [contentId]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center text-sm text-[#C8A66A] font-mono-code">
        Po ngarkohet dosja kulturore e përmbajtjes...
      </div>
    );
  }

  if (errorSq || !content) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="p-8 rounded-3xl mito-surface-gold text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-[#C8A66A] mx-auto" />
          <h1 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">
            {errorSq || 'Përmbajtja nuk u gjet'}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate('/home')}
            className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-[#C8A66A] hover:text-[#09090C] text-xs font-semibold text-[#F4F0E8] transition-colors cursor-pointer"
          >
            Kthehu në Kreu
          </button>
        </div>
      </div>
    );
  }

  const formattedTitle = formatCinemaTitle(content.title);

  return (
    <div className="safe-main-content space-y-10">
      {/* Museum Accession Hero Banner */}
      <section className="relative w-full min-h-[420px] sm:min-h-[470px] flex items-end border-b border-white/[0.08] overflow-hidden">
        <img
          src={content.heroUrl || content.posterUrl}
          alt={content.title}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-45 mito-ken-burns"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09090C] via-[#09090C]/75 to-[#09090C]/25" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09090C]/90 via-[#09090C]/45 to-transparent" />

        <div className="relative z-10 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col md:flex-row items-start md:items-end gap-8">
          <img
            src={content.posterUrl || content.thumbnailUrl}
            alt={content.title}
            referrerPolicy="no-referrer"
            className="w-40 sm:w-48 aspect-[3/4] object-cover rounded-2xl border border-[#C8A66A]/45 shadow-2xl shrink-0 hidden sm:block mito-reveal"
          />

          <div className="space-y-4 max-w-3xl mito-reveal-delay-1">
            <button
              type="button"
              onClick={() => onNavigate('/home')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#C8A66A] hover:text-[#E4C88E] transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kthehu te Katalogu</span>
            </button>

            <p className="text-[11px] sm:text-xs font-mono-code uppercase tracking-[0.2em] text-[#C8A66A] flex flex-wrap items-center gap-2">
              <span>{content.type}</span>
              <span aria-hidden="true">·</span>
              <span>{content.region || 'Shqipëri'}</span>
              <span aria-hidden="true">·</span>
              <span>
                {content.videoFormat === 'short'
                  ? `${content.durationSeconds}s (9:16)`
                  : `${Math.max(1, Math.round(content.durationSeconds / 60))} MIN`}
              </span>
              <span aria-hidden="true">·</span>
              <span>{content.resolution}</span>
              <span aria-hidden="true">·</span>
              <span>{content.codec}</span>
            </p>

            <div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-serif-heritage font-bold text-[#F4F0E8] leading-[1.04] tracking-[0.03em]">
                {formattedTitle.primaryTitle}
              </h1>
              {formattedTitle.subtitle && (
                <p className="mt-2 font-editorial italic text-base sm:text-xl text-[#E4C88E]/90">
                  {formattedTitle.subtitle}
                </p>
              )}
            </div>

            <p className="text-sm sm:text-base text-[#F4F0E8]/85 leading-relaxed max-w-2xl">
              {content.description || content.synopsis}
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    content.videoFormat === 'short'
                      ? `/shorts?id=${content.contentId}`
                      : `/watch/${content.contentId}`
                  )
                }
                className="min-h-[48px] inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-sm font-semibold text-[#F4F0E8] border border-[#C8A66A]/50 mito-cta-primary cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current text-[#C8A66A]" />
                <span>
                  {progress && progress.completionPercent > 0 && progress.completionPercent < 98
                    ? `Vazhdo Shikimin (${progress.completionPercent}%)`
                    : 'Luaj Videon'}
                </span>
              </button>

              {linkedContent && (
                <button
                  type="button"
                  onClick={() => onNavigate(`/content/${linkedContent.contentId}`)}
                  className="min-h-[48px] inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-semibold text-[#C8A66A] border border-[#C8A66A]/35 transition-colors cursor-pointer"
                >
                  <Film className="w-4 h-4" />
                  <span>Përmbajtja e Lidhur: {linkedContent.title}</span>
                </button>
              )}

              {user?.role === 'super_admin' && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDeleteCurrentContent}
                  className="min-h-[48px] inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-[#C8A66A]" />
                  <span>{deleting ? 'Duke fshirë...' : 'Fshi këtë Përmbajtje'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Video Quiz & Episodes */}
        <div className="lg:col-span-2 space-y-8 mito-reveal-delay-2">
          <section className="p-6 sm:p-7 rounded-3xl mito-surface-card space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.07] pb-4">
              <div>
                <h2 className="text-lg sm:text-xl font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-[#C8A66A]" />
                  <span>Pyetësori & Kuizi i Videos</span>
                </h2>
                <p className="text-xs text-[#F4F0E8]/65 mt-1 leading-relaxed">
                  Pyetësorët e lidhur me këtë film janë të hapur menjëherë — mund t&apos;i luani në çdo moment.
                </p>
              </div>
              <span className="font-mono-code text-xs text-emerald-400">
                I Hapur Menjëherë
              </span>
            </div>

            {relatedGames.length === 0 ? (
              <p className="text-xs text-[#F4F0E8]/55 py-2">
                Ende nuk ka pyetësor të lidhur me këtë përmbajtje.
              </p>
            ) : (
              <div className="space-y-3">
                {relatedGames.map((game) => (
                  <div
                    key={game.gameId}
                    className="p-4 sm:p-5 rounded-2xl bg-[#09090C]/80 border border-white/[0.07] hover:border-[#C8A66A]/40 transition-colors flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-serif-heritage font-semibold text-[#F4F0E8]">
                          {game.title}
                        </h3>
                      </div>
                      <p className="text-xs font-mono-code text-[#C8A66A]">
                        {game.questionCount} pyetje · +{game.xpReward} XP
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate(`/games/${game.gameId}`)}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 mito-cta-primary cursor-pointer"
                    >
                      Luaj Pyetësorin Tani
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Episodes List if Series */}
          {episodes.length > 0 && (
            <section className="p-6 sm:p-7 rounded-3xl mito-surface-card space-y-4">
              <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                Episodet ({episodes.length})
              </h2>
              <div className="space-y-3">
                {episodes.map((ep) => (
                  <div
                    key={ep.episodeId}
                    className="p-4 rounded-2xl bg-[#09090C]/80 border border-white/[0.07] flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="text-xs font-mono-code text-[#C8A66A]">
                        Sezoni {ep.seasonNumber} · Episodi {ep.episodeNumber}
                      </p>
                      <h3 className="text-sm font-semibold text-[#F4F0E8]">{ep.title}</h3>
                      <p className="text-xs text-[#F4F0E8]/60">{ep.synopsis}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate(`/watch/${content.contentId}`)}
                      className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-[#C8A66A] hover:text-[#09090C] text-xs font-semibold text-[#C8A66A] transition-colors cursor-pointer"
                    >
                      Luaj
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Museum Accession Provenance Table */}
        <aside className="p-6 sm:p-7 rounded-3xl mito-surface-gold space-y-5 h-fit mito-reveal-delay-3">
          <div className="flex items-center gap-2.5 text-[#C8A66A]">
            <BookOpen className="w-5 h-5" />
            <h2 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
              Provenienca e Trashëgimisë
            </h2>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#09090C]/80 border border-white/[0.07] text-xs text-[#F4F0E8]/80 flex items-start gap-2.5 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-[#C8A66A] shrink-0 mt-0.5" />
            <span>
              {content.provenance?.verifiedHistoricalFact
                ? 'Fakt historik i verifikuar me burime arkivore.'
                : 'Rrëfim folklorik / legjendë gojore (Nuk paraqitet si fakt historik i provuar pa verifikim burimor).'}
            </span>
          </div>

          <dl className="divide-y divide-white/[0.07] text-xs">
            <div className="py-2.5">
              <dt className="text-[#F4F0E8]/50">Krahina / Origjina</dt>
              <dd className="text-[#F4F0E8] font-medium mt-0.5">
                {content.provenance?.regionOfOrigin || content.region || 'Shqipëri'}
              </dd>
            </div>
            <div className="py-2.5">
              <dt className="text-[#F4F0E8]/50">Dialekti / Gjuha</dt>
              <dd className="text-[#F4F0E8] font-medium mt-0.5">
                {content.provenance?.dialect || content.language || 'Shqip'}
              </dd>
            </div>
            {content.provenance?.storyteller && (
              <div className="py-2.5">
                <dt className="text-[#F4F0E8]/50">Rrëfimtari / Kontribuesi</dt>
                <dd className="text-[#F4F0E8] font-medium mt-0.5">
                  {content.provenance.storyteller}
                </dd>
              </div>
            )}
            {content.provenance?.sourceReferences && (
              <div className="py-2.5">
                <dt className="text-[#F4F0E8]/50">Burimet & Bibliografia</dt>
                <dd className="text-[#F4F0E8] font-medium mt-0.5">
                  {content.provenance.sourceReferences}
                </dd>
              </div>
            )}
            <div className="py-2.5">
              <dt className="text-[#F4F0E8]/50">Të Drejtat & Licenca</dt>
              <dd className="text-[#F4F0E8] font-medium mt-0.5">
                {content.provenance?.rightsAndLicensing || 'MITO Heritage Archive'}
              </dd>
            </div>
          </dl>

          {relatedStories.length > 0 && (
            <div className="pt-4 border-t border-white/[0.08] space-y-2.5">
              <h3 className="text-[11px] font-mono-code uppercase tracking-wider text-[#C8A66A]">
                Rrëfime të Ngjashme
              </h3>
              {relatedStories.map((rel) => (
                <button
                  key={rel.contentId}
                  type="button"
                  onClick={() => onNavigate(`/content/${rel.contentId}`)}
                  className="w-full text-left p-2.5 rounded-xl bg-[#09090C]/80 hover:bg-white/[0.06] text-xs text-[#F4F0E8] transition-colors cursor-pointer"
                >
                  {rel.title}
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};
