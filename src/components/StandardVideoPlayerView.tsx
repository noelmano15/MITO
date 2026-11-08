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

    // Enter Fullscreen: Always activate full-viewport CSS mode immediately so it works inside iframes & mobile,
    // and also request native browser/iOS fullscreen when supported
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
      // Keep isFullscreen = true so the video fills the entire viewport even if iframe blocks native API
      wasNativeFsRef.current = false;
    }
  }, [isFullscreen]);

  // Keep state synced when user exits native fullscreen via Esc key
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

  // Sync HTML5 <video> element with React state (play/pause, volume, mute, playbackRate)
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

  // Fallback timer only if video element has not loaded frames yet
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

  // Keyboard shortcuts (Space, F, Escape, M)
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
        <div className="p-8 rounded-2xl bg-[#141418] border border-[#641C2B]">
          <h1 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">{errorSq}</h1>
          <button
            type="button"
            onClick={() => onNavigate('/home')}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#202024] text-xs font-semibold text-[#C8A66A] cursor-pointer"
          >
            Kthehu në Kreu
          </button>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-sm text-[#F4F0E8]/60">
        Po përgatitet lexuesi i videos MITO...
      </div>
    );
  }

  const verifiedPercent = progress?.completionPercent || 0;
  const isUnlocked = true;

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 space-y-6 safe-main-content">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => onNavigate(`/content/${content.contentId}`)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#C8A66A] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kthehu te Detajet: {content.title}</span>
        </button>

        {lowTimeWarningSq && (
          <span className="text-xs text-[#C8A66A] font-medium">{lowTimeWarningSq}</span>
        )}
      </div>

      {/* Main 16:9 Standard Video Player (Supports Fullscreen on Desktop, iFrame & Mobile) */}
      <div
        ref={playerContainerRef}
        className={
          isFullscreen
            ? 'fixed inset-0 z-[9999] w-screen h-screen bg-black flex flex-col justify-between select-none'
            : 'relative w-full aspect-video bg-[#0B0B0D] rounded-2xl overflow-hidden border border-[#C8A66A]/35 shadow-2xl flex flex-col justify-between select-none'
        }
      >
        {/* Video & Backdrop */}
        <div
          onClick={() => setIsPlaying((p) => !p)}
          onDoubleClick={toggleFullscreen}
          className="absolute inset-0 flex items-center justify-center cursor-pointer bg-black"
        >
          {!isPlaying && (
            <img
              src={content.heroUrl || content.posterUrl || content.thumbnailUrl}
              alt={content.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover opacity-50"
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25 pointer-events-none z-[2]" />
        </div>

        {/* Top Watermark & Technical Info */}
        <div className="relative z-10 flex items-center justify-between p-4 pointer-events-none">
          <div className="text-xs font-medium text-[#F4F0E8]/85">
            <span>{content.title}</span>
            <span aria-hidden="true" className="mx-1.5 text-[#C8A66A]">·</span>
            <span className="font-mono-code text-[#C8A66A]">{content.resolution}</span>
          </div>
          {watermarkText && (
            <div className="text-[11px] font-mono-code text-[#F4F0E8]/45 bg-black/40 px-2.5 py-1 rounded">
              {watermarkText}
            </div>
          )}
        </div>

        {/* Center Play/Pause Overlay Button */}
        {!isPlaying && (
          <div className="relative z-10 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 rounded-full bg-[#641C2B]/90 border-2 border-[#C8A66A] flex items-center justify-center text-[#F4F0E8] shadow-2xl">
              <Play className="w-7 h-7 fill-current ml-0.5 text-[#C8A66A]" />
            </div>
          </div>
        )}

        {/* Bottom Controls Bar (Subtitles & PiP removed, Fullscreen working) */}
        <div className="relative z-10 p-4 space-y-3">
          {/* Timeline Scrubber */}
          <div className="space-y-1">
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
            <div className="flex justify-between text-[11px] font-mono-code text-[#F4F0E8]/75">
              <span>{formatTime(currentTime)}</span>
              <span>Progresi i shikimit: {verifiedPercent}%</span>
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
                className="p-2.5 rounded-lg bg-[#641C2B] hover:bg-[#7D2336] text-[#F4F0E8] border border-[#C8A66A]/40 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                aria-label={isMuted ? 'Aktivizo zërin' : 'Hesht zërin'}
                className="p-2.5 rounded-lg bg-[#141418] hover:bg-[#202024] text-[#F4F0E8] cursor-pointer"
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
              {/* Playback Speed */}
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                aria-label="Shpejtësia e leximit"
                className="px-2.5 py-2 rounded-lg bg-[#141418] border border-[#202024] text-xs font-mono-code text-[#F4F0E8]"
              >
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>

              {/* Fullscreen Toggle Button */}
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Dil nga ekrani i plotë' : 'Ekran i plotë'}
                title={isFullscreen ? 'Dil nga ekrani i plotë' : 'Ekran i plotë'}
                className="px-3 py-2 rounded-lg bg-[#641C2B] hover:bg-[#7D2336] text-[#F4F0E8] border border-[#C8A66A]/45 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
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

      {/* Video Questionnaire / Quiz Card (Always Immediately Unlocked — 0% Watch Requirement) */}
      <div className="p-5 rounded-2xl bg-[#141418] border border-[#C8A66A]/35 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-emerald-950/60 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
              <span>
                {relatedGames.length > 0
                  ? `Pyetësori i Videos: ${relatedGames[0].title}`
                  : 'Pyetësori dhe Kuizi Interaktiv i Videos'}
              </span>
              {justUnlockedCelebration && <Sparkles className="w-4 h-4 text-[#C8A66A]" />}
            </h2>
            <p className="text-xs text-[#F4F0E8]/65 mt-0.5">
              Pyetësori është i hapur menjëherë — mund ta plotësoni në çdo moment pa qenë nevoja të shikoni një pjesë të caktuar të videos.
            </p>
          </div>
        </div>

        {relatedGames.length > 0 && isUnlocked && (
          <button
            type="button"
            onClick={() => onNavigate(`/games/${relatedGames[0].gameId}`)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 transition-colors cursor-pointer"
          >
            <Gamepad2 className="w-4 h-4 text-[#C8A66A]" />
            <span>Luaj Pyetësorin Tani</span>
          </button>
        )}
      </div>
    </div>
  );
};
