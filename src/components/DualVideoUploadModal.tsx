import React, { useState, useEffect } from 'react';
import {
  X,
  FolderSync,
  CheckCircle2,
  AlertTriangle,
  Film,
  Smartphone,
  Eye,
  EyeOff,
  Gamepad2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Image as ImageIcon,
  Subtitles,
} from 'lucide-react';
import { CategoryItem, VideoContent, GameItem } from '../types/mito';
import { apiFetch } from '../utils/sessionToken';
import {
  initGoogleDriveAuth,
  googleDriveSignIn,
  getGoogleDriveAccessToken,
  googleDriveLogout,
} from '../utils/googleDriveAuth';

const DEFAULT_DRIVE_FOLDER_URL =
  'https://drive.google.com/drive/folders/1nuao4j4D1a2ZO6cN_WoHBwWOPMbmFbq5?usp=drive_link';

interface DualVideoUploadModalProps {
  isOpen?: boolean;
  initialMode?: 'select' | 'short' | 'standard';
  initialFormat?: 'short' | 'standard';
  existingContent?: VideoContent[];
  categories: CategoryItem[];
  editingContent?: VideoContent | null;
  games?: GameItem[];
  onClose: () => void;
  onSaved?: (createdContent: VideoContent) => void;
  onSuccess?: (createdContent: VideoContent) => void;
}

