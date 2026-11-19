import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  ArrowLeft,
  Gamepad2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../utils/sessionToken';
import { formatCinemaTitle } from '../utils/displayTitle';
import type { VideoContent, PlaybackProgressRecord, GameItem } from '../types/mito';

interface StandardVideoPlayerViewProps {
  contentId: string;
  onNavigate: (path: string) => void;
  onAccessExpired: (reasonSq: string) => void;
}

export const StandardVideoPlayerView: React.FC<StandardVideoPlayerViewProps> = ({
  contentId,
  onNavigate,
  onAccessExpired,
}) => {
  const [content, setContent] = useState<VideoContent | null>(null);
  const [signedUrl, setSignedUrl] = useState<string>('');
  const [progress, setProgress] = useState<PlaybackProgressRecord | null>(null);
  const [relatedGames, setRelatedGames] = useState<GameItem[]>([]);
  const [watermarkText, setWatermarkText] = useState<string | null>(null);
  const [lowTimeWarningSq, setLowTimeWarningSq] = useState<string | null>(null);
  const [errorSq, setErrorSq] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(631);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [justUnlockedCelebration, setJustUnlockedCelebration] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const lastHeartbeatSecondRef = useRef<number>(0);

  // Initialize signed playback session & load content details
  useEffect(() => {
    let active = true;

    async function initPlayback() {
      try {
        const [detailRes, sessionRes] = await Promise.all([
          apiFetch(`/api/content/${contentId}`),
          apiFetch(`/api/content/${contentId}/playback-session`, { method: 'POST' }),
        ]);

        const detailData = await detailRes.json();
        const sessionData = await sessionRes.json();

        if (!active) return;

        if (!detailRes.ok || !sessionRes.ok) {
          setErrorSq(
            sessionData.error ||
              detailData.error ||
              'Ky material nuk është i disponueshëm për llogarinë tënde.'
          );
          return;
        }

        setContent(detailData.content);
        const fullDur = Math.max(5, detailData.content.durationSeconds || 631);
        setDuration(fullDur);
        setRelatedGames(detailData.relatedGames || []);
        const rawPlaybackUrl = sessionData.signedPlaybackUrl || detailData.content.playbackUrl;
        const sep = rawPlaybackUrl.includes('?') ? '&' : '?';
        setSignedUrl(`${rawPlaybackUrl}${sep}v=besa_full_824p`);
        setProgress(sessionData.progress);
        setWatermarkText(sessionData.watermarkText || null);
        setLowTimeWarningSq(sessionData.lowTimeWarningSq || null);

        if (
          sessionData.progress?.currentTimeSeconds > 0 &&
          sessionData.progress.currentTimeSeconds < fullDur - 5 &&
          (sessionData.progress.durationSeconds || 0) > 120
        ) {
          setCurrentTime(sessionData.progress.currentTimeSeconds);
          lastHeartbeatSecondRef.current = sessionData.progress.currentTimeSeconds;
        } else {
          setCurrentTime(0);
          lastHeartbeatSecondRef.current = 0;
        }
        setIsPlaying(true);
      } catch {
        if (active) setErrorSq('Gabim gjatë nisjes së transmetimit të videos.');
      }
    }

    initPlayback();
    return () => {
      active = false;
    };
  }, [contentId]);

  const sendHeartbeat = async (segStart: number, segEnd: number, currSec: number) => {
    try {
      const res = await apiFetch(`/api/content/${contentId}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentTimeSeconds: currSec,
          segmentStart: segStart,
          segmentEnd: segEnd,
        }),
      });
      const data = await res.json();
      if (res.status === 403 && data.expired) {
        setIsPlaying(false);
        onAccessExpired(data.error || 'Sesioni yt ka përfunduar.');
        return;
      }
      if (res.ok && data.progress) {
        setProgress(data.progress);
        if (data.justUnlockedGame) {
          setJustUnlockedCelebration(true);
        }
        if (data.lowTimeWarningSq) {
          setLowTimeWarningSq(data.lowTimeWarningSq);
        }
      }
    } catch {
      // Ignore transient network error
    }
  };

  const wasNativeFsRef = useRef<boolean>(false);

  // Toggle Fullscreen reliably across Desktop, iFrame, Android, and iPhone/iOS Safari
  const toggleFullscreen = useCallback(async () => {
    const container = playerContainerRef.current as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    }) | null;
    const videoEl = videoRef.current as (HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      webkitExitFullscreen?: () => void;
      webkitDisplayingFullscreen?: boolean;
    }) | null;
    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void>;
    };

    const nativeFsActive = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);

    if (nativeFsActive || isFullscreen) {
      wasNativeFsRef.current = false;
      setIsFullscreen(false);
      try {
        if (doc.exitFullscreen && doc.fullscreenElement) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen && doc.webkitFullscreenElement) {
          await doc.webkitExitFullscreen();
        } else if (videoEl?.webkitExitFullscreen && videoEl.webkitDisplayingFullscreen) {
          videoEl.webkitExitFullscreen();
        }
      } catch {
        // Fallback already handled via isFullscreen = false
      }
      return;
    }

    setIsFullscreen(true);
    try {
      if (videoEl?.webkitEnterFullscreen && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        videoEl.webkitEnterFullscreen();
      } else if (container?.requestFullscreen) {
        await container.requestFullscreen();
        wasNativeFsRef.current = true;
      } else if (container?.webkitRequestFullscreen) {
        await container.webkitRequestFullscreen();
        wasNativeFsRef.current = true;
      } else if (videoEl?.webkitEnterFullscreen) {
        videoEl.webkitEnterFullscreen();
      }
    } catch {
      wasNativeFsRef.current = false;
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFsChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const active = Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (active) {
        wasNativeFsRef.current = true;
        setIsFullscreen(true);
      } else if (wasNativeFsRef.current) {
        wasNativeFsRef.current = false;
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !signedUrl) return;
    vid.muted = isMuted;
    vid.volume = volume;
    vid.playbackRate = playbackSpeed;

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
  }, [isPlaying, isMuted, volume, playbackSpeed, signedUrl]);

  useEffect(() => {
    if (!isPlaying || !content) return;
    const interval = window.setInterval(() => {
      const vid = videoRef.current;
      if (vid && !vid.paused && vid.readyState >= 2) {
        return;
      }
      setCurrentTime((prev) => {
        const next = Math.min(duration, prev + playbackSpeed);
        if (next - lastHeartbeatSecondRef.current >= 5 || next >= duration) {
          const segStart = lastHeartbeatSecondRef.current;
          lastHeartbeatSecondRef.current = next;
          sendHeartbeat(segStart, next, next);
        }
        if (next >= duration) {
          setIsPlaying(false);
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isPlaying, playbackSpeed, duration, content?.contentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      } else if (e.key.toLowerCase() === 'm') {
        setIsMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleFullscreen, isFullscreen]);

  if (errorSq) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <div className="p-8 rounded-3xl mito-surface-gold">
          <h1 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">{errorSq}</h1>
          <button
            type="button"
            onClick={() => onNavigate('/home')}
            className="mt-4 px-5 py-2.5 rounded-xl bg-white/[0.06] text-xs font-semibold text-[#C8A66A] cursor-pointer"
          >
            Kthehu në Kreu
          </button>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center text-sm text-[#C8A66A] font-mono-code">
        Po përgatitet salla kinematografike MITO...
      </div>
    );
  }

  const verifiedPercent = progress?.completionPercent || 0;
  const isUnlocked = true;
  const formattedTitle = formatCinemaTitle(content.title);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 safe-main-content relative">
      {/* Subtle Ambient Theater Backlight */}
      <div
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 w-[80%] h-[360px] blur-3xl opacity-35"
        style={{
          background:
            'radial-gradient(ellipse, rgba(100, 28, 43, 0.55) 0%, rgba(200, 166, 106, 0.12) 45%, transparent 72%)',
        }}
      />

      {/* Top Navigation & Info */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate(`/content/${content.contentId}`)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#C8A66A] hover:text-[#E4C88E] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kthehu te Detajet: {formattedTitle.primaryTitle}</span>
        </button>

        {lowTimeWarningSq && (
          <span className="text-xs text-[#C8A66A] font-medium">{lowTimeWarningSq}</span>
        )}
      </div>

      {/* Main 16:9 Cinema Video Player (No subtitles, No PiP, Fullscreen Working) */}
      <div
        ref={playerContainerRef}
        className={
          isFullscreen
            ? 'fixed inset-0 z-[9999] w-screen h-screen bg-black flex flex-col justify-between select-none'
            : 'relative z-10 w-full aspect-video bg-[#070709] rounded-3xl overflow-hidden border border-[#C8A66A]/40 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.95)] flex flex-col justify-between select-none mito-reveal'
        }
      >
        {/* Video & Backdrop */}
        <div
          onClick={() => setIsPlaying((p) => !p)}
          onDoubleClick={toggleFullscreen}
          className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black"
        >
          {(!isPlaying || !videoReady) && (
            <img
              src={content.heroUrl || content.posterUrl || content.thumbnailUrl}
              alt={content.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-55"
            />
          )}
          {signedUrl && (
            <video
              ref={videoRef}
              src={signedUrl}
              poster={content.posterUrl || content.thumbnailUrl || '/assets/aistudio/BesaCover_3b623702.jpg'}
              muted={isMuted}
              playsInline
              preload="auto"
              onCanPlay={() => setVideoReady(true)}
              onPlaying={() => setVideoReady(true)}
              onLoadedMetadata={(e) => {
                const vid = e.currentTarget;
                if (vid.duration && Number.isFinite(vid.duration) && vid.duration > 0) {
                  setDuration(Math.round(vid.duration));
                }
                if (currentTime > 0 && vid.duration && currentTime < vid.duration - 2) {
                  vid.currentTime = currentTime;
                }
                if (isPlaying) {
                  vid.play().catch(() => {
                    vid.muted = true;
                    setIsMuted(true);
                    vid.play().catch(() => {});
                  });
                }
              }}
              onError={() => {
                const directBesaUrl =
                  '/assets/aistudio/BESA_Short_Film_Higgsfield_Global_Film_Festival_Nominee_-_OLL_KORRECT__824p__9574e991.mp4';
                if (
                  (content.contentId === 'cnt_1793701774719_0bebb6e7' ||
                    content.title.toLowerCase().includes('besa')) &&
                  !signedUrl.includes(directBesaUrl)
                ) {
                  setSignedUrl(directBesaUrl);
                }
              }}
              onTimeUpdate={(e) => {
                const nowSec = e.currentTarget.currentTime;
                setCurrentTime(nowSec);
                if (Math.abs(nowSec - lastHeartbeatSecondRef.current) >= 5) {
                  const segStart = Math.min(lastHeartbeatSecondRef.current, nowSec);
                  lastHeartbeatSecondRef.current = nowSec;
                  sendHeartbeat(segStart, nowSec, nowSec);
                }
              }}
              onEnded={() => {
                setIsPlaying(false);
                sendHeartbeat(lastHeartbeatSecondRef.current, duration, duration);
              }}
              className="absolute inset-0 w-full h-full object-contain z-[1]"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none z-[2]" />
        </div>

        {/* Top Watermark & Technical Info */}
        <div className="relative z-10 flex items-center justify-between p-4 sm:p-5 pointer-events-none">
          <div className="text-xs font-medium text-[#F4F0E8]/90">
            <span className="font-serif-heritage font-semibold">{formattedTitle.primaryTitle}</span>
            <span aria-hidden="true" className="mx-1.5 text-[#C8A66A]">·</span>
            <span className="font-mono-code text-[#C8A66A]">{content.resolution}</span>
          </div>
          {watermarkText && (
            <div className="text-[11px] font-mono-code text-[#F4F0E8]/45">
              {watermarkText}
            </div>
          )}
        </div>

        {/* Center Play/Pause Overlay */}
        {!isPlaying && (
          <div className="relative z-10 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#641C2B]/90 backdrop-blur-md border-2 border-[#C8A66A] flex items-center justify-center text-[#F4F0E8] shadow-2xl">
              <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-0.5 text-[#C8A66A]" />
            </div>
          </div>
        )}

        {/* Bottom Controls Bar */}
        <div className="relative z-10 p-4 sm:p-5 space-y-3 bg-gradient-to-t from-black/90 via-black/55 to-transparent">
          {/* Timeline Scrubber */}
          <div className="space-y-1.5">
            <input
              type="range"
              min={0}
              max={Math.max(1, duration)}
              step={0.1}
              value={Math.min(currentTime, duration)}
              onChange={(e) => {
                const target = Number(e.target.value);
                setCurrentTime(target);
                if (videoRef.current) {
                  try {
                    videoRef.current.currentTime = target;
                  } catch {
                    // Ignore seek error
                  }
                }
                lastHeartbeatSecondRef.current = target;
              }}
              aria-label="Pozicioni i videos"
              className="w-full accent-[#C8A66A] cursor-pointer h-1.5"
            />
            <div className="flex justify-between text-[11px] font-mono-code text-[#F4F0E8]/80">
              <span>{formatTime(currentTime)}</span>
              <span className="text-[#C8A66A]">Progresi i shikimit: {verifiedPercent}%</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Player Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? 'Ndalo' : 'Luaj'}
                className="min-h-[40px] min-w-[40px] p-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer flex items-center justify-center"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                aria-label={isMuted ? 'Aktivizo zërin' : 'Hesht zërin'}
                className="min-h-[40px] min-w-[40px] p-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-[#F4F0E8] cursor-pointer flex items-center justify-center"
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
                  const v = Number(e.target.value);
                  setVolume(v);
                  setIsMuted(v === 0);
                }}
                aria-label="Volumi"
                className="w-20 accent-[#C8A66A] cursor-pointer hidden sm:block"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                aria-label="Shpejtësia e leximit"
                className="min-h-[40px] px-2.5 py-2 rounded-xl bg-[#111116]/90 border border-white/[0.12] text-xs font-mono-code text-[#F4F0E8]"
              >
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Dil nga ekrani i plotë' : 'Ekran i plotë'}
                title={isFullscreen ? 'Dil nga ekrani i plotë' : 'Ekran i plotë'}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-[#F4F0E8] border border-[#C8A66A]/45 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              >
                {isFullscreen ? (
                  <>
                    <Minimize className="w-4 h-4 text-[#C8A66A]" />
                    <span className="hidden sm:inline">Zvogëlo</span>
                  </>
                ) : (
                  <>
                    <Maximize className="w-4 h-4 text-[#C8A66A]" />
                    <span className="hidden sm:inline">Ekran i Plotë</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Video Questionnaire / Quiz Card */}
      <div className="relative z-10 p-5 sm:p-6 rounded-3xl mito-surface-gold flex flex-wrap items-center justify-between gap-4 mito-reveal-delay-1">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-950/60 border border-emerald-500/45 flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
              <span>
                {relatedGames.length > 0
                  ? `Pyetësori i Videos: ${relatedGames[0].title}`
                  : 'Pyetësori dhe Kuizi Interaktiv i Videos'}
              </span>
              {justUnlockedCelebration && <Sparkles className="w-4 h-4 text-[#C8A66A]" />}
            </h2>
            <p className="text-xs text-[#F4F0E8]/65 mt-0.5">
              Pyetësori është i hapur menjëherë — mund ta plotësoni në çdo moment.
            </p>
          </div>
        </div>

        {relatedGames.length > 0 && isUnlocked && (
          <button
            type="button"
            onClick={() => onNavigate(`/games/${relatedGames[0].gameId}`)}
            className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 mito-cta-primary cursor-pointer"
          >
            <Gamepad2 className="w-4 h-4 text-[#C8A66A]" />
            <span>Luaj Pyetësorin Tani</span>
          </button>
        )}
      </div>
    </div>
  );
};
