import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Play,
  Trophy,
  QrCode,
  Smartphone,
  Wifi,
  CheckCircle2,
  ArrowRight,
  XCircle,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { apiFetch } from '../utils/sessionToken';
import type { MultiplayerRoom, MultiplayerPlayer } from '../types/mito';

function useRoomWebSocket(
  roomCode: string | null,
  playerId: string | null,
  onRoomUpdate: (room: MultiplayerRoom) => void
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      if (!active) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'room:subscribe',
            roomCode,
            playerId,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.room) {
            onRoomUpdate(msg.room);
          }
        } catch {
          // Ignore parse error
        }
      };

      ws.onclose = () => {
        if (active) {
          setTimeout(connect, 2000);
        }
      };
    };

    connect();
    return () => {
      active = false;
      wsRef.current?.close();
    };
  }, [roomCode, playerId]);
}

// =========================================================
// 1. TV / DESKTOP HOST VIEW (/play/:roomCode/host)
// =========================================================

interface MultiplayerHostViewProps {
  roomCode: string;
  onNavigate: (path: string) => void;
}

export const MultiplayerHostView: React.FC<MultiplayerHostViewProps> = ({
  roomCode,
  onNavigate,
}) => {
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [controllerUrl, setControllerUrl] = useState<string>('');
  const [errorSq, setErrorSq] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(20);

  useEffect(() => {
    apiFetch(`/api/multiplayer/rooms/${roomCode}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorSq(data.error || 'Dhoma e lojës nuk u gjet.');
          return;
        }
        setRoom(data.room);
        setQrCodeDataUrl(data.qrCodeDataUrl || '');
        setControllerUrl(data.controllerUrl || '');
      })
      .catch(() => setErrorSq('Gabim gjatë ngarkimit të dhomës multiplayer.'));
  }, [roomCode]);

  useRoomWebSocket(roomCode, null, (updatedRoom) => {
    setRoom(updatedRoom);
  });

  useEffect(() => {
    if (!room || room.status !== 'question' || !room.questionDeadlineAt) return;
    const interval = window.setInterval(() => {
      const rem = Math.max(0, Math.ceil((room.questionDeadlineAt! - Date.now()) / 1000));
      setTimeLeft(rem);
    }, 300);
    return () => window.clearInterval(interval);
  }, [room?.status, room?.currentQuestionIndex, room?.questionDeadlineAt]);

  const handleHostAction = async (action: 'start' | 'reveal' | 'next' | 'terminate') => {
    try {
      const res = await apiFetch(`/api/multiplayer/rooms/${roomCode}/host-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok && data.room) {
        setRoom(data.room);
        if (action === 'terminate') {
          onNavigate('/games');
        }
      }
    } catch {
      // Ignore error
    }
  };

  if (errorSq || !room) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="p-8 rounded-2xl bg-[#141418] border border-[#641C2B] space-y-4">
          <h1 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">
            {errorSq || 'Po ngarkohet dhoma...'}
          </h1>
          <button
            type="button"
            onClick={() => onNavigate('/games')}
            className="px-5 py-2.5 rounded-xl bg-[#202024] text-xs font-semibold text-[#C8A66A] cursor-pointer"
          >
            Kthehu te Lojërat
          </button>
        </div>
      </div>
    );
  }

  const answeredCount = room.players.filter(
    (p) => p.lastAnsweredQuestionIndex === room.currentQuestionIndex
  ).length;
  const sortedPlayers = [...room.players].sort((a, b) => b.score - a.score);

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 py-8 space-y-8">
      {/* Top TV Host Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-[#202024]">
        <div>
          <span className="text-xs font-mono-code text-[#C8A66A]">
            EKRANI KRYESOR (TV HOST) · KODI I DHOMËS: {room.roomCode}
          </span>
          <h1 className="text-2xl sm:text-3xl font-serif-heritage font-bold text-[#F4F0E8]">
            {room.gameTitle}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.open(`/controller/${room.roomCode}`, '_blank')}
            className="px-4 py-2 rounded-xl bg-[#202024] hover:bg-[#C8A66A] hover:text-[#0B0B0D] text-xs font-semibold text-[#C8A66A] transition-colors cursor-pointer"
          >
            Hap Kontrollerin e Telefonit →
          </button>
          <button
            type="button"
            onClick={() => handleHostAction('terminate')}
            className="px-4 py-2 rounded-xl bg-[#141418] hover:bg-[#641C2B] text-xs font-medium text-[#F4F0E8]/80 border border-[#202024] cursor-pointer"
          >
            Mbyll Dhomën
          </button>
        </div>
      </div>

      {/* LOBBY STATE */}
      {room.status === 'lobby' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          {/* QR Code & Room Code Display */}
          <div className="p-8 rounded-2xl bg-[#141418] border border-[#C8A66A]/40 text-center space-y-6">
            <h2 className="text-2xl font-serif-heritage font-bold text-[#F4F0E8]">
              Luaj me Miqtë!
            </h2>
            <p className="text-sm text-[#F4F0E8]/70">
              Skanoni kodin QR me kamerën e telefonit ose hyni te{' '}
              <span className="text-[#C8A66A] font-mono-code">/join</span> dhe shkruani kodin e lojës:
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              {qrCodeDataUrl ? (
                <img
                  src={qrCodeDataUrl}
                  alt={`QR Code për dhomën ${room.roomCode}`}
                  className="w-44 h-44 rounded-xl border-4 border-[#C8A66A] bg-[#F4F0E8] p-1"
                />
              ) : (
                <div className="w-44 h-44 rounded-xl border border-[#C8A66A] flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-[#C8A66A]" />
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs text-[#C8A66A] tracking-widest">KODI I LOJËS</div>
                <div className="px-6 py-4 rounded-2xl bg-[#0B0B0D] border-2 border-[#C8A66A] font-mono-code text-4xl font-bold tracking-[0.22em] text-[#F4F0E8]">
                  {room.roomCode}
                </div>
                <p className="text-[11px] text-[#F4F0E8]/55 font-mono-code truncate max-w-[220px]">
                  {controllerUrl}
                </p>
              </div>
            </div>
          </div>

          {/* Connected Players Lobby */}
          <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#C8A66A]" />
                <span>
                  Lojtarë të Lidhur ({room.players.length} / {room.maxPlayers})
                </span>
              </h3>
            </div>

            {room.players.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#F4F0E8]/55 border border-dashed border-[#202024] rounded-xl">
                Po priten lojtarët të bashkohen nga telefonat e tyre...
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {room.players.map((p) => (
                  <div
                    key={p.playerId}
                    className="p-3 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/35 flex items-center justify-between"
                  >
                    <span className="text-sm font-semibold text-[#F4F0E8] truncate">
                      {p.nickname}
                    </span>
                    <Wifi
                      className={`w-3.5 h-3.5 ${
                        p.connected ? 'text-emerald-400' : 'text-[#F4F0E8]/30'
                      }`}
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => handleHostAction('start')}
              className="w-full py-4 px-6 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-base font-semibold text-[#F4F0E8] border border-[#C8A66A]/50 flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current text-[#C8A66A]" />
              <span>Fillo Lojën</span>
            </button>
          </div>
        </div>
      )}

      {/* QUESTION / REVEAL STATE ON TV */}
      {(room.status === 'question' || room.status === 'reveal') && room.currentQuestionPublic && (
        <div className="p-8 rounded-2xl bg-[#141418] border border-[#C8A66A]/45 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#202024]">
            <span className="text-xs font-mono-code text-[#C8A66A]">
              PYETJA {room.currentQuestionIndex + 1}
            </span>
            <span className="text-xs font-mono-code text-[#F4F0E8]">
              Përgjigje nga telefonat: {answeredCount} / {room.players.length}
            </span>
            <span className="px-4 py-1.5 rounded-lg bg-[#641C2B] font-mono-code text-base font-bold text-[#F4F0E8]">
              {room.status === 'question' ? `${timeLeft}s` : 'Rezultati'}
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-serif-heritage font-bold text-[#F4F0E8] text-center py-4">
            {room.currentQuestionPublic.questionText}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {room.currentQuestionPublic.choices.map((ch, idx) => {
              const letter = ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
              const isCorrectChoice =
                room.status === 'reveal' && room.revealedCorrectIndex === idx;
              return (
                <div
                  key={idx}
                  className={`p-5 rounded-xl border flex items-center gap-4 ${
                    isCorrectChoice
                      ? 'bg-emerald-950/60 border-emerald-400 text-emerald-100'
                      : 'bg-[#0B0B0D] border-[#202024] text-[#F4F0E8]'
                  }`}
                >
                  <span className="w-10 h-10 rounded-xl bg-[#202024] border border-[#C8A66A]/40 flex items-center justify-center font-mono-code text-base font-bold text-[#C8A66A]">
                    {letter}
                  </span>
                  <span className="text-base font-semibold">{ch}</span>
                </div>
              );
            })}
          </div>

          {room.status === 'reveal' && room.revealedExplanation && (
            <div className="p-4 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/35 text-xs text-[#F4F0E8]/80">
              Shpjegimi: {room.revealedExplanation}
            </div>
          )}

          <div className="pt-4 border-t border-[#202024] flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {sortedPlayers.slice(0, 4).map((p, idx) => (
                <span
                  key={p.playerId}
                  className="text-xs font-mono-code px-3 py-1 rounded bg-[#0B0B0D] border border-[#202024]"
                >
                  #{idx + 1} {p.nickname}: {p.score}p
                </span>
              ))}
            </div>

            {room.status === 'question' ? (
              <button
                type="button"
                onClick={() => handleHostAction('reveal')}
                className="px-5 py-2.5 rounded-xl bg-[#202024] hover:bg-[#C8A66A] hover:text-[#0B0B0D] text-xs font-semibold text-[#C8A66A] cursor-pointer"
              >
                Zbulo Përgjigjen e Saktë
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleHostAction('next')}
                className="px-6 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
              >
                Pyetja Tjetër →
              </button>
            )}
          </div>
        </div>
      )}

      {/* FINISHED PODIUM STATE */}
      {room.status === 'finished' && (
        <div className="p-8 rounded-2xl bg-[#141418] border border-[#C8A66A] text-center space-y-6">
          <Trophy className="w-14 h-14 text-[#C8A66A] mx-auto" />
          <h2 className="text-3xl font-serif-heritage font-bold text-[#F4F0E8]">
            Renditja Finale e Dhomës {room.roomCode}
          </h2>

          <div className="max-w-lg mx-auto space-y-3">
            {sortedPlayers.map((p, idx) => (
              <div
                key={p.playerId}
                className="p-4 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/35 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-[#641C2B] text-[#C8A66A] font-mono-code font-bold flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <span className="text-base font-semibold text-[#F4F0E8]">{p.nickname}</span>
                </div>
                <span className="font-mono-code text-lg font-bold text-[#C8A66A]">
                  {p.score} pikë
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================
// 2. MOBILE PHONE CONTROLLER VIEW (/join & /controller/:roomCode)
// =========================================================

interface MobileControllerViewProps {
  initialRoomCode?: string | null;
  onNavigate: (path: string) => void;
}

export const MobileControllerView: React.FC<MobileControllerViewProps> = ({
  initialRoomCode,
  onNavigate,
}) => {
  const [roomCodeInput, setRoomCodeInput] = useState(initialRoomCode || '');
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState('eagle');
  const [player, setPlayer] = useState<MultiplayerPlayer | null>(null);
  const [room, setRoom] = useState<MultiplayerRoom | null>(null);
  const [submittedQuestionIdx, setSubmittedQuestionIdx] = useState<number>(-1);
  const [errorSq, setErrorSq] = useState<string | null>(null);

  useRoomWebSocket(room?.roomCode || initialRoomCode || null, player?.playerId || null, (updatedRoom) => {
    setRoom(updatedRoom);
    if (player) {
      const updatedMe = updatedRoom.players.find((p) => p.playerId === player.playerId);
      if (updatedMe) setPlayer(updatedMe);
    }
  });

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = roomCodeInput.replace(/\D/g, '').slice(0, 6);
    if (cleanCode.length < 4) {
      setErrorSq('Ju lutem shkruani kodin 6-shifror të dhomës.');
      return;
    }
    if (!nickname.trim()) {
      setErrorSq('Ju lutem shkruani pseudonimin tuaj.');
      return;
    }

    setErrorSq(null);
    try {
      const res = await apiFetch(`/api/multiplayer/rooms/${cleanCode}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: nickname.trim(),
          avatar,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorSq(data.error || 'Dhoma nuk u gjet.');
        return;
      }
      setPlayer(data.player);
      setRoom(data.room);
    } catch {
      setErrorSq('Gabim rrjeti gjatë lidhjes me dhomën.');
    }
  };

  const handleSendControllerAnswer = async (choiceIndex: number) => {
    if (!room || !player) return;
    setSubmittedQuestionIdx(room.currentQuestionIndex);
    try {
      await apiFetch(`/api/multiplayer/rooms/${room.roomCode}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerId: player.playerId,
          choiceIndex,
        }),
      });
    } catch {
      // Ignore error
    }
  };

  // Join Form before entering controller
  if (!player || !room) {
    return (
      <div className="min-h-screen bg-[#0B0B0D] text-[#F4F0E8] flex flex-col justify-between p-5">
        <header className="flex items-center justify-between">
          <BrandLogo variant="compact" size="sm" />
          <button
            type="button"
            onClick={() => onNavigate('/login')}
            className="text-xs text-[#C8A66A] hover:underline cursor-pointer"
          >
            Kthehu
          </button>
        </header>

        <div className="max-w-sm w-full mx-auto bg-[#141418] border border-[#C8A66A]/35 rounded-2xl p-6 space-y-5">
          <div className="text-center space-y-1">
            <Smartphone className="w-8 h-8 text-[#C8A66A] mx-auto" />
            <h1 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">
              Kontrolleri i Telefonit MITO
            </h1>
            <p className="text-xs text-[#F4F0E8]/65">
              Bashkohu në lojën e dhomës pa pasur nevojë për llogari.
            </p>
          </div>

          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div>
              <label htmlFor="join-room-code" className="block text-xs text-[#C8A66A] mb-1">
                Kodi i Dhomës (6 shifra në TV)
              </label>
              <input
                id="join-room-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.replace(/\D/g, ''))}
                placeholder="482913"
                className="w-full py-3 px-4 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/40 text-center font-mono-code text-2xl tracking-widest text-[#F4F0E8]"
              />
            </div>

            <div>
              <label htmlFor="join-nickname" className="block text-xs text-[#C8A66A] mb-1">
                Pseudonimi i Lojtarit
              </label>
              <input
                id="join-nickname"
                type="text"
                maxLength={20}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="p.sh. Gjergji"
                className="w-full py-2.5 px-4 rounded-xl bg-[#0B0B0D] border border-[#202024] text-sm text-[#F4F0E8]"
              />
            </div>

            {errorSq && (
              <div className="p-3 rounded-xl bg-[#641C2B]/30 border border-[#641C2B] text-xs text-[#F4F0E8]">
                {errorSq}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-sm font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Hyr si Kontroller</span>
              <ArrowRight className="w-4 h-4 text-[#C8A66A]" />
            </button>
          </form>
        </div>

        <footer className="text-center text-[11px] text-[#F4F0E8]/40">
          MITO Local Party Mode · Telefon si Kontroller
        </footer>
      </div>
    );
  }

  const alreadyAnswered =
    submittedQuestionIdx === room.currentQuestionIndex ||
    player.lastAnsweredQuestionIndex === room.currentQuestionIndex;

  const controllerColors = [
    'bg-[#641C2B] border-[#C8A66A]',
    'bg-[#1E3A5F] border-[#60A5FA]',
    'bg-[#1F4E3D] border-[#34D399]',
    'bg-[#5C3D1E] border-[#FBBF24]',
  ];

  return (
    <div className="min-h-screen bg-[#0B0B0D] text-[#F4F0E8] flex flex-col justify-between p-4 select-none">
      {/* Top Controller Status Bar */}
      <header className="flex items-center justify-between p-3.5 rounded-xl bg-[#141418] border border-[#202024]">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold text-[#F4F0E8]">{player.nickname}</span>
        </div>
        <div className="font-mono-code text-sm font-bold text-[#C8A66A]">
          {player.score} pikë
        </div>
      </header>

      {/* Main One-Handed Touch Area */}
      <main className="flex-1 flex flex-col justify-center py-6">
        {room.status === 'lobby' && (
          <div className="p-8 rounded-2xl bg-[#141418] border border-[#C8A66A]/35 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <h2 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">
              Je lidhur në Dhomën {room.roomCode}!
            </h2>
            <p className="text-xs text-[#F4F0E8]/70">
              Shiko ekranin kryesor (TV) — po pritet që drejtuesi të shtypë &ldquo;Fillo Lojën&rdquo;.
            </p>
          </div>
        )}

        {room.status === 'question' && room.currentQuestionPublic && (
          <div className="space-y-4">
            <p className="text-center text-xs font-mono-code text-[#C8A66A]">
              PYETJA {room.currentQuestionIndex + 1}
            </p>

            {alreadyAnswered ? (
              <div className="p-8 rounded-2xl bg-[#141418] border border-[#C8A66A] text-center space-y-3">
                <CheckCircle2 className="w-10 h-10 text-[#C8A66A] mx-auto" />
                <h2 className="text-lg font-serif-heritage font-bold">
                  Përgjigjja u dërgua!
                </h2>
                <p className="text-xs text-[#F4F0E8]/65">
                  Shiko ekranin e TV për rezultatin e raundit.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5">
                {room.currentQuestionPublic.choices.map((choiceText, idx) => {
                  const letter = ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSendControllerAnswer(idx)}
                      className={`min-h-[72px] p-4 rounded-2xl border-2 flex items-center gap-4 text-left active:scale-[0.98] transition-transform cursor-pointer ${
                        controllerColors[idx % controllerColors.length]
                      }`}
                    >
                      <span className="w-11 h-11 rounded-xl bg-black/40 flex items-center justify-center font-mono-code text-lg font-bold text-[#F4F0E8] shrink-0">
                        {letter}
                      </span>
                      <span className="text-base font-semibold text-[#F4F0E8]">
                        {choiceText}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {room.status === 'reveal' && (
          <div className="p-8 rounded-2xl bg-[#141418] border border-[#202024] text-center space-y-3">
            {player.lastAnswerCorrect ? (
              <>
                <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                <h2 className="text-xl font-serif-heritage font-bold text-emerald-300">
                  Saktë! +{player.lastPointsEarned || 0} Pikë
                </h2>
              </>
            ) : (
              <>
                <XCircle className="w-12 h-12 text-amber-400 mx-auto" />
                <h2 className="text-xl font-serif-heritage font-bold text-amber-300">
                  Raundi Përfundoi
                </h2>
              </>
            )}
            <p className="text-xs text-[#F4F0E8]/65">Prit pyetjen tjetër në TV...</p>
          </div>
        )}

        {room.status === 'finished' && (
          <div className="p-8 rounded-2xl bg-[#141418] border border-[#C8A66A] text-center space-y-3">
            <Trophy className="w-12 h-12 text-[#C8A66A] mx-auto" />
            <h2 className="text-xl font-serif-heritage font-bold">Loja Përfundoi!</h2>
            <p className="font-mono-code text-lg text-[#C8A66A] font-bold">
              Rezultati yt: {player.score} pikë
            </p>
          </div>
        )}
      </main>

      <footer className="text-center text-[11px] font-mono-code text-[#F4F0E8]/45">
        DHOMA: {room.roomCode} · {room.gameTitle}
      </footer>
    </div>
  );
};