export const DualVideoUploadModal: React.FC<DualVideoUploadModalProps> = ({
  isOpen = true,
  initialMode = 'standard',
  initialFormat,
  categories,
  editingContent = null,
  games = [],
  onClose,
  onSaved,
  onSuccess,
}) => {
  const effectiveFormat: 'short' | 'standard' =
    initialFormat || (initialMode === 'short' ? 'short' : 'standard');

  // Google Drive Sync state
  const [driveFolderUrl, setDriveFolderUrl] = useState(DEFAULT_DRIVE_FOLDER_URL);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);

  // Metadata / Editor state for an existing Google Drive video
  const [format, setFormat] = useState<'short' | 'standard'>(effectiveFormat);
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.categoryId || 'cat_legjenda');
  const [region, setRegion] = useState('Shqipëri');
  const [tagsText, setTagsText] = useState('besa, film, shqip, legjenda');
  const [publicationStatus, setPublicationStatus] = useState<'published' | 'draft'>('published');
  const [posterUrl, setPosterUrl] = useState('');
  const [subtitleSqVtt, setSubtitleSqVtt] = useState('');
  const [selectedGameIds, setSelectedGameIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsub = initGoogleDriveAuth(
      (user, token) => {
        setGoogleUserEmail(user.email || user.displayName || 'Llogari Google e lidhur');
        setGoogleAccessToken(token);
      },
      () => {
        setGoogleUserEmail(null);
        setGoogleAccessToken(null);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setSyncSuccessMsg(null);

    if (editingContent) {
      setFormat(editingContent.videoFormat);
      setTitle(editingContent.title || '');
      setSynopsis(editingContent.synopsis || '');
      setDescription(editingContent.description || '');
      setCategoryId(editingContent.categoryIds?.[0] || categories[0]?.categoryId || 'cat_legjenda');
      setRegion(editingContent.region || 'Shqipëri');
      setTagsText((editingContent.tags || []).join(', '));
      setPublicationStatus(editingContent.publicationStatus === 'draft' ? 'draft' : 'published');
      setPosterUrl(editingContent.posterUrl || editingContent.thumbnailUrl || '');
      setSubtitleSqVtt(editingContent.captions?.[0]?.vttContent || '');

      const linkedIds = new Set<string>(editingContent.relatedGameIds || []);
      games.forEach((g) => {
        if (g.linkedContentId === editingContent.contentId) {
          linkedIds.add(g.gameId);
        }
      });
      setSelectedGameIds(Array.from(linkedIds));
      if (editingContent.driveFolderUrl) {
        setDriveFolderUrl(editingContent.driveFolderUrl);
      }
    } else {
      setFormat(effectiveFormat);
    }
  }, [isOpen, editingContent, effectiveFormat, categories, games]);

  if (!isOpen) return null;

  const notifySaved = (item: VideoContent) => {
    if (onSaved) onSaved(item);
    if (onSuccess) onSuccess(item);
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setIsSigningInGoogle(true);
    try {
      const result = await googleDriveSignIn();
      if (result) {
        setGoogleUserEmail(result.user.email || result.user.displayName || 'Llogari Google e lidhur');
        setGoogleAccessToken(result.accessToken);
      }
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          'Lidhja me Google Drive dështoi. Mund të vazhdoni me sinkronizimin e drejtpërdrejtë të dosjes.'
      );
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    await googleDriveLogout();
    setGoogleUserEmail(null);
    setGoogleAccessToken(null);
  };

  const handleSyncFromGoogleDrive = async () => {
    setErrorMsg(null);
    setSyncSuccessMsg(null);
    setIsSyncingDrive(true);
    try {
      const token = googleAccessToken || (await getGoogleDriveAccessToken());
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['X-Google-Access-Token'] = token;
      }

      const resp = await apiFetch('/api/admin/drive/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          folderUrlOrId: driveFolderUrl.trim() || DEFAULT_DRIVE_FOLDER_URL,
          accessToken: token || undefined,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorMsg(json.error || 'Gabim gjatë sinkronizimit me dosjen e Google Drive.');
        return;
      }

      setSyncSuccessMsg(
        json.messageSq ||
          `U sinkronizuan ${json.syncedCount || 1} video dhe kopertina nga Google Drive!`
      );
      if (Array.isArray(json.content) && json.content.length > 0) {
        notifySaved(json.content[0]);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gabim gjatë sinkronizimit me dosjen e Google Drive.');
    } finally {
      setIsSyncingDrive(false);
    }
  };

  const toggleGameLink = (gameId: string) => {
    setSelectedGameIds((prev) =>
      prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]
    );
  };

  const handleSaveEditedContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContent) return;
    if (!title.trim()) {
      setErrorMsg('Ju lutem shkruani titullin e videos.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const resp = await apiFetch(
        `/api/admin/content/${encodeURIComponent(editingContent.contentId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentId: editingContent.contentId,
            title: title.trim(),
            synopsis: synopsis.trim() || title.trim(),
            description: description.trim() || synopsis.trim() || title.trim(),
            videoFormat: format,
            publicationStatus,
            posterUrl: posterUrl.trim() || editingContent.posterUrl,
            thumbnailUrl: posterUrl.trim() || editingContent.thumbnailUrl,
            categoryIds: categoryId ? [categoryId] : [],
            region: region.trim() || 'Shqipëri',
            tags: tagsText
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
            relatedGameIds: selectedGameIds,
            captions: subtitleSqVtt.trim()
              ? [
                  {
                    id: 'sub_sq_1',
                    lang: 'sq',
                    label: 'Shqip',
                    vttUrl: '',
                    vttContent: subtitleSqVtt.trim(),
                  },
                ]
              : [],
            watchToUnlock: {
              enabled: false,
              requiredCompletionPercent: 0,
              mandatoryForAllGames: false,
            },
          }),
        }
      );

      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorMsg(json.error || 'Gabim gjatë ruajtjes së ndryshimeve të videos.');
        return;
      }

      if (json.content) {
        notifySaved(json.content);
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gabim gjatë ruajtjes së ndryshimeve të videos.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-[#121110] border border-[#C89B3C]/35 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#181614] border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#C89B3C]/15 text-[#C89B3C] border border-[#C89B3C]/30">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-[#F7F3EA]">
                {editingContent
                  ? `Menaxho Videon & Pyetësorin: ${editingContent.title}`
                  : 'Sinkronizimi Zyrtar nga Google Drive'}
              </h2>
              <p className="text-xs text-[#C7BFA9]">
                {editingContent
                  ? 'Ndrysho titullin, kopertinën, dukshmërinë (Fshih/Shfaq) dhe pyetësorët e lidhur pa ngarkuar skedarë manualisht'
                  : 'Videot dhe kopertinat e filmave shtohen vetëm përmes dosjes së Google Drive'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-[#9E9584] hover:text-white hover:bg-white/5 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Policy Banner: No Manual Video Uploads */}
        <div className="px-6 py-3 bg-[#C89B3C]/10 border-b border-[#C89B3C]/25 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-[#F7F3EA]">
            <ShieldCheck className="w-4 h-4 text-[#C89B3C] shrink-0" />
            <span>
              <strong>Politika e Përmbajtjes:</strong> Ngarkimi manual i videove në platformë është çaktivizuar. Të gjitha videot dhe kopertinat vijnë nga dosja juaj e Google Drive.
            </span>
          </div>
          <a
            href={driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#C89B3C] hover:underline"
          >
            Hap Dosjen Google Drive <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {editingContent ? (
          /* =========================================================
             MODE A: EDIT EXISTING GOOGLE DRIVE VIDEO & QUESTIONNAIRES
             ========================================================= */
          <form onSubmit={handleSaveEditedContent} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            {/* Visibility Toggle Card (Hide / Show Video) */}
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-[#C89B3C] font-semibold mb-1">
                  Dukshmëria e Videos në Platformë
                </div>
                <p className="text-xs text-[#C7BFA9]">
                  Mund ta fshihni videon nga përdoruesit ose ta shfaqni menjëherë në katalog pa e fshirë nga Google Drive.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPublicationStatus('published')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                    publicationStatus === 'published'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-white/5 text-[#9E9584] border-white/10 hover:text-white'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" /> E Shfaqur (Publikuar)
                </button>
                <button
                  type="button"
                  onClick={() => setPublicationStatus('draft')}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
                    publicationStatus === 'draft'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-white/5 text-[#9E9584] border-white/10 hover:text-white'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5" /> E Fshehur (Draft)
                </button>
              </div>
            </div>

            {/* Metadata Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5">
                  Titulli i Filmit / Videos *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-sm text-white focus:border-[#C89B3C] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5">
                  Kategoria Kulturore
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-sm text-white focus:border-[#C89B3C] focus:outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.categoryId} value={c.categoryId}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5">
                  Formati i Shfaqjes
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat('standard')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                      format === 'standard'
                        ? 'bg-[#C89B3C] text-black border-[#C89B3C]'
                        : 'bg-black/40 text-[#C7BFA9] border-white/10'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" /> Standarde (16:9)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('short')}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                      format === 'short'
                        ? 'bg-[#9E2A2B] text-white border-[#9E2A2B]'
                        : 'bg-black/40 text-[#C7BFA9] border-white/10'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" /> MITO Short (9:16)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5">
                  Krahina / Rajoni
                </label>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-sm text-white focus:border-[#C89B3C] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5">
                  Etiketat (Tags me presje)
                </label>
                <input
                  type="text"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-sm text-white focus:border-[#C89B3C] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#C89B3C]" /> Kopertina e Filmit ( sinkronizuar nga Google Drive ose URL )
                </label>
                <input
                  type="text"
                  value={posterUrl}
                  onChange={(e) => setPosterUrl(e.target.value)}
                  placeholder="/api/media/thumb/..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-white/15 text-sm text-white focus:border-[#C89B3C] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5">
                  Përmbledhja e Shkurtër (Synopsis)
                </label>
                <textarea
                  rows={2}
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-black/50 border border-white/15 text-sm text-white focus:border-[#C89B3C] focus:outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5">
                  Përshkrimi i Plotë Kulturor & Historik
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-black/50 border border-white/15 text-sm text-white focus:border-[#C89B3C] focus:outline-none"
                />
              </div>
            </div>

            {/* Linked Questionnaires / Quizzes Section (0% Watch Requirement) */}
            <div className="p-4 rounded-xl bg-[#181614] border border-[#C89B3C]/30 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-[#C89B3C]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#F7F3EA]">
                    Pyetësori / Kuizi i Videos (Pa Detyrim Shikimi — 0%)
                  </span>
                </div>
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold">
                  I Hapur Menjëherë (0% Watch-to-Unlock)
                </span>
              </div>
              <p className="text-xs text-[#C7BFA9]">
                Zgjidhni cilët pyetësorë/kuize do të shfaqen poshtë kësaj videoje. Përdoruesit mund ta hapin dhe luajnë pyetësorin në çdo moment pa qenë nevoja të shikojnë një përqindje të caktuar të videos.
              </p>

              {games.length === 0 ? (
                <div className="text-xs text-[#9E9584] italic">
                  Nuk ka pyetësorë të krijuar ende. Mund t&apos;i krijoni te seksioni &quot;Lojëra &amp; Kuize&quot;.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {games.map((g) => {
                    const isChecked = selectedGameIds.includes(g.gameId);
                    return (
                      <label
                        key={g.gameId}
                        className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                          isChecked
                            ? 'bg-[#C89B3C]/15 border-[#C89B3C]'
                            : 'bg-black/40 border-white/10 hover:border-white/25'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleGameLink(g.gameId)}
                          className="mt-0.5 accent-[#C89B3C]"
                        />
                        <div className="text-xs">
                          <div className="font-semibold text-[#F7F3EA]">{g.title}</div>
                          <div className="text-[#9E9584] mt-0.5">
                            {g.questionCount} pyetje • +{g.xpReward} XP
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Subtitles VTT */}
            <div>
              <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5 flex items-center gap-1.5">
                <Subtitles className="w-3.5 h-3.5 text-[#C89B3C]" /> Titrat Shqip (WEBVTT)
              </label>
              <textarea
                rows={3}
                value={subtitleSqVtt}
                onChange={(e) => setSubtitleSqVtt(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-black/50 border border-white/15 text-xs font-mono text-[#E8DFD1] focus:border-[#C89B3C] focus:outline-none"
              />
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/35 text-xs text-red-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-medium text-[#C7BFA9] transition cursor-pointer"
              >
                Anulo
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 rounded-xl bg-[#C89B3C] hover:bg-[#d8ab4c] text-black text-xs font-bold tracking-wide transition disabled:opacity-40 flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                {submitting ? 'Duke ruajtur...' : 'Ruaj Ndryshimet e Videos'}
              </button>
            </div>
          </form>
        ) : (
          /* =========================================================
             MODE B: GOOGLE DRIVE FOLDER SYNC (NO MANUAL UPLOADS)
             ========================================================= */
          <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            <div className="p-5 rounded-2xl bg-[#181614] border border-[#C89B3C]/30 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#C89B3C]/15 text-[#C89B3C] text-[11px] font-bold uppercase tracking-wider mb-2">
                    <FolderSync className="w-3.5 h-3.5" /> Burimi i Vetëm i Videove & Kopertinave
                  </span>
                  <h3 className="text-base font-serif font-bold text-[#F7F3EA]">
                    Dosja e Lidhur e Google Drive
                  </h3>
                  <p className="text-xs text-[#C7BFA9] mt-1">
                    Çdo film dhe kopertinë e vendosur në këtë dosje të Google Drive sinkronizohet në MITO dhe mund të menaxhohet (fshihet/shfaqet, editohet ose lidhet me pyetësorë) brenda platformës.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-[#C7BFA9] mb-1.5">
                  Linku i Dosjes Google Drive
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={driveFolderUrl}
                    onChange={(e) => setDriveFolderUrl(e.target.value)}
                    placeholder={DEFAULT_DRIVE_FOLDER_URL}
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-xs text-white font-mono focus:border-[#C89B3C] focus:outline-none"
                  />
                  <a
                    href={driveFolderUrl || DEFAULT_DRIVE_FOLDER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-xs font-semibold text-[#F7F3EA] flex items-center justify-center gap-1.5 shrink-0"
                  >
                    Hap në Drive <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

              {/* Official Sign in with Google button for live Drive API folder scan */}
              <div className="p-4 rounded-xl bg-black/40 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs">
                  <div className="font-semibold text-[#F7F3EA]">
                    Autorizimi i Google Drive API (Opsional për skanim live të skedarëve të rinj)
                  </div>
                  <div className="text-[#9E9584] mt-0.5">
                    {googleUserEmail
                      ? `I lidhur si: ${googleUserEmail}`
                      : 'Lidhu me Google për të lexuar skedarët e rinj direkt nga dosja juaj e Google Drive me lejen tuaj.'}
                  </div>
                </div>

                {googleUserEmail ? (
                  <button
                    type="button"
                    onClick={handleGoogleDisconnect}
                    className="px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-medium text-white shrink-0 cursor-pointer"
                  >
                    Shkëput Llogarinë Google
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isSigningInGoogle}
                    className="gsi-material-button shrink-0 inline-flex items-center gap-2.5 px-4 py-2 rounded-lg bg-white text-[#1f1f1f] hover:bg-gray-100 font-medium text-xs shadow transition disabled:opacity-50 cursor-pointer"
                  >
                    <div className="gsi-material-button-icon w-4 h-4">
                      <svg
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 48 48"
                        className="w-4 h-4 block"
                      >
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                    </div>
                    <span className="gsi-material-button-contents">
                      {isSigningInGoogle ? 'Duke u lidhur...' : 'Sign in with Google'}
                    </span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-[#9E9584]">
                  ID e Dosjes Aktive: <code className="text-[#C89B3C]">1nuao4j4D1a2ZO6cN_WoHBwWOPMbmFbq5</code>
                </div>
                <button
                  type="button"
                  onClick={handleSyncFromGoogleDrive}
                  disabled={isSyncingDrive}
                  className="px-5 py-2.5 rounded-xl bg-[#C89B3C] hover:bg-[#d8ab4c] text-black text-xs font-bold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                  {isSyncingDrive
                    ? 'Duke sinkronizuar nga Google Drive...'
                    : 'Sinkronizo Videot & Kopertinat nga Google Drive'}
                </button>
              </div>
            </div>

            {syncSuccessMsg && (
              <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-200 flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{syncSuccessMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/35 text-xs text-red-200 flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition cursor-pointer"
              >
                Mbyll Dritaren
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
