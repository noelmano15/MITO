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
      <div className="max-w-5xl mx-auto px-4 py-16 text-center text-sm text-[#F4F0E8]/60">
        Po ngarkohen detajet e përmbajtjes...
      </div>
    );
  }

  if (errorSq || !content) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="p-8 rounded-2xl bg-[#141418] border border-[#641C2B] text-center space-y-4">
          <AlertCircle className="w-10 h-10 text-[#C8A66A] mx-auto" />
          <h1 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">
            {errorSq || 'Përmbajtja nuk u gjet'}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate('/home')}
            className="px-5 py-2.5 rounded-xl bg-[#202024] hover:bg-[#C8A66A] hover:text-[#0B0B0D] text-xs font-semibold text-[#F4F0E8] transition-colors cursor-pointer"
          >
            Kthehu në Kreu
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-20 space-y-10">
      {/* Hero Banner */}
      <section className="relative w-full min-h-[420px] flex items-end border-b border-[#202024]">
        <img
          src={content.heroUrl || content.posterUrl}
          alt={content.title}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0B0D] via-[#0B0B0D]/70 to-transparent" />

        <div className="relative z-10 max-w-[1440px] w-full mx-auto px-4 lg:px-8 py-10 flex flex-col md:flex-row items-start md:items-end gap-8">
          <img
            src={content.posterUrl || content.thumbnailUrl}
            alt={content.title}
            referrerPolicy="no-referrer"
            className="w-40 sm:w-48 aspect-[3/4] object-cover rounded-xl border border-[#C8A66A]/40 shadow-2xl shrink-0 hidden sm:block"
          />

          <div className="space-y-4 max-w-3xl">
            <button
              type="button"
              onClick={() => onNavigate('/home')}
              className="inline-flex items-center gap-1.5 text-xs text-[#C8A66A] hover:underline cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kthehu te Katalogu</span>
            </button>

            <div className="text-xs text-[#C8A66A] flex flex-wrap items-center gap-2">
              <span>{content.type.toUpperCase()}</span>
              <span aria-hidden="true">·</span>
              <span>{content.region || 'Shqipëri'}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-code">
                {content.videoFormat === 'short'
                  ? `${content.durationSeconds}s (9:16)`
                  : `${Math.max(1, Math.round(content.durationSeconds / 60))} min`}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-code">{content.resolution}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-code">{content.codec}</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-serif-heritage font-bold text-[#F4F0E8]">
              {content.title}
            </h1>

            <p className="text-sm sm:text-base text-[#F4F0E8]/85 leading-relaxed">
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
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-sm font-semibold text-[#F4F0E8] border border-[#C8A66A]/50 transition-colors cursor-pointer"
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
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[#141418] hover:bg-[#202024] text-xs font-semibold text-[#C8A66A] border border-[#C8A66A]/35 transition-colors cursor-pointer"
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
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[#641C2B]/40 hover:bg-[#641C2B] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4 text-[#C8A66A]" />
                  <span>{deleting ? 'Duke fshirë...' : 'Fshi këtë Përmbajtje'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-[1440px] mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Columns: Watch-to-Unlock Games & Episodes */}
        <div className="lg:col-span-2 space-y-8">
          {/* Video Questionnaires & Linked Quizzes (0% Watch Requirement) */}
          <section className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
                  <Gamepad2 className="w-5 h-5 text-[#C8A66A]" />
                  <span>Pyetësori & Kuizi i Videos</span>
                </h2>
                <p className="text-xs text-[#F4F0E8]/60 mt-0.5">
                  Pyetësorët e lidhur me këtë film janë të hapur menjëherë — mund t&apos;i luani pa pasur nevojë të shikoni një pjesë të caktuar të videos.
                </p>
              </div>
              <div className="text-right font-mono-code text-xs text-emerald-400">
                I Hapur Menjëherë
              </div>
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
                    className="p-4 rounded-xl bg-[#0B0B0D] border border-[#202024] flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-semibold text-[#F4F0E8]">{game.title}</h3>
                      </div>
                      <p className="text-xs text-[#F4F0E8]/65">
                        I gatshëm për t&apos;u luajtur ({game.questionCount} pyetje · +{game.xpReward} XP)
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onNavigate(`/games/${game.gameId}`)}
                      className="px-4 py-2 rounded-lg bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 transition-colors cursor-pointer"
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
            <section className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4">
              <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                Episodet ({episodes.length})
              </h2>
              <div className="space-y-3">
                {episodes.map((ep) => (
                  <div
                    key={ep.episodeId}
                    className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024] flex items-center justify-between gap-4"
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
                      className="px-3.5 py-2 rounded-lg bg-[#202024] hover:bg-[#C8A66A] hover:text-[#0B0B0D] text-xs font-semibold text-[#C8A66A] cursor-pointer"
                    >
                      Luaj
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Cultural Heritage Provenance */}
        <aside className="p-6 rounded-2xl bg-[#141418] border border-[#202024] space-y-4 h-fit">
          <div className="flex items-center gap-2 text-[#C8A66A]">
            <BookOpen className="w-5 h-5" />
            <h2 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
              Provenienca e Trashëgimisë
            </h2>
          </div>

          <div className="p-3 rounded-xl bg-[#0B0B0D] border border-[#202024] text-xs text-[#F4F0E8]/80 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-[#C8A66A] shrink-0 mt-0.5" />
            <span>
              {content.provenance?.verifiedHistoricalFact
                ? 'Fakt historik i verifikuar me burime arkivore.'
                : 'Rrëfim folklorik / legjendë gojore (Nuk paraqitet si fakt historik i provuar pa verifikim burimor).'}
            </span>
          </div>

          <dl className="space-y-3 text-xs">
            <div>
              <dt className="text-[#F4F0E8]/50">Krahina / Origjina</dt>
              <dd className="text-[#F4F0E8] font-medium mt-0.5">
                {content.provenance?.regionOfOrigin || content.region || 'Shqipëri'}
              </dd>
            </div>
            <div>
              <dt className="text-[#F4F0E8]/50">Dialekti / Gjuha</dt>
              <dd className="text-[#F4F0E8] font-medium mt-0.5">
                {content.provenance?.dialect || content.language || 'Shqip'}
              </dd>
            </div>
            {content.provenance?.storyteller && (
              <div>
                <dt className="text-[#F4F0E8]/50">Rrëfimtari / Kontribuesi</dt>
                <dd className="text-[#F4F0E8] font-medium mt-0.5">
                  {content.provenance.storyteller}
                </dd>
              </div>
            )}
            {content.provenance?.sourceReferences && (
              <div>
                <dt className="text-[#F4F0E8]/50">Burimet & Bibliografia</dt>
                <dd className="text-[#F4F0E8] font-medium mt-0.5">
                  {content.provenance.sourceReferences}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-[#F4F0E8]/50">Të Drejtat & Licenca</dt>
              <dd className="text-[#F4F0E8] font-medium mt-0.5">
                {content.provenance?.rightsAndLicensing || 'MITO Heritage Archive'}
              </dd>
            </div>
          </dl>

          {relatedStories.length > 0 && (
            <div className="pt-4 border-t border-[#202024] space-y-2.5">
              <h3 className="text-xs font-semibold text-[#C8A66A]">Rrëfime të Ngjashme</h3>
              {relatedStories.map((rel) => (
                <button
                  key={rel.contentId}
                  type="button"
                  onClick={() => onNavigate(`/content/${rel.contentId}`)}
                  className="w-full text-left p-2.5 rounded-lg bg-[#0B0B0D] hover:bg-[#202024] text-xs text-[#F4F0E8] transition-colors cursor-pointer"
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
