import React, { useState, useEffect, useRef, useCallback } from 'react';

interface StartupIntroOverlayProps {
  onComplete: () => void;
}

const HORIZONTAL_INTRO_WEBP = '/assets/aistudio/intro_tv_1_2x.webp';
const VERTICAL_INTRO_WEBP = '/assets/aistudio/Startup_mobil_1_2x.webp';
const INTRO_AUDIO_MP3 = '/assets/aistudio/intro_audio_1_2x.mp3';

// 7.84s original video at 1.2x speed = ~6.45s
const INTRO_DURATION_MS = 6450;

// Pre-fetch raw audio bytes at module load so iPhone/Samsung playback has zero network latency
let preloadedAudioArrayBuffer: ArrayBuffer | null = null;
if (typeof window !== 'undefined') {
  window
    .fetch(INTRO_AUDIO_MP3)
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((buf) => {
      if (buf) preloadedAudioArrayBuffer = buf;
    })
    .catch(() => {});
}

export const StartupIntroOverlay: React.FC<StartupIntroOverlayProps> = ({ onComplete }) => {
  const completedRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const webAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioPlayingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mountSeed] = useState<number>(() => Date.now());
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

  const scheduleCompletionTimers = useCallback(
    (durationMs: number) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

      timerRef.current = setTimeout(() => {
        finishIntro();
      }, durationMs);

      fallbackTimerRef.current = setTimeout(() => {
        finishIntro();
      }, durationMs + 1000);
    },
    [finishIntro]
  );

  const startAudioAutomatically = useCallback(async () => {
    if (completedRef.current || audioPlayingRef.current) return;

    // 1. Try native HTML5 <audio autoPlay playsInline>
    const el = audioRef.current;
    if (el) {
      try {
        el.muted = false;
        el.volume = 1.0;
        await el.play();
        audioPlayingRef.current = true;
        return;
      } catch {
        // Fall through to WebAudio API
      }
    }

    // 2. Fallback / iOS WebAudio API unlock
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      if (!audioBufferRef.current) {
        const raw =
          preloadedAudioArrayBuffer
            ? preloadedAudioArrayBuffer.slice(0)
            : await (await fetch(INTRO_AUDIO_MP3)).arrayBuffer();
        audioBufferRef.current = await ctx.decodeAudioData(raw);
      }
      if (audioBufferRef.current && !completedRef.current && !audioPlayingRef.current && ctx.state === 'running') {
        const source = ctx.createBufferSource();
        source.buffer = audioBufferRef.current;
        source.connect(ctx.destination);
        source.start(0);
        webAudioSourceRef.current = source;
        audioPlayingRef.current = true;
      }
    } catch {
      // Ignore if browser holds audio until interaction
    }
  }, []);

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

  useEffect(() => {
    scheduleCompletionTimers(INTRO_DURATION_MS);
    startAudioAutomatically();

    // Retry automatic audio start shortly after mount & on any passive touch/gesture without showing any button
    const retryTimer = setTimeout(() => {
      if (!audioPlayingRef.current && !completedRef.current) {
        startAudioAutomatically();
      }
    }, 120);

    const handleSilentGesture = () => {
      if (!audioPlayingRef.current && !completedRef.current) {
        startAudioAutomatically();
      }
    };

    window.addEventListener('touchstart', handleSilentGesture, { passive: true });
    window.addEventListener('touchend', handleSilentGesture, { passive: true });
    window.addEventListener('pointerdown', handleSilentGesture, { passive: true });
    window.addEventListener('click', handleSilentGesture, { passive: true });
    window.addEventListener('keydown', handleSilentGesture, { passive: true });

    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener('touchstart', handleSilentGesture);
      window.removeEventListener('touchend', handleSilentGesture);
      window.removeEventListener('pointerdown', handleSilentGesture);
      window.removeEventListener('click', handleSilentGesture);
      window.removeEventListener('keydown', handleSilentGesture);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      stopAllAudio();
    };
  }, [scheduleCompletionTimers, startAudioAutomatically, stopAllAudio]);

  const activeSrc = `${isHorizontal ? HORIZONTAL_INTRO_WEBP : VERTICAL_INTRO_WEBP}?v=${mountSeed}`;

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-[#0B0B0D] flex items-center justify-center overflow-hidden select-none transition-opacity duration-300 ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-label="MITO Intro Animacion"
    >
      <audio
        ref={audioRef}
        src={INTRO_AUDIO_MP3}
        autoPlay
        preload="auto"
        playsInline
        className="hidden"
      />

      <img
        key={activeSrc}
        src={activeSrc}
        alt=""
        draggable={false}
        onError={finishIntro}
        className={`pointer-events-none select-none ${
          isHorizontal
            ? 'w-full h-full object-cover'
            : 'w-full h-full object-cover sm:max-w-[56.25vh] sm:mx-auto'
        }`}
      />
    </div>
  );
};
