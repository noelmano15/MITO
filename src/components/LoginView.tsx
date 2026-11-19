import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  X,
  ShieldAlert,
  KeyRound,
  Smartphone,
  ArrowRight,
  Phone,
  Film,
  Gamepad2,
  Sparkles,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { formatAccessCodeInput } from '../utils/accessCode';
import { apiFetch, setPersistedAccessCode, setCachedUser } from '../utils/sessionToken';
import type { UserAccount } from '../types/mito';

interface LoginViewProps {
  superAdminExists: boolean;
  requiresBootstrapSecret: boolean;
  initialErrorSq?: string | null;
  onLoginSuccess: (user: UserAccount, redirectTo: string) => void;
  onNavigate: (path: string) => void;
  onBootstrapCompleted: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  initialErrorSq,
  onLoginSuccess,
  onNavigate,
}) => {
  const [code, setCode] = useState('');
  const [maskInput, setMaskInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorSq, setErrorSq] = useState<string | null>(initialErrorSq || null);

  const digitsCount = code.replace(/\D/g, '').length;

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatAccessCodeInput(e.target.value);
    setCode(formatted);
    if (errorSq) setErrorSq(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent, overrideCode?: string) => {
    e.preventDefault();
    const targetCode = overrideCode ?? code;
    const digitsOnly = targetCode.replace(/\D/g, '');
    if (digitsOnly.length !== 9) {
      setErrorSq('Kodi i aksesit duhet të përmbajë saktësisht 9 shifra (XXX-XXX-XXX).');
      return;
    }

    setLoading(true);
    setErrorSq(null);
    try {
      const formattedCode = `${digitsOnly.slice(0, 3)}-${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 9)}`;
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: formattedCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorSq(data.error || 'Kodi i aksesit nuk është i saktë.');
        setLoading(false);
        return;
      }
      setPersistedAccessCode(formattedCode);
      if (data.user) {
        setCachedUser(data.user);
      }
      onLoginSuccess(data.user, data.redirectTo || '/home');
    } catch {
      setErrorSq('Gabim rrjeti gjatë lidhjes me serverin. Ju lutem provoni përsëri.');
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#09090C] text-[#F4F0E8] flex flex-col justify-between relative overflow-hidden">
      {/* Ambient Animated Royal Crimson & Antique Gold Backlight */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[920px] h-[620px] rounded-full blur-3xl mito-aura-drift"
        style={{
          background:
            'radial-gradient(circle, rgba(100, 28, 43, 0.36) 0%, rgba(200, 166, 106, 0.08) 45%, transparent 72%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(200,166,106,0.9) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />

      {/* Top Navigation Strip */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 max-w-7xl w-full mx-auto">
        <BrandLogo variant="compact" size="sm" />
        <button
          type="button"
          onClick={() => onNavigate('/join')}
          className="min-h-[42px] inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#C8A66A]/30 bg-[#14141A]/85 hover:bg-[#1C1C24] hover:border-[#C8A66A]/55 text-xs font-medium text-[#F4F0E8] transition-all whitespace-nowrap shrink-0 cursor-pointer backdrop-blur-md"
        >
          <Smartphone className="w-4 h-4 text-[#C8A66A]" />
          <span>Bashkohu në Lojë me Kod Dhome</span>
        </button>
      </header>

      {/* Center Editorial Split Layout */}
      <section className="relative z-10 flex-1 flex items-center justify-center px-4 sm:px-8 py-6 sm:py-10">
        <div className="max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-center">
          {/* Left Editorial Heritage Showcase (Desktop & Large Screens) */}
          <div className="hidden lg:flex lg:col-span-6 flex-col space-y-8 pr-4 mito-reveal">
            <div className="space-y-4">
              <p className="text-xs font-mono-code uppercase tracking-[0.26em] text-[#C8A66A]">
                ARKIVA DIGJITALE SHQIPTARE · KINEMA · KUIZE
              </p>
              <h1 className="text-4xl xl:text-5xl font-serif-heritage font-bold text-[#F4F0E8] leading-[1.12]">
                Trashëgimia jonë, e gjallë në çdo ekran.
              </h1>
              <p className="text-base text-[#F4F0E8]/70 leading-relaxed max-w-xl">
                MITO bashkon filmat dhe legjendat kombëtare me videot e shkurtra kulturore dhe sfidat interaktive në kohë reale.
              </p>
            </div>

            <div className="heritage-divider max-w-md" />

            <div className="grid grid-cols-1 gap-5 max-w-lg">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#641C2B]/30 border border-[#C8A66A]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Film className="w-4 h-4 text-[#C8A66A]" />
                </div>
                <div>
                  <h2 className="text-sm font-serif-heritage font-semibold text-[#F4F0E8]">
                    Transmetim Kinematografik & Proveniencë
                  </h2>
                  <p className="text-xs text-[#F4F0E8]/60 mt-1 leading-relaxed">
                    Ndiqni prodhime origjinale si BESA me burime arkivore të dokumentuara.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#641C2B]/30 border border-[#C8A66A]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Sparkles className="w-4 h-4 text-[#C8A66A]" />
                </div>
                <div>
                  <h2 className="text-sm font-serif-heritage font-semibold text-[#F4F0E8]">
                    MITO Shorts 9:16
                  </h2>
                  <p className="text-xs text-[#F4F0E8]/60 mt-1 leading-relaxed">
                    Rrëfime vertikale në ekran të plotë të dizajnuara për gjeneratën mobile.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-[#641C2B]/30 border border-[#C8A66A]/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Gamepad2 className="w-4 h-4 text-[#C8A66A]" />
                </div>
                <div>
                  <h2 className="text-sm font-serif-heritage font-semibold text-[#F4F0E8]">
                    Gara & Kuize me Telefon si Kontroller
                  </h2>
                  <p className="text-xs text-[#F4F0E8]/60 mt-1 leading-relaxed">
                    Fitoni XP, sfidoni miqtë në TV + Telefon dhe ngjituni në Renditjen Kombëtare.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Access Vault Card */}
          <div className="lg:col-span-6 w-full max-w-md mx-auto mito-reveal-delay-1">
            <div className="mito-surface-gold rounded-3xl p-7 sm:p-9 relative overflow-hidden">
              {/* Subtle top specular accent line */}
              <div
                className="pointer-events-none absolute top-0 inset-x-10 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(228,200,142,0.75) 50%, transparent 100%)',
                }}
              />

              <div className="flex flex-col items-center text-center mb-6">
                <BrandLogo variant="full" size="xl" className="mito-float-subtle" />
                <h2 className="mt-4 text-2xl sm:text-[26px] font-serif-heritage font-bold text-[#F4F0E8]">
                  Hyr me kodin tënd
                </h2>
                <p className="mt-1.5 text-xs sm:text-sm text-[#F4F0E8]/65">
                  Shiko · Mëso · Luaj · Konkuro në trashëgiminë shqiptare.
                </p>
              </div>

              <form onSubmit={(e) => handleLoginSubmit(e)} className="space-y-5">
                <div>
                  <label
                    htmlFor="access-code-input"
                    className="block text-[11px] font-mono-code uppercase tracking-[0.2em] text-[#C8A66A] mb-2.5 text-center"
                  >
                    Kodi Numerik i Aksesit (XXX-XXX-XXX)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="access-code-input"
                      type={maskInput ? 'password' : 'text'}
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="123-456-789"
                      value={code}
                      onChange={handleCodeChange}
                      onPaste={(e) => {
                        const pasted = e.clipboardData?.getData('text') || '';
                        if (pasted) {
                          e.preventDefault();
                          setCode(formatAccessCodeInput(pasted));
                          if (errorSq) setErrorSq(null);
                        }
                      }}
                      aria-label="Kodi numerik i aksesit"
                      className="w-full bg-[#09090C]/90 border border-[#C8A66A]/35 focus:border-[#C8A66A] focus:ring-2 focus:ring-[#C8A66A]/20 rounded-2xl py-4 px-12 text-center font-mono-code text-2xl tracking-[0.18em] text-[#F4F0E8] placeholder-[#F4F0E8]/20 focus:outline-none transition-all shadow-inner"
                    />
                    <div className="absolute right-3 flex items-center gap-1">
                      {code.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCode('')}
                          aria-label="Pastro kodin"
                          className="p-1.5 text-[#F4F0E8]/50 hover:text-[#F4F0E8] rounded-lg transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setMaskInput(!maskInput)}
                        aria-label={maskInput ? 'Shfaq kodin' : 'Fshih kodin'}
                        className="p-1.5 text-[#F4F0E8]/50 hover:text-[#C8A66A] rounded-lg transition-colors cursor-pointer"
                      >
                        {maskInput ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Tactile 9-digit completion indicator */}
                  <div className="mt-2.5 flex items-center justify-center gap-1.5" aria-hidden="true">
                    {Array.from({ length: 9 }).map((_, idx) => (
                      <React.Fragment key={idx}>
                        <span
                          className={`h-1 rounded-full transition-all duration-200 ${
                            idx < digitsCount
                              ? 'w-4 bg-[#C8A66A] shadow-[0_0_8px_rgba(200,166,106,0.6)]'
                              : 'w-2.5 bg-white/10'
                          }`}
                        />
                        {(idx === 2 || idx === 5) && <span className="w-1" />}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {errorSq && (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#641C2B]/35 border border-[#8B243B] text-xs text-[#F4F0E8] mito-fade-in"
                  >
                    <ShieldAlert className="w-4 h-4 text-[#C8A66A] shrink-0 mt-0.5" />
                    <span>{errorSq}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[50px] py-3.5 px-6 rounded-2xl bg-[#641C2B] hover:bg-[#7D2336] disabled:opacity-50 text-[#F4F0E8] font-semibold text-base border border-[#C8A66A]/45 mito-cta-primary flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{loading ? 'Po verifikohet kodi...' : 'Hyr në Platformë'}</span>
                  {!loading && <ArrowRight className="w-4 h-4 text-[#C8A66A]" />}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-white/[0.08] text-center space-y-3">
                <p className="text-xs text-[#F4F0E8]/60 flex items-center justify-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#C8A66A] shrink-0" />
                  <span>Vendosni kodin tuaj personal 9-shifror për të hyrë.</span>
                </p>
                <p className="text-xs text-[#F4F0E8]/75 leading-relaxed">
                  Nëse nuk keni një llogari, ju lutemi kontaktoni Super Adminin në numrin e telefonit:{' '}
                  <a
                    href="tel:+3550677139666"
                    className="inline-flex items-center gap-1 font-mono-code font-semibold text-[#C8A66A] hover:text-[#E4C88E] hover:underline"
                  >
                    <Phone className="w-3 h-3" />
                    <span>+3550677139666</span>
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 py-4 px-6 text-center text-xs text-[#F4F0E8]/45 border-t border-white/[0.06] space-y-1">
        <div>MITO · LEGJENDA · HISTORI · LOJËRA · Shiko. Mëso. Luaj. Konkuro.</div>
        <div className="text-[11px] text-[#F4F0E8]/55">
          Nuk keni llogari? Kontaktoni Super Adminin:{' '}
          <a href="tel:+3550677139666" className="text-[#C8A66A] font-mono-code hover:underline">
            +3550677139666
          </a>
        </div>
      </footer>
    </main>
  );
};
