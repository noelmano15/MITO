import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Award,
  Clock,
  Crown,
  Headphones,
} from 'lucide-react';
import { apiFetch } from '../utils/sessionToken';
import type { LeaderboardEntry, AchievementDefinition, UserAccount } from '../types/mito';

// =========================================================
// 1. GLOBAL LEADERBOARD VIEW (/leaderboard)
// =========================================================

export const LeaderboardView: React.FC = () => {
  const [scope, setScope] = useState<'global' | 'weekly' | 'monthly' | 'country' | 'school'>('global');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [schoolEnabled, setSchoolEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch(`/api/leaderboard?scope=${scope}`)
      .then((res) => res.json())
      .then((data) => {
        setEntries(data.entries || []);
        setSchoolEnabled(Boolean(data.schoolRankingsEnabled));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [scope]);

  const topThree = entries.slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 sm:py-10 space-y-8 safe-main-content">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.07] pb-6 mito-reveal">
        <div>
          <p className="text-[11px] font-mono-code uppercase tracking-[0.22em] text-[#C8A66A]">
            KLASIFIKIMI ZYRTAR
          </p>
          <h1 className="text-2xl sm:text-4xl font-serif-heritage font-bold text-[#F4F0E8] mt-1">
            Renditja Globale MITO
          </h1>
          <p className="text-sm text-[#F4F0E8]/65 mt-1">
            Rezultate të verifikuara nga serveri për sfidat kulturore dhe kuizet.
          </p>
        </div>

        {/* Scope Selector Tabs */}
        <div className="flex items-center gap-1.5 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.08] overflow-x-auto max-w-full">
          {[
            { id: 'global', label: 'Globale' },
            { id: 'weekly', label: 'Javore' },
            { id: 'monthly', label: 'Mujore' },
            { id: 'country', label: 'Shteti' },
            ...(schoolEnabled ? [{ id: 'school', label: 'Shkolla' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScope(tab.id as typeof scope)}
              className={`min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                scope === tab.id
                  ? 'bg-[#641C2B] text-[#F4F0E8] border border-[#C8A66A]/45'
                  : 'text-[#F4F0E8]/65 hover:text-[#F4F0E8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-xs font-mono-code text-[#C8A66A]">
          Po ngarkohet renditja...
        </div>
      ) : entries.length === 0 ? (
        <div className="p-12 rounded-3xl mito-surface-card text-center max-w-xl mx-auto space-y-3 mito-reveal">
          <Trophy className="w-10 h-10 text-[#C8A66A] mx-auto" />
          <h2 className="text-xl font-serif-heritage font-bold text-[#F4F0E8]">
            Renditja është ende e zbrazët
          </h2>
          <p className="text-xs text-[#F4F0E8]/65 leading-relaxed">
            Renditja popullohet automatikisht kur përdoruesit përfundojnë kuizet dhe sfidat.
          </p>
        </div>
      ) : (
        <>
          {/* Staggered Festival Podium for Top 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end mito-reveal-delay-1">
            {topThree.map((entry, idx) => {
              const orderClass =
                topThree.length >= 2
                  ? idx === 0
                    ? 'md:order-2 md:pb-8'
                    : idx === 1
                    ? 'md:order-1'
                    : 'md:order-3'
                  : '';

              return (
                <div
                  key={entry.entryId}
                  className={`p-6 rounded-3xl text-center space-y-2.5 mito-card-hover ${orderClass} ${
                    idx === 0 ? 'mito-surface-gold' : 'mito-surface-card'
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto font-mono-code font-bold ${
                      idx === 0
                        ? 'bg-[#641C2B] border-2 border-[#C8A66A] text-[#E4C88E] shadow-[0_0_24px_rgba(200,166,106,0.3)]'
                        : 'bg-white/[0.06] border border-white/[0.15] text-[#C8A66A]'
                    }`}
                  >
                    #{idx + 1}
                  </div>
                  <h3 className="text-lg font-serif-heritage font-bold text-[#F4F0E8] truncate">
                    {entry.displayName}
                  </h3>
                  <p className="text-xs font-mono-code text-[#F4F0E8]/55">{entry.maskedCode}</p>
                  <div className="pt-2 font-mono-code text-xl font-bold text-[#C8A66A]">
                    {entry.totalPoints} Pikë · {entry.totalXp} XP
                  </div>
                  <p className="text-xs text-[#F4F0E8]/60">
                    Saktësia: {entry.accuracyPercent}% · Seria: {entry.currentStreak}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Full Ranking Table (Horizontally scrollable on narrow phones) */}
          <div className="rounded-3xl mito-surface-card overflow-x-auto mito-reveal-delay-2">
            <table className="w-full min-w-[600px] text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-[11px] font-mono-code text-[#C8A66A] uppercase tracking-wider">
                  <th className="py-4 px-5">Pozicioni</th>
                  <th className="py-4 px-5">Lojtari</th>
                  <th className="py-4 px-5">Kodi (I Maskuar)</th>
                  <th className="py-4 px-5 text-right">Lojëra</th>
                  <th className="py-4 px-5 text-right">Saktësia</th>
                  <th className="py-4 px-5 text-right">XP</th>
                  <th className="py-4 px-5 text-right">Pikë</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-sm">
                {entries.map((entry, idx) => (
                  <tr key={entry.entryId} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3.5 px-5 font-mono-code font-bold text-[#C8A66A]">
                      #{idx + 1}
                    </td>
                    <td className="py-3.5 px-5 font-medium text-[#F4F0E8]">{entry.displayName}</td>
                    <td className="py-3.5 px-5 font-mono-code text-xs text-[#F4F0E8]/65">
                      {entry.maskedCode}
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono-code">{entry.gamesPlayed}</td>
                    <td className="py-3.5 px-5 text-right font-mono-code">
                      {entry.accuracyPercent}%
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono-code text-[#C8A66A]">
                      {entry.totalXp} XP
                    </td>
                    <td className="py-3.5 px-5 text-right font-mono-code font-bold text-[#F4F0E8]">
                      {entry.totalPoints}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

// =========================================================
// 2. USER PROFILE & ACHIEVEMENTS VIEW (/profile)
// =========================================================

interface UserProfileViewProps {
  user: UserAccount & {
    accessEvaluation?: {
      remainingMinutes?: number | null;
      lowTimeWarningSq?: string | null;
    };
  };
  onProfileUpdated: (updated: UserAccount) => void;
  onNavigate?: (path: string) => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  user,
  onProfileUpdated,
  onNavigate,
}) => {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [country, setCountry] = useState(user.stats.country || 'Shqipëri');
  const [school, setSchool] = useState(user.stats.school || '');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [allAchievements, setAllAchievements] = useState<AchievementDefinition[]>([]);

  useEffect(() => {
    apiFetch('/api/leaderboard')
      .then((res) => res.json())
      .then((data) => {
        if (data.achievements) setAllAchievements(data.achievements);
      })
      .catch(() => {});
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiFetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, country, school }),
      });
      const data = await res.json();
      if (res.ok && data.user) {
        onProfileUpdated(data.user);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 py-8 sm:py-10 space-y-8 safe-main-content">
      {/* Executive Member Dossier Header */}
      <div className="p-6 sm:p-8 rounded-3xl mito-surface-gold flex flex-wrap items-center justify-between gap-6 mito-reveal">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-[#641C2B] border border-[#C8A66A] flex items-center justify-center text-[#C8A66A] shrink-0 shadow-lg">
            <Crown className="w-8 h-8" />
          </div>
          <div>
            <p className="text-[11px] font-mono-code uppercase tracking-wider text-[#C8A66A] flex flex-wrap items-center gap-2">
              <span>STATUSI: {user.status}</span>
              <span aria-hidden="true">·</span>
              <span>KODI: {user.maskedCode}</span>
            </p>
            <h1 className="text-2xl sm:text-3xl font-serif-heritage font-bold text-[#F4F0E8] mt-1">
              {user.displayName}
            </h1>
            {user.accessEvaluation?.remainingMinutes !== null &&
              user.accessEvaluation?.remainingMinutes !== undefined && (
                <p className="text-xs text-[#C8A66A] font-mono-code mt-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Koha e mbetur e aksesit: {user.accessEvaluation.remainingMinutes} minuta</span>
                </p>
              )}
            {onNavigate && (
              <div className="mt-3.5">
                <button
                  type="button"
                  onClick={() => onNavigate('/support')}
                  className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] border border-[#C8A66A]/45 text-xs font-semibold text-[#F4F0E8] mito-cta-primary cursor-pointer"
                >
                  <Headphones className="w-4 h-4 text-[#C8A66A]" />
                  <span>Kontakto Supportin (Live Chat)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full lg:w-auto">
          <div className="p-3.5 rounded-2xl bg-[#09090C]/85 border border-white/[0.08] text-center">
            <div className="text-[11px] text-[#F4F0E8]/55">XP TOTALE</div>
            <div className="text-lg font-mono-code font-bold text-[#C8A66A] mt-0.5">
              {user.stats.totalXp}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#09090C]/85 border border-white/[0.08] text-center">
            <div className="text-[11px] text-[#F4F0E8]/55">PIKË</div>
            <div className="text-lg font-mono-code font-bold text-[#F4F0E8] mt-0.5">
              {user.stats.totalPoints}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#09090C]/85 border border-white/[0.08] text-center">
            <div className="text-[11px] text-[#F4F0E8]/55">LOJËRA / FITORE</div>
            <div className="text-lg font-mono-code font-bold text-[#F4F0E8] mt-0.5">
              {user.stats.gamesPlayed} / {user.stats.gamesWon}
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-[#09090C]/85 border border-white/[0.08] text-center">
            <div className="text-[11px] text-[#F4F0E8]/55">POZICIONI</div>
            <div className="text-lg font-mono-code font-bold text-[#C8A66A] mt-0.5">
              #{user.stats.rank || 1}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mito-reveal-delay-1">
        {/* Profile Edit Form */}
        <form
          onSubmit={handleSaveProfile}
          className="p-6 rounded-3xl mito-surface-card space-y-4 h-fit"
        >
          <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
            Të Dhënat e Profilit
          </h2>

          <div>
            <label htmlFor="prof-name" className="block text-xs text-[#C8A66A] mb-1.5">
              Emri i Shfaqur
            </label>
            <input
              id="prof-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090C] border border-white/[0.1] focus:border-[#C8A66A] focus:outline-none text-sm text-[#F4F0E8]"
            />
          </div>

          <div>
            <label htmlFor="prof-country" className="block text-xs text-[#C8A66A] mb-1.5">
              Shteti / Krahina
            </label>
            <input
              id="prof-country"
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090C] border border-white/[0.1] focus:border-[#C8A66A] focus:outline-none text-sm text-[#F4F0E8]"
            />
          </div>

          <div>
            <label htmlFor="prof-school" className="block text-xs text-[#C8A66A] mb-1.5">
              Shkolla / Institucioni (Opsionale)
            </label>
            <input
              id="prof-school"
              type="text"
              value={school}
              onChange={(e) => setSchool(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090C] border border-white/[0.1] focus:border-[#C8A66A] focus:outline-none text-sm text-[#F4F0E8]"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] text-xs font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 mito-cta-primary cursor-pointer"
          >
            {saving ? 'Po ruhet...' : savedMsg ? 'U ruajt me sukses!' : 'Ruaj Profilin'}
          </button>
        </form>

        {/* Achievements & Recent Activity */}
        <div className="lg:col-span-2 space-y-6">
          <section className="p-6 rounded-3xl mito-surface-card space-y-4">
            <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
              <Award className="w-5 h-5 text-[#C8A66A]" />
              <span>Arritjet Kulturore</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {allAchievements.map((ach) => {
                const unlocked = user.achievements.includes(ach.achievementId);
                return (
                  <div
                    key={ach.achievementId}
                    className={`p-4 rounded-2xl border flex items-start justify-between gap-3 transition-colors ${
                      unlocked
                        ? 'bg-[#09090C]/90 border-[#C8A66A]/65 shadow-[0_0_24px_-12px_rgba(200,166,106,0.35)]'
                        : 'bg-[#09090C]/45 border-white/[0.06] opacity-60'
                    }`}
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-[#F4F0E8]">{ach.title}</h3>
                      <p className="text-xs text-[#F4F0E8]/65 mt-0.5 leading-relaxed">
                        {ach.description}
                      </p>
                    </div>
                    <span className="font-mono-code text-xs text-[#C8A66A] shrink-0">
                      +{ach.xpBonus} XP
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="p-6 rounded-3xl mito-surface-card space-y-4">
            <h2 className="text-lg font-serif-heritage font-bold text-[#F4F0E8]">
              Aktiviteti i Fundit
            </h2>
            {user.recentActivity.length === 0 ? (
              <p className="text-xs text-[#F4F0E8]/55">Ende nuk ka aktivitet të regjistruar.</p>
            ) : (
              <div className="space-y-2.5">
                {user.recentActivity.slice(0, 8).map((act) => (
                  <div
                    key={act.id}
                    className="p-3.5 rounded-2xl bg-[#09090C]/80 border border-white/[0.07] flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-[#F4F0E8] font-medium">{act.title}</span>
                    <span className="font-mono-code text-[#C8A66A] shrink-0">
                      {act.detail || new Date(act.timestamp).toLocaleTimeString('sq-AL')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
