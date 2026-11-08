import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, SkipForward } from 'lucide-react';

interface StartupIntroOverlayProps {
  onComplete: () => void;
}

const HORIZONTAL_INTRO_WEBP = '/assets/aistudio/intro_tv_1_2x.webp';
const VERTICAL_INTRO_WEBP = '/assets/aistudio/Startup_mobil_1_2x.webp';
const INTRO_AUDIO_MP3 = '/assets/aistudio/intro_audio_1_2x.mp3';

// 7.84s original video at 1.2x speed = ~6.53s
const INTRO_DURATION_MS = 6450;

export const StartupIntroOverlay: React.FC<StartupIntroOverlayProps> = ({ onComplete }) => {
  const completedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const webAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioPlayingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mountSeed, setMountSeed] = useState<number>(() => Date.now());
  const [needsTapForAudio, setNeedsTapForAudio] = useState<boolean>(false);
  const [audioStarted, setAudioStarted] = useState<boolean>(false);

  const [isHorizontal, setIsHorizontal] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= window.innerHeight;
  });

  const [isExiting, setIsExiting] = useState(false);

  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      } catch {
        // Ignore
      }
    }
    if (webAudioSourceRef.current) {
      try {
        webAudioSourceRef.current.stop();
        webAudioSourceRef.current.disconnect();
      } catch {
        // Ignore
      }
      webAudioSourceRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // Ignore
      }
      audioCtxRef.current = null;
    }
  }, []);

  const finishIntro = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    stopAllAudio();
    setIsExiting(true);
    setTimeout(() => {
      onComplete();
    }, 280);
  }, [onComplete, stopAllAudio]);

  const scheduleCompletionTimers = useCallback((durationMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    timerRef.current = setTimeout(() => {
      finishIntro();
    }, durationMs);

    fallbackTimerRef.current = setTimeout(() => {
      finishIntro();
    }, durationMs + 1500);
  }, [finishIntro]);

  const playViaWebAudioBuffer = useCallback(async (): Promise<boolean> => {
    try {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return false;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (!audioBufferRef.current) {
        const resp = await fetch(INTRO_AUDIO_MP3);
        const arr = await resp.arrayBuffer();
        audioBufferRef.current = await ctx.decodeAudioData(arr);
      }
      if (audioBufferRef.current && !completedRef.current) {
        if (webAudioSourceRef.current) {
          try {
            webAudioSourceRef.current.stop();
          } catch {
            // Ignore
          }
        }
        const source = ctx.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.connect(ctx.destination);
        source.start(0);
        webAudioSourceRef.current = source;
        audioPlayingRef.current = true;
        setAudioStarted(true);
        setNeedsTapForAudio(false);
        return true;
      }
    } catch {
      // Ignore WebAudio decode error
    }
    return false;
  }, []);

  const unlockAndPlayAudioWithAnimation = useCallback(async () => {
    if (completedRef.current || audioPlayingRef.current) return;

    // Restart animation from frame 0 so mobile audio and WebP animation are 100% synchronized
    setMountSeed(Date.now());
    scheduleCompletionTimers(INTRO_DURATION_MS);

    const el = audioRef.current;
    if (el) {
      try {
        el.muted = false;
        el.volume = 1.0;
        el.currentTime = 0;
        await el.play();
        audioPlayingRef.current = true;
        setAudioStarted(true);
        setNeedsTapForAudio(false);
        return;
      } catch {
        // Fallback to WebAudio buffer below (especially reliable on iOS Safari)
      }
    }

    await playViaWebAudioBuffer();
  }, [playViaWebAudioBuffer, scheduleCompletionTimers]);

  // Keep orientation in sync if viewport resizes
  useEffect(() => {
    const handleResize = () => {
      const nextHorizontal = window.innerWidth >= window.innerHeight;
      setIsHorizontal((prev) => (prev !== nextHorizontal ? nextHorizontal : prev));
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Preload WebAudio buffer and attempt immediate playback on mount
  useEffect(() => {
    // Pre-fetch audio buffer for instant mobile unlock on iPhone / Samsung
    (async () => {
      try {
        const AudioCtx =
          window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx && !audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
          const resp = await fetch(INTRO_AUDIO_MP3);
          const arr = await resp.arrayBuffer();
          audioBufferRef.current = await audioCtxRef.current.decodeAudioData(arr);
        }
      } catch {
        // Ignore preload error
      }
    })();

    const el = audioRef.current;
    if (el) {
      el.volume = 1.0;
      el.muted = false;
      el.play()
        .then(() => {
          audioPlayingRef.current = true;
          setAudioStarted(true);
          setNeedsTapForAudio(false);
          scheduleCompletionTimers(INTRO_DURATION_MS);
        })
        .catch(() => {
          // Mobile browser (iOS Safari / Android Chrome) requires a user tap to play unmuted audio
          setNeedsTapForAudio(true);
          // Give user time to tap for audio, or finish after 8.5s if untouched
          scheduleCompletionTimers(INTRO_DURATION_MS + 2200);
        });
    } else {
      scheduleCompletionTimers(INTRO_DURATION_MS);
    }

    const handleFirstUserGesture = () => {
      if (!audioPlayingRef.current && !completedRef.current) {
        unlockAndPlayAudioWithAnimation();
      }
    };

    window.addEventListener('touchend', handleFirstUserGesture, { once: true });
    window.addEventListener('pointerdown', handleFirstUserGesture, { once: true });
    window.addEventListener('click', handleFirstUserGesture, { once: true });
    window.addEventListener('keydown', handleFirstUserGesture, { once: true });

    return () => {
      window.removeEventListener('touchend', handleFirstUserGesture);
      window.removeEventListener('pointerdown', handleFirstUserGesture);
      window.removeEventListener('click', handleFirstUserGesture);
      window.removeEventListener('keydown', handleFirstUserGesture);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      stopAllAudio();
    };
  }, [scheduleCompletionTimers, stopAllAudio, unlockAndPlayAudioWithAnimation]);

  const handleAnimationLoaded = useCallback(() => {
    if (!needsTapForAudio) {
      scheduleCompletionTimers(INTRO_DURATION_MS);
    }
  }, [needsTapForAudio, scheduleCompletionTimers]);

  const activeSrc = `${isHorizontal ? HORIZONTAL_INTRO_WEBP : VERTICAL_INTRO_WEBP}?v=${mountSeed}`;

  return (
    <div
      onClick={() => {
        if (!audioPlayingRef.current) {
          unlockAndPlayAudioWithAnimation();
        }
      }}
      className={`fixed inset-0 z-[9999] bg-[#0B0B0D] flex items-center justify-center overflow-hidden select-none cursor-pointer transition-opacity duration-300 ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="MITO Intro Animacion"
    >
      {/* Mounted HTML5 Audio for iOS Safari & Android Chrome compatibility */}
      <audio
        ref={audioRef}
        src={INTRO_AUDIO_MP3}
        preload="auto"
        playsInline
        className="hidden"
      />

      <img
        key={activeSrc}
        src={activeSrc}
        alt=""
        draggable={false}
        onLoad={handleAnimationLoaded}
        onError={finishIntro}
        className={`pointer-events-none select-none ${
          isHorizontal
            ? 'w-full h-full object-cover'
            : 'w-full h-full object-cover sm:max-w-[56.25vh] sm:mx-auto'
        }`}
      />

      {/* Mobile Audio Unlock Prompt (shown on iPhone/Samsung when browser blocks auto-sound before first touch) */}
      {needsTapForAudio && !audioStarted && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            unlockAndPlayAudioWithAnimation();
          }}
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[10000] px-5 py-3 rounded-2xl bg-[#641C2B]/95 border border-[#C8A66A] text-[#F4F0E8] text-xs sm:text-sm font-semibold shadow-2xl flex items-center gap-2.5 animate-pulse cursor-pointer whitespace-nowrap"
        >
          <Volume2 className="w-4 h-4 text-[#C8A66A]" />
          <span>Prek ekranin për Hyrjen me Audio</span>
        </button>
      )}

      {/* Subtle Skip Button in Top-Right Corner */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          finishIntro();
        }}
        className="fixed top-6 right-5 z-[10000] px-3.5 py-2 rounded-xl bg-[#141418]/80 hover:bg-[#202024] border border-[#C8A66A]/35 text-[#F4F0E8]/85 text-xs font-medium flex items-center gap-1.5 backdrop-blur-md cursor-pointer"
      >
        <span>Kalo</span>
        <SkipForward className="w-3.5 h-3.5 text-[#C8A66A]" />
      </button>
    </div>
  );
};
