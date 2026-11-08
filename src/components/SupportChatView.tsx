import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Send,
  Bot,
  UserCheck,
  Sparkles,
  Headphones,
  ArrowLeft,
  ShieldAlert,
  CheckCircle2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { apiFetch } from '../utils/sessionToken';
import type { UserAccount, SupportTicket } from '../types/mito';

interface SupportChatViewProps {
  user: UserAccount;
  onNavigate: (path: string) => void;
}

const QUICK_TOPICS = [
  'Cilat pajisje janë aktive në llogarinë time?',
  'Nxirre Mac nga llogaria ime',
  'Rigjenero kodin tim të hyrjes pa më nxjerrë nga llogaria',
  'Kam nevojë për ndihmë me filmin BESA',
  'Dua të flas me një Agjent Njerëzor',
];

export const SupportChatView: React.FC<SupportChatViewProps> = ({ user, onNavigate }) => {
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const sendingRef = useRef(false);

  const loadTicket = useCallback(async (silent = false) => {
    if (silent && sendingRef.current) return;
    if (!silent) setLoading(true);
    try {
      const res = await apiFetch('/api/support/my-ticket');
      if (res.ok) {
        const data = await res.json();
        if (!sendingRef.current) {
          setTicket(data.ticket || null);
        }
      }
    } catch {
      // Ignore transient poll errors
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTicket(false);

    // Ultra-fast 1s background refresh for real-time messaging on phone and web
    const interval = window.setInterval(() => {
      loadTicket(true);
    }, 1000);

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        loadTicket(true);
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Real-time WebSocket push listener
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let unmounted = false;

    const connectWs = () => {
      if (unmounted) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${proto}//${window.location.host}/ws`);
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(String(event.data));
            if (msg.type === 'support:update') {
              if (!msg.userId || msg.userId === user.uid) {
                loadTicket(true);
              }
            }
          } catch {
            // Ignore non-JSON ws frames
          }
        };
        ws.onclose = () => {
          if (!unmounted) {
            reconnectTimer = window.setTimeout(connectWs, 1500);
          }
        };
      } catch {
        // Fallback to 1s polling
      }
    };
    connectWs();

    return () => {
      unmounted = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (ws) {
        try {
          ws.close();
        } catch {
          // Ignore close errors
        }
      }
    };
  }, [loadTicket, user.uid]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages.length, sending]);

  const handleSendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? messageText).trim();
    if (!text || sending) return;
    if (!textOverride) setMessageText('');
    setSending(true);
    sendingRef.current = true;

    const nowIso = new Date().toISOString();
    const optimisticMsgId = `msg_opt_${Date.now()}`;
    setTicket((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        updatedAt: nowIso,
        lastMessagePreview: text.slice(0, 120),
        messages: [
          ...(prev.messages || []),
          {
            messageId: optimisticMsgId,
            ticketId: prev.ticketId,
            senderRole: 'user',
            senderName: user.displayName,
            text,
            createdAt: nowIso,
          },
        ],
      };
    });

    try {
      const res = await apiFetch('/api/support/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const handleRequestHuman = async () => {
    if (escalating) return;
    setEscalating(true);
    sendingRef.current = true;
    try {
      const res = await apiFetch('/api/support/request-human', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Kërkoj të bisedoj drejtpërdrejt me një Agjent Njerëzor të Supportit.',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
      }
    } finally {
      sendingRef.current = false;
      setEscalating(false);
    }
  };

  const statusBadge = () => {
    const st = ticket?.status || 'ai_active';
    if (st === 'human_active') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
          <UserCheck className="w-3.5 h-3.5" />
          <span>Agjent Njerëzor në Linjë</span>
        </span>
      );
    }
    if (st === 'human_requested') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-semibold">
          <Clock className="w-3.5 h-3.5" />
          <span>Në pritje të Agjentit Njerëzor</span>
        </span>
      );
    }
    if (st === 'resolved') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#202024] border border-[#C8A66A]/35 text-[#C8A66A] text-xs font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>E Zgjidhur</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#641C2B]/40 border border-[#C8A66A]/40 text-[#C8A66A] text-xs font-semibold">
        <Sparkles className="w-3.5 h-3.5" />
        <span>MITO · AI Asistent (Gemini)</span>
      </span>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 sm:py-8 safe-main-content">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('/home')}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#141418] hover:bg-[#202024] border border-[#202024] flex items-center justify-center text-[#F4F0E8] cursor-pointer"
            aria-label="Kthehu në Kreu"
          >
            <ArrowLeft className="w-5 h-5 text-[#C8A66A]" />
          </button>
          <div>
            <h1 className="text-lg sm:text-2xl font-serif-heritage font-bold text-[#F4F0E8] flex items-center gap-2">
              <Headphones className="w-5 h-5 text-[#C8A66A]" />
              <span>Qendra e Ndihmës · MITO Support</span>
            </h1>
            <p className="text-xs text-[#F4F0E8]/65">
              Asistencë inteligjente me Gemini AI për sigurinë e llogarisë suaj ose bisedë me Agjentin Njerëzor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {statusBadge()}
          <button
            type="button"
            onClick={() => loadTicket(false)}
            className="min-h-[40px] px-3 rounded-xl bg-[#141418] hover:bg-[#202024] border border-[#202024] text-xs text-[#F4F0E8]/80 flex items-center gap-1.5 cursor-pointer"
            title="Rifresko bisedën"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#C8A66A]" />
            <span className="hidden sm:inline">Rifresko</span>
          </button>
        </div>
      </div>

      {/* Security / Unknown Device Banner */}
      <div className="mb-4 p-3.5 rounded-2xl bg-[#141418] border border-[#C8A66A]/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-[#C8A66A] shrink-0 mt-0.5" />
          <div className="text-xs text-[#F4F0E8]/80 leading-relaxed">
            <span className="font-semibold text-[#C8A66A]">Siguria e Llogarisë Suaj:</span>{' '}
            Nuk njihni një pajisje në llogarinë tuaj? Kërkojini asistentit <strong>MITO</strong> ta nxjerrë jashtë apo ta bllokojë pajisjen e panjohur dhe t&apos;ju rigjenerojë kodin e hyrjes, ose klikoni <strong>Kërko Agjent Njerëzor</strong> për të folur direkt me Super Adminin.
          </div>
        </div>

        {ticket?.status === 'ai_active' && (
          <button
            type="button"
            disabled={escalating}
            onClick={handleRequestHuman}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] border border-[#C8A66A]/50 text-xs font-semibold text-[#F4F0E8] flex items-center justify-center gap-2 shrink-0 cursor-pointer shadow-md"
          >
            <UserCheck className="w-4 h-4 text-[#C8A66A]" />
            <span>{escalating ? 'Duke njoftuar...' : 'Kërko Agjent Njerëzor'}</span>
          </button>
        )}
      </div>

      {/* Quick Issue Topics */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {QUICK_TOPICS.map((topic) => (
          <button
            key={topic}
            type="button"
            disabled={sending}
            onClick={() => handleSendMessage(topic)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#141418] hover:bg-[#202024] border border-[#202024] hover:border-[#C8A66A]/45 text-xs text-[#F4F0E8]/90 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            {topic}
          </button>
        ))}
      </div>

      {/* Chat Container */}
      <div className="bg-[#141418] border border-[#202024] rounded-2xl overflow-hidden flex flex-col h-[58vh] min-h-[380px] max-h-[600px] shadow-2xl">
        {/* Messages List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {loading && !ticket ? (
            <div className="h-full flex items-center justify-center text-xs text-[#F4F0E8]/60">
              Po hapet lidhja e sigurt me agjentin MITO...
            </div>
          ) : (
            (ticket?.messages || []).map((msg) => {
              const isUser = msg.senderRole === 'user';
              const isSystem = msg.senderRole === 'system';
              const isAgent = msg.senderRole === 'agent';
              const displaySender = isUser
                ? 'Ju'
                : msg.senderRole === 'ai'
                ? 'MITO'
                : msg.senderName;

              if (isSystem) {
                return (
                  <div key={msg.messageId} className="flex justify-center my-2">
                    <div className="px-3.5 py-1.5 rounded-xl bg-[#202024]/90 border border-[#C8A66A]/30 text-[11px] text-[#C8A66A] text-center max-w-md whitespace-pre-line">
                      {msg.text}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.messageId}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    {!isUser && (
                      isAgent ? (
                        <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-[#C8A66A]" />
                      )
                    )}
                    <span className="text-[11px] font-semibold text-[#F4F0E8]/70">
                      {displaySender}
                    </span>
                    <span className="text-[10px] font-mono-code text-[#F4F0E8]/45">
                      {new Date(msg.createdAt || msg.timestamp || new Date().toISOString()).toLocaleTimeString('sq-AL', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-line ${
                      isUser
                        ? 'bg-[#641C2B] text-[#F4F0E8] border border-[#C8A66A]/40 rounded-br-sm'
                        : isAgent
                        ? 'bg-emerald-950/50 text-[#F4F0E8] border border-emerald-500/40 rounded-bl-sm'
                        : 'bg-[#0B0B0D] text-[#F4F0E8]/95 border border-[#C8A66A]/25 rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          {sending && (!ticket || ticket.status === 'ai_active') && (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <Bot className="w-3.5 h-3.5 text-[#C8A66A] animate-pulse" />
                <span className="text-[11px] font-semibold text-[#C8A66A]">MITO</span>
              </div>
              <div className="rounded-2xl rounded-bl-sm px-4 py-2.5 text-xs text-[#C8A66A] bg-[#0B0B0D] border border-[#C8A66A]/30 animate-pulse">
                MITO (Gemini AI) po shkruan...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="p-3 sm:p-4 bg-[#0B0B0D] border-t border-[#202024] flex items-center gap-2.5"
        >
          <input
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={
              ticket?.status === 'human_active' || ticket?.status === 'human_requested'
                ? 'Shkruani mesazhin për Agjentin Njerëzor (Super Admin)...'
                : 'Shkruani pyetjen ose kërkesën tuaj për MITO AI...'
            }
            className="flex-1 min-h-[48px] px-4 rounded-xl bg-[#141418] border border-[#202024] focus:border-[#C8A66A] text-sm text-[#F4F0E8] placeholder-[#F4F0E8]/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={sending || !messageText.trim()}
            className="min-h-[48px] px-5 rounded-xl bg-[#641C2B] hover:bg-[#7D2336] disabled:opacity-50 text-sm font-semibold text-[#F4F0E8] border border-[#C8A66A]/45 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Send className="w-4 h-4 text-[#C8A66A]" />
            <span className="hidden sm:inline">{sending ? 'Duke dërguar...' : 'Dërgo'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
