import React, { useEffect, useMemo, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import JSZip from 'jszip';
import {
  Archive,
  Bell,
  BellRing,
  Check,
  CheckSquare,
  Copy,
  Download,
  FolderOpen,
  History,
  Loader2,
  LogOut,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { ASPECT_PRESETS, CURATED_WALLPAPERS } from '../data/catalog';
import {
  exportBackgroundRecipeAsDataUrl,
  loadImageCached,
  renderBackgroundToCanvas,
  renderTemplateLayersToCanvas,
  triggerDataUrlDownload,
} from '../lib/studioRenderer';
import {
  AiHistoryEntry,
  AiHistoryKind,
  LocalProfile,
  SavedCreation,
  WallpaperItem,
} from '../types/studio';
import { ProceduralBackdropPreview } from './ProceduralBackdropPreview';

const MAX_ZIP_ITEMS = 3;

interface CollectionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: FirebaseUser | null;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
  pushEnabled?: boolean;
  pushBusy?: boolean;
  onTogglePushNotifications?: () => void;
  authBusy: boolean;
  authError: string | null;
  onSignInGoogle: () => void;
  onSignOut: () => void;
  creations: SavedCreation[];
  favorites: string[];
  wallpapers?: WallpaperItem[];
  aiHistory: AiHistoryEntry[];
  profile: LocalProfile;
  onUpdateProfile: (next: LocalProfile) => void;
  onDeleteCreation: (item: SavedCreation) => void;
  onOpenCreation: (item: SavedCreation) => void;
  onShareCreation: (item: SavedCreation, resolvedDataUrl: string) => void;
  onReuseAiHistoryPrompt: (entry: AiHistoryEntry) => void;
  onReopenAiHistoryResult: (entry: AiHistoryEntry) => void;
  onDeleteAiHistoryEntry: (entryId: string) => void;
  onClearAiHistory: () => void;
}

type UnifiedDrawerEntry =
  | {
      entryId: string;
      source: 'creation';
      title: string;
      subtitle: string;
      creation: SavedCreation;
    }
  | {
      entryId: string;
      source: 'favorite';
      title: string;
      subtitle: string;
      wallpaper: WallpaperItem;
    };

export const GoogleMark: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

export const CollectionDrawer: React.FC<CollectionDrawerProps> = ({
  isOpen,
  onClose,
  user,
  isAdmin = false,
  onOpenAdmin,
  pushEnabled = false,
  pushBusy = false,
  onTogglePushNotifications,
  authBusy,
  authError,
  onSignInGoogle,
  onSignOut,
  creations,
  favorites,
  wallpapers,
  aiHistory,
  profile,
  onUpdateProfile,
  onDeleteCreation,
  onOpenCreation,
  onShareCreation,
  onReuseAiHistoryPrompt,
  onReopenAiHistoryResult,
  onDeleteAiHistoryEntry,
  onClearAiHistory,
}) => {
  const [editingProfile, setEditingProfile] = useState(false);
  const [nameInput, setNameInput] = useState(profile.name);
  const [handleInput, setHandleInput] = useState(profile.handle);
  const [drawerTab, setDrawerTab] = useState<'all' | 'favorites' | 'projects' | 'history'>('all');
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [zipProgress, setZipProgress] = useState(false);
  const [zipFeedback, setZipFeedback] = useState<string | null>(null);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);

  const catalogSource = wallpapers ?? CURATED_WALLPAPERS;
  const favoriteWallpapers = useMemo(
    () => catalogSource.filter((wp) => favorites.includes(wp.id)),
    [catalogSource, favorites]
  );

  const kindLabel = (kind: SavedCreation['kind']) => {
    switch (kind) {
      case 'template':
        return 'Modelo IA';
      case 'background':
        return 'Background';
      case 'photo-edit':
        return 'Estúdio Foto';
      default:
        return 'Wallpaper';
    }
  };

  const aiHistoryKindLabel = (kind: AiHistoryKind) => {
    switch (kind) {
      case 'template':
        return 'Modelo IA';
      case 'background':
        return 'Background IA';
      case 'photo-analysis':
        return 'Análise Foto IA';
    }
  };

  const formatHistoryTimestamp = (ts: number) => {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ts));
    } catch {
      return '';
    }
  };

  const handleCopyPrompt = async (entry: AiHistoryEntry) => {
    const textToCopy =
      entry.kind === 'photo-analysis' && entry.photoAnalysisData?.suggestedStudioPrompt
        ? entry.photoAnalysisData.suggestedStudioPrompt
        : entry.prompt;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedHistoryId(entry.id);
      setTimeout(() => {
        setCopiedHistoryId((prev) => (prev === entry.id ? null : prev));
      }, 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const allEntries = useMemo<UnifiedDrawerEntry[]>(() => {
    const projectEntries: UnifiedDrawerEntry[] = creations.map((c) => {
      const preset = ASPECT_PRESETS[c.aspectId];
      return {
        entryId: `creation:${c.id}`,
        source: 'creation',
        title: c.title,
        subtitle: `${kindLabel(c.kind)} · ${preset.ratioLabel}`,
        creation: c,
      };
    });
    const favEntries: UnifiedDrawerEntry[] = favoriteWallpapers.map((wp) => ({
      entryId: `fav:${wp.id}`,
      source: 'favorite',
      title: wp.title,
      subtitle: `${wp.category} · ${wp.resolution}`,
      wallpaper: wp,
    }));
    return [...favEntries, ...projectEntries];
  }, [creations, favoriteWallpapers]);

  const visibleEntries = useMemo(() => {
    if (drawerTab === 'favorites') return allEntries.filter((e) => e.source === 'favorite');
    if (drawerTab === 'projects') return allEntries.filter((e) => e.source === 'creation');
    return allEntries;
  }, [allEntries, drawerTab]);

  // Keep selection valid if items are removed
  useEffect(() => {
    const validIds = new Set(allEntries.map((e) => e.entryId));
    setSelectedEntryIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [allEntries]);

  if (!isOpen) return null;

  const resolveCreationDataUrl = async (item: SavedCreation): Promise<string> => {
    if (item.previewDataUrl) return item.previewDataUrl;
    const preset = ASPECT_PRESETS[item.aspectId];
    const canvas = document.createElement('canvas');
    canvas.width = preset.width;
    canvas.height = preset.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    if (item.templateData) {
      await renderBackgroundToCanvas(ctx, preset.width, preset.height, item.templateData.background);
      renderTemplateLayersToCanvas(ctx, preset.width, preset.height, item.templateData.layers, null);
    } else if (item.backgroundData) {
      await renderBackgroundToCanvas(ctx, preset.width, preset.height, item.backgroundData);
    }
    return canvas.toDataURL('image/png');
  };

  const resolveWallpaperDataUrl = async (wp: WallpaperItem): Promise<string> => {
    if (wp.recipe) {
      const isLandscape = wp.aspectLabel === '16:9';
      return exportBackgroundRecipeAsDataUrl(
        wp.recipe,
        isLandscape ? 3840 : 2160,
        isLandscape ? 2160 : 3840,
        'image/png'
      );
    }
    if (wp.imageUrl) {
      const img = await loadImageCached(wp.imageUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
      }
    }
    return '';
  };

  const toggleEntrySelection = (entryId: string) => {
    setZipFeedback(null);
    setSelectedEntryIds((prev) => {
      if (prev.includes(entryId)) {
        return prev.filter((id) => id !== entryId);
      }
      if (prev.length >= MAX_ZIP_ITEMS) {
        setZipFeedback(`Você pode selecionar no máximo ${MAX_ZIP_ITEMS} artes por arquivo ZIP.`);
        return prev;
      }
      return [...prev, entryId];
    });
  };

  const handleDownloadZip = async () => {
    const selectedEntries = allEntries.filter((e) => selectedEntryIds.includes(e.entryId));
    if (selectedEntries.length === 0) return;

    setZipProgress(true);
    setZipFeedback(null);
    try {
      const zip = new JSZip();
      const usedFilenames = new Set<string>();

      for (const entry of selectedEntries) {
        const dataUrl =
          entry.source === 'creation'
            ? await resolveCreationDataUrl(entry.creation)
            : await resolveWallpaperDataUrl(entry.wallpaper);

        if (!dataUrl || !dataUrl.includes(',')) continue;
        const base64 = dataUrl.split(',')[1];
        const baseSlug =
          entry.title
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 48) || 'arte-atelier';

        let filename = `${baseSlug}.png`;
        let counter = 2;
        while (usedFilenames.has(filename)) {
          filename = `${baseSlug}-${counter}.png`;
          counter += 1;
        }
        usedFilenames.add(filename);
        zip.file(filename, base64, { base64: true });
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `atelier-club-selecao-${selectedEntries.length}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2500);

      setZipFeedback(
        `Pacote ZIP com ${selectedEntries.length} ${
          selectedEntries.length === 1 ? 'arte baixada' : 'artes baixadas'
        }!`
      );
    } catch {
      setZipFeedback('Não foi possível gerar o arquivo ZIP. Tente novamente.');
    } finally {
      setZipProgress(false);
    }
  };

  const limitReached = selectedEntryIds.length >= MAX_ZIP_ITEMS;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#111115] border-l border-zinc-800 h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Conta &amp; Coleção</h2>
            <p className="text-xs text-zinc-400">
              <span className="font-mono-tabular">{allEntries.length}</span> itens na galeria · 100% gratuito
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Fechar coleção"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Google Account & Studio Profile Section */}
        <div className="px-6 py-4 border-b border-zinc-800/80 bg-[#0C0C0F] space-y-3">
          {!user ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-zinc-100">Entre com sua Conta Google</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Sincronize seus papéis de parede favoritos, modelos IA e planos de fundo em
                  qualquer dispositivo com acesso gratuito.
                </p>
              </div>
              <button
                onClick={onSignInGoogle}
                disabled={authBusy}
                className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 rounded-lg bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100 transition-colors disabled:opacity-50"
              >
                <GoogleMark className="w-4 h-4" />
                {authBusy ? 'Conectando ao Google...' : 'Continuar com Google'}
              </button>
              {authError && <p className="text-xs text-red-400">{authError}</p>}
            </div>
          ) : editingProfile ? (
            <div className="space-y-2.5">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Nome do estúdio ou criador"
                className="w-full rounded-lg bg-[#141418] border border-zinc-700 px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-[#F2B705]"
              />
              <input
                type="text"
                value={handleInput}
                onChange={(e) => setHandleInput(e.target.value)}
                placeholder="@seuperfil"
                className="w-full rounded-lg bg-[#141418] border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-[#F2B705]"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    onUpdateProfile({
                      ...profile,
                      name: nameInput.trim() || user.displayName || 'Criador Atelier',
                      handle: handleInput.trim() || '@atelierclub',
                    });
                    setEditingProfile(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#F2B705] text-zinc-950 text-xs font-semibold"
                >
                  Salvar Perfil
                </button>
                <button
                  onClick={() => setEditingProfile(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={profile.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-zinc-700 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[#F2B705] shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{profile.name}</p>
                  <p className="text-xs text-zinc-400 truncate">
                    {profile.handle} · {user.email || 'Google Conectado'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => {
                    setNameInput(profile.name);
                    setHandleInput(profile.handle);
                    setEditingProfile(true);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:text-zinc-100 hover:border-zinc-500 transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={onSignOut}
                  className="p-1.5 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
                  title="Sair da conta Google"
                  aria-label="Sair da conta Google"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {user && isAdmin && onOpenAdmin && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-[#16161B] border border-[#F2B705]/50 text-xs font-semibold text-[#F2B705] hover:bg-[#1B1B22] transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Abrir Painel Admin &amp; Anúncios</span>
            </button>
          )}

          {onTogglePushNotifications && (
            <button
              type="button"
              onClick={onTogglePushNotifications}
              disabled={pushBusy}
              className={`w-full flex items-center justify-between gap-2 py-2 px-3 rounded-lg border text-xs transition-colors disabled:opacity-50 ${
                pushEnabled
                  ? 'bg-[#16161B] border-emerald-800/70 text-emerald-200'
                  : 'bg-[#141418] border-zinc-800 text-zinc-300 hover:border-zinc-700'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {pushEnabled ? (
                  <BellRing className="w-3.5 h-3.5 text-[#F2B705]" />
                ) : (
                  <Bell className="w-3.5 h-3.5 text-zinc-400" />
                )}
                <span>Notificações de novas coleções</span>
              </span>
              <span className="font-mono text-[11px]">
                {pushBusy ? '...' : pushEnabled ? 'Ativo' : 'Ativar'}
              </span>
            </button>
          )}

          {/* Profile Quick-Link to AI Prompt & Result History */}
          <button
            type="button"
            onClick={() => setDrawerTab('history')}
            className={`w-full flex items-center justify-between gap-2 py-2 px-3 rounded-lg border text-xs transition-colors ${
              drawerTab === 'history'
                ? 'bg-[#18181E] border-[#F2B705]/60 text-zinc-100'
                : 'bg-[#141418] border-zinc-800 text-zinc-300 hover:border-zinc-700'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <History className="w-3.5 h-3.5 text-[#F2B705]" />
              <span>Histórico de IA do perfil</span>
            </span>
            <span className="font-mono-tabular text-[11px] text-[#F2B705]">
              {aiHistory.length}/10
            </span>
          </button>
        </div>

        {/* Sub-Tabs & Batch ZIP / History Toolbar */}
        <div className="px-6 py-3 border-b border-zinc-800/80 bg-[#0F0F13] space-y-3">
          <div className="grid grid-cols-4 gap-1 p-1 bg-[#09090B] rounded-lg border border-zinc-800">
            <button
              onClick={() => setDrawerTab('all')}
              className={`py-1.5 px-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                drawerTab === 'all' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Todos ({allEntries.length})
            </button>
            <button
              onClick={() => setDrawerTab('favorites')}
              className={`py-1.5 px-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                drawerTab === 'favorites'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Fav ({favoriteWallpapers.length})
            </button>
            <button
              onClick={() => setDrawerTab('projects')}
              className={`py-1.5 px-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                drawerTab === 'projects'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Proj ({creations.length})
            </button>
            <button
              onClick={() => setDrawerTab('history')}
              className={`py-1.5 px-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap ${
                drawerTab === 'history'
                  ? 'bg-zinc-800 text-[#F2B705]'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Histórico ({aiHistory.length})
            </button>
          </div>

          {drawerTab === 'history' ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-400">
                <span className="font-mono-tabular text-zinc-100 font-semibold">
                  {aiHistory.length}/10
                </span>{' '}
                prompts &amp; gerações recentes
              </p>
              {aiHistory.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAiHistory}
                  className="text-xs text-zinc-400 hover:text-red-400 underline transition-colors"
                >
                  Limpar histórico
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-zinc-400">
                  <span className="font-mono-tabular text-zinc-100 font-semibold">
                    {selectedEntryIds.length}/{MAX_ZIP_ITEMS}
                  </span>{' '}
                  para ZIP
                  {limitReached && (
                    <span className="text-[#F2B705] ml-1.5">· Máximo atingido</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedEntryIds.length > 0 && (
                    <button
                      onClick={() => {
                        setSelectedEntryIds([]);
                        setZipFeedback(null);
                      }}
                      className="text-xs text-zinc-400 hover:text-zinc-100 underline"
                    >
                      Limpar
                    </button>
                  )}
                  <button
                    onClick={handleDownloadZip}
                    disabled={selectedEntryIds.length === 0 || zipProgress}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F2B705] text-zinc-950 text-xs font-semibold hover:bg-[#e5ad04] transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {zipProgress ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Archive className="w-3.5 h-3.5" />
                    )}
                    {zipProgress
                      ? 'Compactando...'
                      : `Baixar ZIP (${selectedEntryIds.length})`}
                  </button>
                </div>
              </div>

              {zipFeedback && (
                <p className="text-xs text-zinc-200 bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5">
                  {zipFeedback}
                </p>
              )}
            </>
          )}
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3.5">
          {drawerTab === 'history' ? (
            aiHistory.length === 0 ? (
              <div className="text-center py-14 px-4 rounded-xl border border-dashed border-zinc-800 space-y-2">
                <Sparkles className="w-6 h-6 text-[#F2B705] mx-auto opacity-80" />
                <p className="text-sm font-medium text-zinc-300">
                  Seu histórico de IA está vazio
                </p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Gere um modelo em Modelos IA, um background em Criar Fundo ou analise uma foto
                  no Estúdio Foto. Os últimos 10 prompts e resultados ficam salvos aqui
                  automaticamente.
                </p>
              </div>
            ) : (
              aiHistory.map((entry) => {
                const previewRecipe =
                  entry.templateData?.background || entry.backgroundData;
                const isCopied = copiedHistoryId === entry.id;
                const canReopen = Boolean(
                  entry.templateData || entry.backgroundData || entry.photoAnalysisData
                );

                return (
                  <div
                    key={entry.id}
                    className="rounded-xl bg-[#16161B] border border-zinc-800 p-3.5 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] text-zinc-400">
                        <span className="text-[#F2B705] font-medium">
                          {aiHistoryKindLabel(entry.kind)}
                        </span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono-tabular">
                          {formatHistoryTimestamp(entry.createdAt)}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => onDeleteAiHistoryEntry(entry.id)}
                        className="p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors shrink-0"
                        title="Remover do histórico"
                        aria-label={`Remover ${entry.resultTitle} do histórico`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex gap-3">
                      {previewRecipe && (
                        <div className="w-14 h-18 rounded-lg overflow-hidden bg-black shrink-0 border border-zinc-800">
                          <ProceduralBackdropPreview
                            recipe={previewRecipe}
                            layers={entry.templateData?.layers}
                            width={112}
                            height={144}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0 space-y-1">
                        <h3 className="text-sm font-medium text-zinc-100 truncate">
                          {entry.resultTitle}
                        </h3>
                        {entry.resultSummary && (
                          <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                            {entry.resultSummary}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg bg-[#0B0B0E] border border-zinc-800/90 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-0.5">
                        Prompt utilizado
                      </p>
                      <p className="text-xs text-zinc-200 line-clamp-3 leading-relaxed">
                        {entry.prompt}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          onReuseAiHistoryPrompt(entry);
                          onClose();
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#F2B705] text-zinc-950 text-xs font-semibold hover:bg-[#e5ad04] transition-colors whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>
                          {entry.kind === 'photo-analysis'
                            ? 'Usar Prompt no Fundo'
                            : 'Reutilizar Prompt'}
                        </span>
                      </button>

                      {canReopen && (
                        <button
                          type="button"
                          onClick={() => {
                            onReopenAiHistoryResult(entry);
                            onClose();
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-100 transition-colors whitespace-nowrap"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>
                            {entry.kind === 'photo-analysis'
                              ? 'Aplicar Ajuste IA'
                              : 'Reabrir Resultado'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleCopyPrompt(entry)}
                        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-xs text-zinc-300 transition-colors ml-auto whitespace-nowrap"
                        title="Copiar prompt"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-300">Copiado</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )
          ) : visibleEntries.length === 0 ? (
            <div className="text-center py-14 px-4 rounded-xl border border-dashed border-zinc-800">
              <p className="text-sm font-medium text-zinc-300">Nenhum item encontrado aqui</p>
              <p className="text-xs text-zinc-500 mt-1.5">
                Favorite papéis de parede na galeria ou salve modelos e planos de fundo para
                baixá-los em pacote ZIP (até 3 por vez).
              </p>
            </div>
          ) : (
            visibleEntries.map((entry) => {
              const isSelected = selectedEntryIds.includes(entry.entryId);
              const isDisabled = !isSelected && limitReached;

              const bgRecipe =
                entry.source === 'creation'
                  ? entry.creation.templateData?.background || entry.creation.backgroundData
                  : entry.wallpaper.recipe;
              const imgUrl =
                entry.source === 'creation'
                  ? entry.creation.previewDataUrl
                  : entry.wallpaper.imageUrl;

              return (
                <div
                  key={entry.entryId}
                  className={`rounded-xl bg-[#16161B] border overflow-hidden flex gap-3 p-3 transition-colors ${
                    isSelected ? 'border-[#F2B705]' : 'border-zinc-800'
                  }`}
                >
                  {/* Multi-select checkbox */}
                  <button
                    type="button"
                    onClick={() => toggleEntrySelection(entry.entryId)}
                    disabled={isDisabled}
                    className={`self-start mt-1 p-1 rounded transition-colors shrink-0 ${
                      isSelected
                        ? 'text-[#F2B705]'
                        : isDisabled
                        ? 'text-zinc-700 cursor-not-allowed'
                        : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                    aria-label={
                      isSelected
                        ? `Desmarcar ${entry.title}`
                        : `Selecionar ${entry.title} para ZIP`
                    }
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>

                  {/* Thumbnail */}
                  <div
                    onClick={() => {
                      if (!isDisabled) toggleEntrySelection(entry.entryId);
                    }}
                    className="w-16 h-20 rounded-lg overflow-hidden bg-black shrink-0 border border-zinc-800 cursor-pointer"
                  >
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={entry.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : bgRecipe ? (
                      <ProceduralBackdropPreview
                        recipe={bgRecipe}
                        layers={
                          entry.source === 'creation'
                            ? entry.creation.templateData?.layers
                            : undefined
                        }
                        width={128}
                        height={160}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>

                  {/* Metadata & Single Actions */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <p className="text-[11px] text-zinc-400 truncate">{entry.subtitle}</p>
                      <h3 className="text-sm font-medium text-zinc-100 truncate mt-0.5">
                        {entry.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 pt-2">
                      {entry.source === 'creation' &&
                        (entry.creation.templateData || entry.creation.backgroundData) && (
                          <button
                            onClick={() => {
                              onOpenCreation(entry.creation);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-100 transition-colors"
                            title="Reabrir no editor"
                          >
                            <FolderOpen className="w-3.5 h-3.5" />
                            Editar
                          </button>
                        )}
                      <button
                        onClick={async () => {
                          const url =
                            entry.source === 'creation'
                              ? await resolveCreationDataUrl(entry.creation)
                              : await resolveWallpaperDataUrl(entry.wallpaper);
                          if (url) triggerDataUrlDownload(url, `${entry.title.slice(0, 32)}.png`);
                        }}
                        className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                        title="Baixar PNG individual"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={async () => {
                          const url =
                            entry.source === 'creation'
                              ? await resolveCreationDataUrl(entry.creation)
                              : await resolveWallpaperDataUrl(entry.wallpaper);
                          if (url) {
                            const shareObj: SavedCreation =
                              entry.source === 'creation'
                                ? entry.creation
                                : {
                                    id: entry.wallpaper.id,
                                    kind: 'wallpaper',
                                    title: entry.wallpaper.title,
                                    previewDataUrl: url,
                                    aspectId:
                                      entry.wallpaper.aspectLabel === '16:9'
                                        ? 'desktop-16-9'
                                        : 'mobile-9-16',
                                    createdAt: Date.now(),
                                  };
                            onShareCreation(shareObj, url);
                          }
                        }}
                        className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
                        title="Compartilhar"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      {entry.source === 'creation' && (
                        <button
                          onClick={() => onDeleteCreation(entry.creation)}
                          className="p-1.5 rounded-md bg-zinc-800 hover:bg-red-950 hover:text-red-400 text-zinc-400 transition-colors ml-auto"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
