import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Trophy,
  Users,
  Globe,
  Lock,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Play,
  Plus,
  Sparkles,
} from 'lucide-react';
import { apiFetch } from '../utils/sessionToken';
import type { GameItem, GameQuestionPublic, UserAccount, VideoContent } from '../types/mito';

const GAME_TYPE_LABELS: Record<string, string> = {
  quiz_battle: 'Quiz Battle',
  true_false: 'E Vërtetë apo e Gabuar',
  guess_legend: 'Gjej Legjendën',
  image_recognition: 'Sfidë Vëzhgimi me Imazh',
  memory_match: 'Memory Match',
  speed_round: 'Sfidë e Shpejtësisë',
  multiple_choice: 'Zgjedhje e Shumëfishtë',
  chronological_order: 'Rend Kronologjik',
  cultural_knowledge: 'Sfidë e Njohurive Kulturore',
};

interface GameCenterViewProps {
  games: Array<
    GameItem & {
      unlockStatus?: {
        unlocked: boolean;
        requiredPercent: number;
        currentPercent: number;
        remainingPercent?: number;
      };
    }
  >;
  selectedGameId?: string | null;
  user: UserAccount;
  onNavigate: (path: string) => void;
  onRefreshSession: () => void;
}

export const GameCenterView: React.FC<GameCenterViewProps> = ({
  games,
  selectedGameId,
  user,
  onNavigate,
  onRefreshSession,
}) => {
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [activeGame, setActiveGame] = useState<GameItem | null>(null);
  const [linkedContent, setLinkedContent] = useState<VideoContent | null>(null);
  const [unlockStatus, setUnlockStatus] = useState<{
    unlocked: boolean;
    requiredPercent: number;
    currentPercent: number;
    remainingPercent: number;
  } | null>(null);

  // Solo game session state
  const [sessionState, setSessionState] = useState<'menu' | 'playing' | 'gameover'>('menu');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<GameQuestionPublic[]>([]);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<{
    isCorrect: boolean;
    correctChoiceIndex: number;
    explanation: string;
    pointsEarned: number;
  } | null>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [xpEarned, setXpEarned] = useState(0);
  const [errorSq, setErrorSq] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Load selected game details when selectedGameId is provided
  useEffect(() => {
    if (!selectedGameId) {
      setActiveGame(null);
      setSessionState('menu');
      setErrorSq(null);
      return;
    }

    apiFetch(`/api/games/${selectedGameId}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setErrorSq(data.error || 'Loja nuk u gjet.');
          return;
        }
        setActiveGame(data.game);
        setLinkedContent(data.linkedContent || null);
        setUnlockStatus(data.unlockStatus || null);
        setSessionState('menu');
      })
      .catch(() => setErrorSq('Gabim gjatë ngarkimit të lojës.'));
  }, [selectedGameId]);

  // Countdown timer during active question
  useEffect(() => {
    if (sessionState !== 'playing' || answerFeedback) return;
    const interval = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          handleAnswerSubmit(-1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [sessionState, currentQIdx, answerFeedback]);

  const handleStartSolo = async (isGlobalChallenge = false) => {
    if (!activeGame) return;
    setErrorSq(null);
    try {
      const res = await apiFetch(`/api/games/${activeGame.gameId}/start-solo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isGlobalChallenge }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorSq(data.error || 'Kjo lojë nuk është e përfshirë në aksesin tënd.');
        return;
      }

      setSessionId(data.sessionId);
      setQuestions(data.questions || []);
      setCurrentQIdx(0);
      setTimeLeft(data.questions?.[0]?.timeLimitSeconds || activeGame.timePerQuestionSeconds || 20);
      setSelectedChoice(null);
      setAnswerFeedback(null);
      setTotalScore(0);
      setCorrectCount(0);
      setStreak(0);
      setXpEarned(0);
      setSessionState('playing');
      document.body.dataset.state = 'playing';
    } catch {
      setErrorSq('Gabim gjatë nisjes së lojës.');
    }
  };

  const handleAnswerSubmit = async (choiceIdx: number) => {
    if (!sessionId || answerFeedback) return;
    setSelectedChoice(choiceIdx);

    try {
      const res = await apiFetch(`/api/games/sessions/${sessionId}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionIndex: currentQIdx,
          choiceIndex: choiceIdx,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorSq(data.error || 'Gabim gjatë validimit të përgjigjes.');
        return;
      }

      setAnswerFeedback({
        isCorrect: data.isCorrect,
        correctChoiceIndex: data.correctChoiceIndex,
        explanation: data.explanation,
        pointsEarned: data.pointsEarned,
      });
      setTotalScore(data.totalScore);
      setCorrectCount(data.correctCount);
      setStreak(data.streak);
      if (data.completed) {
        setXpEarned(data.xpEarned || 0);
        onRefreshSession();
      }
    } catch {
      setErrorSq('Gabim rrjeti gjatë dërgimit të përgjigjes.');
    }
  };

  const handleNextQuestion = () => {
    const nextIdx = currentQIdx + 1;
    if (nextIdx >= questions.length) {
      setSessionState('gameover');
      document.body.dataset.state = 'gameover';
      return;
    }
    setCurrentQIdx(nextIdx);
    setSelectedChoice(null);
    setAnswerFeedback(null);
    setTimeLeft(questions[nextIdx]?.timeLimitSeconds || activeGame?.timePerQuestionSeconds || 20);
  };

  const handleCreateMultiplayerRoom = async () => {
    if (!activeGame) return;
    setCreatingRoom(true);
    setErrorSq(null);
    try {
      const res = await apiFetch('/api/multiplayer/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: activeGame.gameId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorSq(data.error || 'Kjo lojë nuk është e përfshirë në aksesin tënd.');
        setCreatingRoom(false);
        return;
      }
      onNavigate(`/play/${data.room.roomCode}/host`);
    } catch {
      setErrorSq('Gabim gjatë krijimit të dhomës multiplayer.');
      setCreatingRoom(false);
    }
  };

  // Individual Game View (/games/:gameId)
  if (selectedGameId && activeGame) {
    const currentQuestion = questions[currentQIdx];
    const isUnlocked = unlockStatus ? unlockStatus.unlocked : true;

    return (
      <div className="max-w-4xl mx-auto px-4 lg:px-8 py-8 space-y-6">
        <button
          type="button"
          onClick={() => onNavigate('/games')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#C8A66A] hover:underline cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kthehu në Qendrën e Lojërave</span>
        </button>

        {/* STATE 1: GAME TITLE & MODE MENU */}
        {sessionState === 'menu' && (
          <div className="p-8 rounded-2xl bg-[#141418] border border-[#C8A66A]/35 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2 max-w-2xl">
                <div className="text-xs text-[#C8A66A] flex items-center gap-2">
                  <span>{GAME_TYPE_LABELS[activeGame.gameType] || activeGame.gameType}</span>
                  <span aria-hidden="true">·</span>
                  <span>Vështirësia: {activeGame.difficulty}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-code">{activeGame.questionCount} pyetje</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-code">+{activeGame.xpReward} XP</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-serif-heritage font-bold text-[#F4F0E8]">
                  {activeGame.title}
                </h1>
                <p className="text-sm text-[#F4F0E8]/75 leading-relaxed">
                  {activeGame.description}
                </p>
                <p className="text-xs text-[#F4F0E8]/55">
                  Udhëzime: {activeGame.instructions}
                </p>
              </div>
            </div>

            {/* Watch-to-Unlock Requirement Banner */}
            {activeGame.requireWatchToUnlock && linkedContent && (
              <div
                className={`p-4 rounded-xl border flex flex-wrap items-center justify-between gap-4 ${
                  isUnlocked
                    ? 'bg-emerald-950/30 border-emerald-500/40'
                    : 'bg-[#641C2B]/25 border-[#C8A66A]/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {isUnlocked ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <Lock className="w-5 h-5 text-[#C8A66A] shrink-0" />
                  )}
                  <div className="text-xs">
                    <p className="font-semibold text-[#F4F0E8]">
                      {isUnlocked
                        ? `Watch-to-Unlock: E Zhbllokuar (${unlockStatus?.currentPercent}% shikuar)`
                        : `Kërkohet të shikoni "${linkedContent.title}" (${unlockStatus?.requiredPercent}%) para se të luani`}
                    </p>
                    {!isUnlocked && (
                      <p className="text-[#F4F0E8]/70 mt-0.5">
                        Progresi aktual i verifikuar: {unlockStatus?.currentPercent || 0}% (Mbeten edhe {unlockStatus?.remainingPercent || 80}%).
                      </p>
                    )}
                  </div>
                </div>

                {!isUnlocked && (
                  <button
                    type="button"
                    onClick={() => onNavigate(`/watch/${linkedContent.contentId}`)}
                    className="px-4 py-2 rounded-lg bg-[#C8A66A] text-[#0B0B0D] text-xs font-semibold cursor-pointer"
                  >
                    Shiko Videon Tani →
                  </button>
                )}
              </div>
            )}

            {errorSq && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-[#641C2B]/30 border border-[#641C2B] text-xs text-[#F4F0E8]"
              >
                {errorSq}
              </div>
            )}

            {/* Game Modes: Solo, Local Multiplayer (Phone as Controller), Global Challenge */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <button
                type="button"
                data-start="true"
                disabled={!isUnlocked}
                onClick={() => handleStartSolo(false)}
                className="p-5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] disabled:opacity-40 border border-[#C8A66A]/45 text-left space-y-2 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <Play className="w-5 h-5 text-[#C8A66A] fill-current" />
                  <span className="text-[11px] font-mono-code text-[#C8A66A]">SOLO MODE</span>
                </div>
                <h2 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                  Luaj Vetëm
                </h2>
                <p className="text-xs text-[#F4F0E8]/75">
                  Konkuro në pajisjen tënde aktuale dhe fito pikë e XP.
                </p>
              </button>

              <button
                type="button"
                disabled={!isUnlocked || creatingRoom}
                onClick={handleCreateMultiplayerRoom}
                className="p-5 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] disabled:opacity-40 border border-[#C8A66A]/40 text-left space-y-2 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <Users className="w-5 h-5 text-[#C8A66A]" />
                  <span className="text-[11px] font-mono-code text-[#C8A66A]">PARTY MODE</span>
                </div>
                <h2 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                  Luaj me Miqtë (TV + Telefon)
                </h2>
                <p className="text-xs text-[#F4F0E8]/70">
                  Krijo dhomë me kod QR; miqtë përgjigjen nga telefonat si kontrollerë.
                </p>
              </button>

              <button
                type="button"
                disabled={!isUnlocked}
                onClick={() => handleStartSolo(true)}
                className="p-5 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] disabled:opacity-40 border border-[#202024] hover:border-[#C8A66A]/40 text-left space-y-2 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <Globe className="w-5 h-5 text-[#C8A66A]" />
                  <span className="text-[11px] font-mono-code text-[#C8A66A]">GLOBAL</span>
                </div>
                <h2 className="text-base font-serif-heritage font-bold text-[#F4F0E8]">
                  Sfidë Globale
                </h2>
                <p className="text-xs text-[#F4F0E8]/70">
                  Ngjitu në renditjen ndërkombëtare me kodin tënd MITO.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* STATE 2: ACTIVE QUESTION PLAY */}
        {sessionState === 'playing' && currentQuestion && (
          <div className="p-6 lg:p-8 rounded-2xl bg-[#141418] border border-[#C8A66A]/40 space-y-6">
            {/* HUD Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#202024]">
              <div className="text-xs font-mono-code text-[#C8A66A]">
                PYETJA {currentQIdx + 1} / {questions.length}
              </div>

              <div className="flex items-center gap-5 font-mono-code text-xs">
                <div>
                  <span className="text-[#F4F0E8]/55">PIKË: </span>
                  <span className="text-base font-bold text-[#F4F0E8]">{totalScore}</span>
                </div>
                <div>
                  <span className="text-[#F4F0E8]/55">SERIA: </span>
                  <span className="text-base font-bold text-[#C8A66A]">{streak}x</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#641C2B]/40 border border-[#C8A66A]/40 text-[#F4F0E8]">
                  <Clock className="w-3.5 h-3.5 text-[#C8A66A]" />
                  <span className="font-bold">{timeLeft}s</span>
                </div>
              </div>
            </div>

            {/* Question Text */}
            <h2 className="text-xl sm:text-2xl font-serif-heritage font-bold text-[#F4F0E8]">
              {currentQuestion.questionText}
            </h2>

            {/* Answer Choices */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {currentQuestion.choices.map((choiceText, idx) => {
                const letter = ['A', 'B', 'C', 'D'][idx] || String(idx + 1);
                let btnStyle = 'bg-[#0B0B0D] hover:bg-[#202024] border-[#202024] text-[#F4F0E8]';
                if (answerFeedback) {
                  if (idx === answerFeedback.correctChoiceIndex) {
                    btnStyle = 'bg-emerald-950/60 border-emerald-500 text-emerald-200';
                  } else if (idx === selectedChoice && !answerFeedback.isCorrect) {
                    btnStyle = 'bg-red-950/60 border-red-500 text-red-200';
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={Boolean(answerFeedback)}
                    onClick={() => handleAnswerSubmit(idx)}
                    className={`p-4 rounded-xl border text-left flex items-center gap-3.5 transition-all cursor-pointer ${btnStyle}`}
                  >
                    <span className="w-8 h-8 rounded-lg bg-[#202024] border border-[#C8A66A]/35 flex items-center justify-center font-mono-code text-xs font-bold text-[#C8A66A] shrink-0">
                      {letter}
                    </span>
                    <span className="text-sm font-medium">{choiceText}</span>
                  </button>
                );
              })}
            </div>

            {/* Server-Validated Feedback & Next Button */}
            {answerFeedback && (
              <div className="p-4 rounded-xl bg-[#0B0B0D] border border-[#C8A66A]/35 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <p
                    className={`text-sm font-bold ${
                      answerFeedback.isCorrect ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {answerFeedback.isCorrect
                      ? `Saktë! +${answerFeedback.pointsEarned} Pikë`
                      : 'Përgjigje e pasaktë'}
                  </p>
                  {answerFeedback.explanation && (
                    <p className="text-xs text-[#F4F0E8]/75">{answerFeedback.explanation}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleNextQuestion}
                  className="px-5 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
                >
                  {currentQIdx + 1 >= questions.length ? 'Shiko Rezultatin Final' : 'Pyetja Tjetër →'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* STATE 3: VICTORY / GAME OVER SUMMARY MODAL */}
        {sessionState === 'gameover' && (
          <div className="p-8 rounded-2xl bg-[#141418] border border-[#C8A66A] text-center space-y-6 max-w-xl mx-auto">
            <Trophy className="w-12 h-12 text-[#C8A66A] mx-auto" />
            <div>
              <h2 className="text-2xl font-serif-heritage font-bold text-[#F4F0E8]">
                Sfida Përfundoi!
              </h2>
              <p className="text-xs text-[#F4F0E8]/65 mt-1">{activeGame.title}</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                <div className="text-[11px] text-[#F4F0E8]/55">PIKË TOTALE</div>
                <div className="text-xl font-mono-code font-bold text-[#C8A66A] mt-1">
                  {totalScore}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                <div className="text-[11px] text-[#F4F0E8]/55">SAKTËSIA</div>
                <div className="text-xl font-mono-code font-bold text-[#F4F0E8] mt-1">
                  {correctCount}/{questions.length}
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-[#0B0B0D] border border-[#202024]">
                <div className="text-[11px] text-[#F4F0E8]/55">XP FITUAR</div>
                <div className="text-xl font-mono-code font-bold text-emerald-400 mt-1">
                  +{xpEarned} XP
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                data-start="true"
                onClick={() => handleStartSolo(false)}
                className="px-6 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
              >
                Luaj Përsëri
              </button>
              <button
                type="button"
                onClick={() => onNavigate('/leaderboard')}
                className="px-5 py-2.5 rounded-xl bg-[#0B0B0D] hover:bg-[#202024] text-xs font-semibold text-[#C8A66A] border border-[#202024] cursor-pointer"
              >
                Shiko Renditjen Globale
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main Game Center View (/games)
  const filteredGames =
    selectedTypeFilter === 'all'
      ? games
      : games.filter((g) => g.gameType === selectedTypeFilter);

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-8 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif-heritage font-bold text-[#F4F0E8]">
            Qendra e Lojërave MITO
          </h1>
          <p className="text-sm text-[#F4F0E8]/65 mt-1">
            Kuize interaktive, sfida të trashëgimisë dhe gara lokale me telefon si kontroller.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/join')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#141418] hover:bg-[#202024] text-xs font-semibold text-[#C8A66A] border border-[#C8A66A]/35 cursor-pointer"
          >
            <Users className="w-4 h-4" />
            <span>Bashkohu me Kod Dhome</span>
          </button>

          {user.role === 'super_admin' && (
            <button
              type="button"
              onClick={() => onNavigate('/admin/games')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#C8A66A]" />
              <span>Krijo Lojë në Admin</span>
            </button>
          )}
        </div>
      </div>

      {/* Game Type Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => setSelectedTypeFilter('all')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
            selectedTypeFilter === 'all'
              ? 'bg-[#641C2B] text-[#F4F0E8] border border-[#C8A66A]/40'
              : 'bg-[#141418] text-[#F4F0E8]/70 hover:text-[#F4F0E8]'
          }`}
        >
          Të gjitha lojërat
        </button>
        {Object.entries(GAME_TYPE_LABELS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelectedTypeFilter(key)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
              selectedTypeFilter === key
                ? 'bg-[#641C2B] text-[#F4F0E8] border border-[#C8A66A]/40'
                : 'bg-[#141418] text-[#F4F0E8]/70 hover:text-[#F4F0E8]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredGames.length === 0 ? (
        <div className="p-12 rounded-2xl bg-[#141418] border border-[#202024] text-center max-w-xl mx-auto space-y-4">
          <Gamepad2 className="w-10 h-10 text-[#C8A66A] mx-auto" />
          <h2 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">
            Ende nuk ka lojëra të publikuara
          </h2>
          <p className="text-xs text-[#F4F0E8]/65">
            Qendra e Lojërave popullohet kur Super Administratori krijon kuize dhe lojëra në Panelin e Administrimit.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => {
            const unlocked = game.unlockStatus ? game.unlockStatus.unlocked : true;
            return (
              <div
                key={game.gameId}
                className="p-6 rounded-2xl bg-[#141418] border border-[#202024] hover:border-[#C8A66A]/45 flex flex-col justify-between gap-5 transition-colors"
              >
                <div className="space-y-2.5">
                  <div className="text-xs text-[#C8A66A] flex items-center gap-1.5">
                    <span>{GAME_TYPE_LABELS[game.gameType] || game.gameType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{game.difficulty}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-code">+{game.xpReward} XP</span>
                  </div>
                  <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
                    {game.title}
                  </h2>
                  <p className="text-xs text-[#F4F0E8]/65 line-clamp-2">{game.description}</p>
                </div>

                <div className="pt-3 border-t border-[#202024] flex items-center justify-between">
                  <span className="text-xs flex items-center gap-1.5 text-[#F4F0E8]/75">
                    {unlocked ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Gati për lojë</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3.5 h-3.5 text-[#C8A66A]" />
                        <span>Watch-to-Unlock ({game.unlockStatus?.requiredPercent}%)</span>
                      </>
                    )}
                  </span>

                  <button
                    type="button"
                    onClick={() => onNavigate(`/games/${game.gameId}`)}
                    className="px-4 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/40 cursor-pointer"
                  >
                    Hap Lojën →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
