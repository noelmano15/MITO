import React, { useState } from 'react';
import {
  Eye,
  EyeOff,
  X,
  ShieldAlert,
  KeyRound,
  Smartphone,
  ArrowRight,
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
    <main className="min-h-screen w-full bg-[#0B0B0D] text-[#F4F0E8] flex flex-col justify-between relative overflow-hidden">
      {/* Subtle heritage radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 22%, rgba(100, 28, 43, 0.32) 0%, rgba(200, 166, 106, 0.06) 38%, rgba(11, 11, 13, 0.98) 75%)',
        }}
      />

      {/* Top minimal bar */}
      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl w-full mx-auto">
        <BrandLogo variant="compact" size="sm" />
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onNavigate('/join')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#C8A66A]/30 bg-[#202024]/70 hover:bg-[#202024] text-xs font-medium text-[#F4F0E8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Smartphone className="w-4 h-4 text-[#C8A66A]" />
            <span>Bashkohu në Lojë me Kod Dhome</span>
          </button>
        </div>
      </header>

      {/* Center Login Container */}
      <section className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-[#141418] border border-[#C8A66A]/25 rounded-2xl p-8 shadow-[0_24px_64px_rgba(0,0,0,0.75)]">
          <div className="flex flex-col items-center text-center mb-6">
            <BrandLogo variant="full" size="xl" />
            <h1 className="mt-4 text-2xl font-serif-heritage font-semibold text-[#F4F0E8]">
              Hyr me kodin tënd
            </h1>
            <p className="mt-1.5 text-sm text-[#F4F0E8]/70">
              Shiko. Mëso. Luaj. Konkuro në trashëgiminë shqiptare.
            </p>
          </div>

          <form onSubmit={(e) => handleLoginSubmit(e)} className="space-y-5">
            <div>
              <label
                htmlFor="access-code-input"
                className="block text-xs font-medium text-[#C8A66A] mb-2 text-center tracking-wide"
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
                  className="w-full bg-[#0B0B0D] border border-[#C8A66A]/35 focus:border-[#C8A66A] rounded-xl py-3.5 px-12 text-center font-mono-code text-2xl tracking-[0.18em] text-[#F4F0E8] placeholder-[#F4F0E8]/25 focus:outline-none transition-colors"
                />
                <div className="absolute right-3 flex items-center gap-1">
                  {code.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCode('')}
                      aria-label="Pastro kodin"
                      className="p-1.5 text-[#F4F0E8]/50 hover:text-[#F4F0E8] rounded-md transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMaskInput(!maskInput)}
                    aria-label={maskInput ? 'Shfaq kodin' : 'Fshih kodin'}
                    className="p-1.5 text-[#F4F0E8]/50 hover:text-[#C8A66A] rounded-md transition-colors cursor-pointer"
                  >
                    {maskInput ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {errorSq && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#641C2B]/30 border border-[#641C2B] text-xs text-[#F4F0E8]"
              >
                <ShieldAlert className="w-4 h-4 text-[#C8A66A] shrink-0 mt-0.5" />
                <span>{errorSq}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] disabled:opacity-50 text-[#F4F0E8] font-semibold text-base border border-[#C8A66A]/35 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{loading ? 'Po verifikohet kodi...' : 'Hyr'}</span>
              {!loading && <ArrowRight className="w-4 h-4 text-[#C8A66A]" />}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#202024] text-center space-y-2">
            <p className="text-xs text-[#F4F0E8]/60 flex items-center justify-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[#C8A66A]" />
              <span>Vendosni kodin tuaj personal 9-shifror për të hyrë në platformë.</span>
            </p>
          </div>
        </div>
      </section>

      <footer className="relative z-10 py-4 px-6 text-center text-xs text-[#F4F0E8]/45 border-t border-[#202024]/60">
        <span>MITO · LEGJENDA · HISTORI · LOJËRA · Shiko. Mëso. Luaj. Konkuro.</span>
      </footer>
    </main>
  );
};
