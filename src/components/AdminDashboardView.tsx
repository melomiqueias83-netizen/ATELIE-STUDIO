import React, { useEffect, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import {
  Bell,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  Heart,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { CURATED_WALLPAPERS } from '../data/catalog';
import {
  GOOGLE_TEST_ADMOB_IDS,
  isValidAdMobAppId,
  isValidAdMobUnitId,
  isValidAdSenseClientId,
  isValidAdSenseSlotId,
} from '../lib/admobBridge';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  deleteCatalogOverrideInFirestore,
  deleteCollectionAlertInFirestore,
  publishCollectionAlertInFirestore,
  saveCatalogOverrideInFirestore,
  saveMonetizationConfigInFirestore,
  subscribeToAdminPushSubscribers,
} from '../lib/firebase';
import {
  CatalogOverrideRecord,
  CollectionAlertRecord,
  MonetizationConfig,
  PushSubscriptionRecord,
  QuickFilterTag,
  WallpaperItem,
} from '../types/studio';

interface AdminDashboardViewProps {
  user: FirebaseUser;
  monetization: MonetizationConfig;
  catalogOverrides: CatalogOverrideRecord[];
  mergedWallpapers: WallpaperItem[];
  collectionAlerts: CollectionAlertRecord[];
  onPreviewDonation?: () => void;
}

type AdminSectionTab = 'ads' | 'catalog' | 'push' | 'system';

const CATEGORIES: WallpaperItem['category'][] = [
  'Fotografia Editorial',
  'Estúdio & Luz',
  'Abstrato & Seda',
  'Arquitetura',
  'Minimalista Noturno',
];

const ALL_TAGS: QuickFilterTag[] = [
  'Minimalista',
  'Cinéfilo',
  'Vintage',
  'AMOLED',
  'Arquitetônico',
  'Solar',
];

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  user,
  monetization,
  catalogOverrides,
  mergedWallpapers,
  collectionAlerts,
  onPreviewDonation,
}) => {
  const [section, setSection] = useState<AdminSectionTab>('ads');
  const [draftConfig, setDraftConfig] = useState<MonetizationConfig>(monetization);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  // Catalog Editor state
  const [editingItem, setEditingItem] = useState<CatalogOverrideRecord | null>(null);
  const [isNewItem, setIsNewItem] = useState(false);
  const [notifyOnCatalogSave, setNotifyOnCatalogSave] = useState(true);
  const [savingCatalog, setSavingCatalog] = useState(false);
  const [catalogFeedback, setCatalogFeedback] = useState<string | null>(null);

  // FCM Push Notifications state
  const [subscribers, setSubscribers] = useState<PushSubscriptionRecord[]>([]);
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushCategory, setPushCategory] = useState<CollectionAlertRecord['category']>('Todos');
  const [pushWallpaperId, setPushWallpaperId] = useState('');
  const [sendingPush, setSendingPush] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);
  const [downloadingBundle, setDownloadingBundle] = useState(false);
  const [bundleError, setBundleError] = useState<string | null>(null);

  const handleDownloadFullBundle = async () => {
    setDownloadingBundle(true);
    setBundleError(null);
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch('/api/admin/export-bundle', {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao gerar pacote ZIP.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'atelier-club-completo.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2500);
    } catch (err: unknown) {
      setBundleError(
        err instanceof Error ? err.message : 'Não foi possível baixar o arquivo ZIP.'
      );
    } finally {
      setDownloadingBundle(false);
    }
  };

  useEffect(() => {
    setDraftConfig(monetization);
  }, [monetization]);

  useEffect(() => {
    const unsub = subscribeToAdminPushSubscribers(setSubscribers);
    return () => unsub();
  }, []);

  const overrideMap = new Map(catalogOverrides.map((o) => [o.id, o]));
  const builtInIds = new Set(CURATED_WALLPAPERS.map((w) => w.id));

  // Combine built-ins (with overrides applied) + admin-created custom items (including hidden ones)
  const adminCatalogRows: CatalogOverrideRecord[] = [
    ...catalogOverrides.filter((o) => !builtInIds.has(o.id)),
    ...CURATED_WALLPAPERS.map((base) => {
      const ov = overrideMap.get(base.id);
      if (ov) return ov;
      return {
        ...base,
        isHidden: false,
      };
    }),
  ];

  const handleSaveMonetization = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigFeedback(null);

    const clientId = draftConfig.adsense.clientId.trim();
    if (clientId && !isValidAdSenseClientId(clientId)) {
      setConfigFeedback({
        type: 'err',
        text: 'Publisher ID do AdSense inválido. Use o formato ca-pub-XXXXXXXXXXXXXXXX.',
      });
      return;
    }

    for (const [label, slot] of [
      ['Galeria', draftConfig.adsense.gallerySlotId],
      ['Estúdio', draftConfig.adsense.studioSlotId],
      ['Rodapé', draftConfig.adsense.footerSlotId],
    ]) {
      if (slot.trim() && !isValidAdSenseSlotId(slot)) {
        setConfigFeedback({
          type: 'err',
          text: `Slot ID (${label}) inválido. Informe apenas os dígitos numéricos do bloco AdSense.`,
        });
        return;
      }
    }

    if (draftConfig.admob.appId.trim() && !isValidAdMobAppId(draftConfig.admob.appId)) {
      setConfigFeedback({
        type: 'err',
        text: 'AdMob App ID inválido. Use o formato ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY.',
      });
      return;
    }

    for (const [label, unit] of [
      ['Banner', draftConfig.admob.bannerUnitId],
      ['Intersticial', draftConfig.admob.interstitialUnitId],
      ['Premiado', draftConfig.admob.rewardedUnitId],
    ]) {
      if (unit.trim() && !isValidAdMobUnitId(unit)) {
        setConfigFeedback({
          type: 'err',
          text: `Bloco AdMob (${label}) inválido. Use o formato ca-app-pub-XXXXXXXXXXXXXXXX/YYYYYYYYYY.`,
        });
        return;
      }
    }

    setSavingConfig(true);
    try {
      await saveMonetizationConfigInFirestore(user.uid, draftConfig);
      setConfigFeedback({
        type: 'ok',
        text: 'Configurações de anúncios e aviso global publicadas em tempo real para Web e Android.',
      });
    } catch (err) {
      setConfigFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Não foi possível salvar no Firestore.',
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSnippet(key);
      setTimeout(() => setCopiedSnippet(null), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const openNewWallpaperForm = () => {
    setIsNewItem(true);
    setNotifyOnCatalogSave(Boolean(monetization.fcm.enabled && monetization.fcm.autoNotifyOnNewWallpaper));
    setCatalogFeedback(null);
    setEditingItem({
      id: `wp_custom_${Date.now()}`,
      title: '',
      author: 'Atelier Club',
      category: 'Fotografia Editorial',
      tags: ['Minimalista'],
      resolution: '2160 × 3840',
      aspectLabel: '9:16',
      imageUrl: '',
      palette: ['#18181B', '#3F3F46', '#F2B705'],
      cameraSpec: 'Estúdio 4K · Editorial',
      isFeatured: false,
      isHidden: false,
    });
  };

  const openEditWallpaperForm = (row: CatalogOverrideRecord) => {
    setIsNewItem(false);
    setNotifyOnCatalogSave(false);
    setCatalogFeedback(null);
    setEditingItem({ ...row, tags: [...row.tags], palette: [...row.palette] });
  };

  const handleSaveCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    if (!editingItem.title.trim()) {
      setCatalogFeedback('Informe um título para a arte.');
      return;
    }

    const url = (editingItem.imageUrl || '').trim();
    if (url && !url.startsWith('https://') && !url.startsWith('/src/assets/') && !editingItem.recipe) {
      setCatalogFeedback('A URL da imagem deve começar com https:// ou /src/assets/.');
      return;
    }

    setSavingCatalog(true);
    setCatalogFeedback(null);
    try {
      await saveCatalogOverrideInFirestore(user.uid, editingItem);
      if (notifyOnCatalogSave && !editingItem.isHidden && monetization.fcm.enabled) {
        await publishCollectionAlertInFirestore(user.uid, {
          title: `Nova Coleção 4K: ${editingItem.title.trim()}`,
          body: `Novo papel de parede em ${editingItem.category} (${editingItem.resolution}) disponível gratuitamente no Atelier Club.`,
          category: editingItem.category,
          wallpaperId: editingItem.id,
          imageUrl: editingItem.imageUrl || '',
        });
      }
      setEditingItem(null);
      setCatalogFeedback(
        notifyOnCatalogSave && !editingItem.isHidden && monetization.fcm.enabled
          ? 'Alteração publicada no catálogo 4K e notificação Push disparada aos usuários.'
          : 'Alteração publicada imediatamente no catálogo 4K.'
      );
    } catch (err) {
      setCatalogFeedback(err instanceof Error ? err.message : 'Erro ao salvar item.');
    } finally {
      setSavingCatalog(false);
    }
  };

  const handlePublishPushAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setPushFeedback(null);
    if (!pushTitle.trim() || !pushBody.trim()) {
      setPushFeedback({
        type: 'err',
        text: 'Preencha o título e a mensagem da notificação.',
      });
      return;
    }
    const chosenWallpaper = mergedWallpapers.find((w) => w.id === pushWallpaperId);
    setSendingPush(true);
    try {
      await publishCollectionAlertInFirestore(user.uid, {
        title: pushTitle.trim(),
        body: pushBody.trim(),
        category: pushCategory,
        wallpaperId: chosenWallpaper?.id || '',
        imageUrl: chosenWallpaper?.imageUrl || '',
      });
      setPushTitle('');
      setPushBody('');
      setPushWallpaperId('');
      setPushFeedback({
        type: 'ok',
        text: 'Notificação publicada! Usuários inscritos recebem o alerta imediatamente.',
      });
    } catch (err) {
      setPushFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Erro ao publicar notificação.',
      });
    } finally {
      setSendingPush(false);
    }
  };

  const handleQuickToggleHidden = async (row: CatalogOverrideRecord) => {
    setSavingCatalog(true);
    try {
      await saveCatalogOverrideInFirestore(user.uid, {
        ...row,
        isHidden: !row.isHidden,
      });
    } finally {
      setSavingCatalog(false);
    }
  };

  const handleRevertOrDeleteCatalog = async (id: string) => {
    setSavingCatalog(true);
    try {
      await deleteCatalogOverrideInFirestore(id);
      if (editingItem?.id === id) setEditingItem(null);
      setCatalogFeedback(
        builtInIds.has(id)
          ? 'Item restaurado ao padrão original do catálogo.'
          : 'Item customizado removido do catálogo.'
      );
    } finally {
      setSavingCatalog(false);
    }
  };

  const adsTxtSnippet = draftConfig.adsense.clientId.trim()
    ? `google.com, ${draftConfig.adsense.clientId.trim().replace('ca-', '')}, DIRECT, f08c47fec0942fa0`
    : 'google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0';

  const manifestSnippet = `<meta-data\n  android:name="com.google.android.gms.ads.APPLICATION_ID"\n  android:value="${
    draftConfig.admob.appId.trim() || GOOGLE_TEST_ADMOB_IDS.appId
  }" />`;

  return (
    <div className="space-y-8">
      {/* Editorial Admin Header */}
      <section className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-[#F2B705]">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Modo Administrador Verificado</span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span className="font-mono text-zinc-400">
              {user.email || BOOTSTRAPPED_ADMIN_EMAIL}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-zinc-50">
            Painel Administrativo &amp; Monetização
          </h1>
          <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
            Gerencie blocos pagos do Google AdSense (Web) e Google AdMob (APK Android), publique correções instantâneas no catálogo 4K e controle avisos globais sem recompilar o aplicativo.
          </p>
          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadFullBundle}
              disabled={downloadingBundle}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs hover:bg-[#eab308] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {downloadingBundle ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>
                {downloadingBundle
                  ? 'Compactando pacote...'
                  : 'Baixar Projeto Completo (.ZIP)'}
              </span>
            </button>
            <span className="text-[11px] text-zinc-400">
              Inclui código-fonte + guia de hospedagem, DNS e SSL
            </span>
          </div>
          {bundleError && (
            <p className="text-xs text-red-300 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2 max-w-xl">
              {bundleError}
            </p>
          )}
        </div>

        {/* Summary Metrics */}
        <div className="grid grid-cols-3 gap-4 shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-800 pt-4 lg:pt-0 lg:pl-6">
          <div>
            <p className="text-[11px] text-zinc-500">Monetização</p>
            <p className="font-mono text-sm font-semibold text-zinc-100 mt-0.5 tabular-nums">
              {draftConfig.adsEnabled ? 'Ativa' : 'Pausada'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Catálogo Visível</p>
            <p className="font-mono text-sm font-semibold text-zinc-100 mt-0.5 tabular-nums">
              {mergedWallpapers.length} artes
            </p>
          </div>
          <div>
            <p className="text-[11px] text-zinc-500">Overrides Nuvem</p>
            <p className="font-mono text-sm font-semibold text-zinc-100 mt-0.5 tabular-nums">
              {catalogOverrides.length}
            </p>
          </div>
        </div>
      </section>

      {/* Section Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800/80 pb-4">
        <button
          type="button"
          onClick={() => setSection('ads')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === 'ads'
              ? 'bg-[#F2B705] text-zinc-950 font-semibold'
              : 'bg-[#111115] border border-zinc-800 text-zinc-300 hover:text-zinc-100'
          }`}
        >
          Anúncios (AdSense &amp; AdMob)
        </button>
        <button
          type="button"
          onClick={() => setSection('catalog')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === 'catalog'
              ? 'bg-[#F2B705] text-zinc-950 font-semibold'
              : 'bg-[#111115] border border-zinc-800 text-zinc-300 hover:text-zinc-100'
          }`}
        >
          Catálogo &amp; Correções
        </button>
        <button
          type="button"
          onClick={() => setSection('push')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === 'push'
              ? 'bg-[#F2B705] text-zinc-950 font-semibold'
              : 'bg-[#111115] border border-zinc-800 text-zinc-300 hover:text-zinc-100'
          }`}
        >
          Notificações Push (FCM)
        </button>
        <button
          type="button"
          onClick={() => setSection('system')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            section === 'system'
              ? 'bg-[#F2B705] text-zinc-950 font-semibold'
              : 'bg-[#111115] border border-zinc-800 text-zinc-300 hover:text-zinc-100'
          }`}
        >
          Aviso Global &amp; Publicação
        </button>
      </div>

      {/* SECTION 1: ADSENSE & ADMOB */}
      {section === 'ads' && (
        <form onSubmit={handleSaveMonetization} className="space-y-6">
          {/* Global Toggle */}
          <div className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-zinc-100">
                Interruptor Mestre de Propagandas Pagas
              </h2>
              <p className="text-xs text-zinc-400">
                Quando ativado, habilita a exibição de blocos configurados do AdSense na Web e AdMob no APK Android para todos os usuários.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setDraftConfig((prev) => ({ ...prev, adsEnabled: !prev.adsEnabled }))
              }
              className={`px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                draftConfig.adsEnabled
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'bg-[#16161B] border border-zinc-700 text-zinc-300'
              }`}
            >
              {draftConfig.adsEnabled ? 'Anúncios Ativados' : 'Anúncios Desativados'}
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Google AdSense Web */}
            <div className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-zinc-100">
                    Google AdSense (Web)
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Carregamento assíncrono oficial de blocos responsivos no navegador.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      adsense: { ...prev.adsense, enabled: !prev.adsense.enabled },
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 ${
                    draftConfig.adsense.enabled
                      ? 'bg-[#F2B705] text-zinc-950'
                      : 'bg-[#16161B] border border-zinc-700 text-zinc-400'
                  }`}
                >
                  {draftConfig.adsense.enabled ? 'Web Ligado' : 'Web Desligado'}
                </button>
              </div>

              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs text-zinc-300">
                    Publisher ID (AdSense Client ID)
                  </span>
                  <input
                    type="text"
                    value={draftConfig.adsense.clientId}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        adsense: { ...prev.adsense, clientId: e.target.value },
                      }))
                    }
                    placeholder="ca-pub-0000000000000000"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs text-zinc-300">Slot Galeria</span>
                    <input
                      type="text"
                      value={draftConfig.adsense.gallerySlotId}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          adsense: { ...prev.adsense, gallerySlotId: e.target.value },
                        }))
                      }
                      placeholder="1234567890"
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs text-zinc-300">Slot Estúdio</span>
                    <input
                      type="text"
                      value={draftConfig.adsense.studioSlotId}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          adsense: { ...prev.adsense, studioSlotId: e.target.value },
                        }))
                      }
                      placeholder="2345678901"
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs text-zinc-300">Slot Rodapé</span>
                    <input
                      type="text"
                      value={draftConfig.adsense.footerSlotId}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          adsense: { ...prev.adsense, footerSlotId: e.target.value },
                        }))
                      }
                      placeholder="3456789012"
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2.5 text-xs text-zinc-300 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.adsense.autoAds}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        adsense: { ...prev.adsense, autoAds: e.target.checked },
                      }))
                    }
                    className="rounded border-zinc-700 bg-[#0B0B0E] accent-[#F2B705]"
                  />
                  <span>Carregar script Auto Ads do AdSense automaticamente</span>
                </label>
              </div>

              <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">
                    Linha para arquivo <span className="font-mono">/public/ads.txt</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('adstxt', adsTxtSnippet)}
                    className="inline-flex items-center gap-1 text-[11px] text-[#F2B705] hover:underline"
                  >
                    {copiedSnippet === 'adstxt' ? (
                      <>
                        <Check className="w-3 h-3" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copiar ads.txt
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-2.5 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto">
                  {adsTxtSnippet}
                </pre>
              </div>
            </div>

            {/* Google AdMob Android */}
            <div className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-[#F2B705]" />
                    <h3 className="text-base font-semibold text-zinc-100">
                      Google AdMob (APK Android)
                    </h3>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Integração nativa via ponte Capacitor (@capacitor-community/admob).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      admob: { ...prev.admob, enabled: !prev.admob.enabled },
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 ${
                    draftConfig.admob.enabled
                      ? 'bg-[#F2B705] text-zinc-950'
                      : 'bg-[#16161B] border border-zinc-700 text-zinc-400'
                  }`}
                >
                  {draftConfig.admob.enabled ? 'Android Ligado' : 'Android Desligado'}
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draftConfig.admob.testMode}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        admob: { ...prev.admob, testMode: e.target.checked },
                      }))
                    }
                    className="rounded border-zinc-700 bg-[#0B0B0E] accent-[#F2B705]"
                  />
                  <span>Modo de Teste (usa blocos de teste do Google no APK)</span>
                </label>

                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      admob: {
                        ...prev.admob,
                        ...GOOGLE_TEST_ADMOB_IDS,
                        testMode: true,
                      },
                    }))
                  }
                  className="text-[11px] text-[#F2B705] hover:underline"
                >
                  Preencher IDs de teste oficiais
                </button>
              </div>

              <div className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs text-zinc-300">AdMob App ID</span>
                  <input
                    type="text"
                    value={draftConfig.admob.appId}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({
                        ...prev,
                        admob: { ...prev.admob, appId: e.target.value },
                      }))
                    }
                    placeholder="ca-app-pub-3940256099942544~3347511713"
                    className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs text-zinc-300">Banner Unit ID</span>
                    <input
                      type="text"
                      value={draftConfig.admob.bannerUnitId}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          admob: { ...prev.admob, bannerUnitId: e.target.value },
                        }))
                      }
                      placeholder="ca-app-pub-.../6300978111"
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs text-zinc-300">Intersticial Unit ID</span>
                    <input
                      type="text"
                      value={draftConfig.admob.interstitialUnitId}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          admob: { ...prev.admob, interstitialUnitId: e.target.value },
                        }))
                      }
                      placeholder="ca-app-pub-.../1033173712"
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs text-zinc-300">Premiado (Rewarded) ID</span>
                    <input
                      type="text"
                      value={draftConfig.admob.rewardedUnitId}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          admob: { ...prev.admob, rewardedUnitId: e.target.value },
                        }))
                      }
                      placeholder="ca-app-pub-.../5224354917"
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs text-zinc-300">
                      Intervalo Intersticial (minutos)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={draftConfig.admob.frequencyMinutes}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          admob: {
                            ...prev.admob,
                            frequencyMinutes: Number(e.target.value) || 5,
                          },
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                    />
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">
                    Tag para <span className="font-mono">android/app/src/main/AndroidManifest.xml</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('manifest', manifestSnippet)}
                    className="inline-flex items-center gap-1 text-[11px] text-[#F2B705] hover:underline"
                  >
                    {copiedSnippet === 'manifest' ? (
                      <>
                        <Check className="w-3 h-3" /> Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copiar XML
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-2.5 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-[11px] font-mono text-zinc-300 overflow-x-auto">
                  {manifestSnippet}
                </pre>
              </div>
            </div>
          </div>

          {/* Developer PIX Donation Config */}
          <div className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-[#F2B705]" />
                  <h3 className="text-base font-semibold text-zinc-100">
                    Doação PIX ao Desenvolvedor (Pós-Geração)
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Exibe convite opcional (R$ 0,99, R$ 4,99 ou valor definido ≥ R$ 0,99) com QR Code PIX e logo Atelier Club após gerar ou baixar imagens.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onPreviewDonation && (
                  <button
                    type="button"
                    onClick={onPreviewDonation}
                    className="px-3 py-1.5 rounded-lg bg-[#16161B] border border-zinc-700 text-xs text-zinc-200 hover:border-[#F2B705] transition-colors"
                  >
                    Testar Modal PIX
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      donation: { ...prev.donation, enabled: !prev.donation.enabled },
                    }))
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                    draftConfig.donation.enabled
                      ? 'bg-[#F2B705] text-zinc-950'
                      : 'bg-[#16161B] border border-zinc-700 text-zinc-400'
                  }`}
                >
                  {draftConfig.donation.enabled ? 'Doação Ativa' : 'Doação Oculta'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-300">Chave PIX (E-mail, CPF, CNPJ, Tel ou Aleatória)</span>
                <input
                  type="text"
                  maxLength={120}
                  value={draftConfig.donation.pixKey}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      donation: { ...prev.donation, pixKey: e.target.value },
                    }))
                  }
                  placeholder="miqueiasmelouber@gmail.com"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-300">Nome do Favorecido (máx. 25)</span>
                <input
                  type="text"
                  maxLength={25}
                  value={draftConfig.donation.recipientName}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      donation: { ...prev.donation, recipientName: e.target.value },
                    }))
                  }
                  placeholder="Atelier Club"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-300">Cidade (máx. 15)</span>
                <input
                  type="text"
                  maxLength={15}
                  value={draftConfig.donation.recipientCity}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      donation: { ...prev.donation, recipientCity: e.target.value },
                    }))
                  }
                  placeholder="SAO PAULO"
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs text-zinc-300">Mensagem de Agradecimento pós-pagamento</span>
              <input
                type="text"
                maxLength={240}
                value={draftConfig.donation.thankYouMessage}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    donation: { ...prev.donation, thankYouMessage: e.target.value },
                  }))
                }
                className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
              />
            </label>
          </div>

          {configFeedback && (
            <div
              className={`rounded-xl px-4 py-3 text-xs border ${
                configFeedback.type === 'ok'
                  ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                  : 'bg-red-950/50 border-red-900 text-red-200'
              }`}
            >
              {configFeedback.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#eab308] transition-colors disabled:opacity-50"
            >
              {savingConfig ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Salvar Configurações</span>
            </button>
          </div>
        </form>
      )}

      {/* SECTION 2: CATALOG HOTFIXES & ADDITIONS */}
      {section === 'catalog' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                Editor Remoto do Catálogo 4K
              </h2>
              <p className="text-xs text-zinc-400">
                Adicione novos papéis de parede, corrija títulos/categorias/URLs ou oculte itens instantaneamente sem atualizar o APK.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewWallpaperForm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs sm:text-sm hover:bg-[#eab308] transition-colors shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar Wallpaper 4K</span>
            </button>
          </div>

          {catalogFeedback && (
            <div className="rounded-xl px-4 py-3 text-xs bg-[#16161B] border border-zinc-700 text-zinc-200">
              {catalogFeedback}
            </div>
          )}

          {editingItem && (
            <form
              onSubmit={handleSaveCatalogItem}
              className="rounded-2xl bg-[#111115] border border-[#F2B705]/50 p-6 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-100">
                  {isNewItem ? 'Novo Papel de Parede 4K' : `Editando: ${editingItem.title}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="text-xs text-zinc-400 hover:text-zinc-100"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <label className="block space-y-1">
                  <span className="text-xs text-zinc-300">Título</span>
                  <input
                    type="text"
                    required
                    value={editingItem.title}
                    onChange={(e) =>
                      setEditingItem((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                    }
                    placeholder="Ex: Horizonte Dourado 4K"
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-zinc-300">Autor / Coleção</span>
                  <input
                    type="text"
                    required
                    value={editingItem.author}
                    onChange={(e) =>
                      setEditingItem((prev) => (prev ? { ...prev, author: e.target.value } : prev))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-zinc-300">Categoria</span>
                  <select
                    value={editingItem.category}
                    onChange={(e) =>
                      setEditingItem((prev) =>
                        prev
                          ? { ...prev, category: e.target.value as WallpaperItem['category'] }
                          : prev
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-zinc-300">Resolução</span>
                  <input
                    type="text"
                    value={editingItem.resolution}
                    onChange={(e) =>
                      setEditingItem((prev) =>
                        prev ? { ...prev, resolution: e.target.value } : prev
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-zinc-300">Proporção</span>
                  <select
                    value={editingItem.aspectLabel}
                    onChange={(e) =>
                      setEditingItem((prev) =>
                        prev ? { ...prev, aspectLabel: e.target.value } : prev
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  >
                    <option value="9:16">9:16 (Celular)</option>
                    <option value="16:9">16:9 (Desktop)</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs text-zinc-300">Câmera / Ficha Técnica</span>
                  <input
                    type="text"
                    value={editingItem.cameraSpec}
                    onChange={(e) =>
                      setEditingItem((prev) =>
                        prev ? { ...prev, cameraSpec: e.target.value } : prev
                      )
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  />
                </label>
              </div>

              <label className="block space-y-1">
                <span className="text-xs text-zinc-300">
                  URL da Imagem (https://... ou /src/assets/...)
                </span>
                <input
                  type="text"
                  value={editingItem.imageUrl || ''}
                  onChange={(e) =>
                    setEditingItem((prev) =>
                      prev ? { ...prev, imageUrl: e.target.value } : prev
                    )
                  }
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                />
              </label>

              <div className="space-y-1.5">
                <span className="text-xs text-zinc-300 block">Filtros Rápidos (Tags)</span>
                <div className="flex flex-wrap gap-2">
                  {ALL_TAGS.map((tag) => {
                    const active = editingItem.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setEditingItem((prev) => {
                            if (!prev) return prev;
                            const nextTags = active
                              ? prev.tags.filter((t) => t !== tag)
                              : [...prev.tags, tag].slice(0, 6);
                            return { ...prev, tags: nextTags };
                          })
                        }
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                          active
                            ? 'bg-[#F2B705] text-zinc-950'
                            : 'bg-[#16161B] border border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-800">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingItem.isHidden}
                      onChange={(e) =>
                        setEditingItem((prev) =>
                          prev ? { ...prev, isHidden: e.target.checked } : prev
                        )
                      }
                      className="accent-[#F2B705]"
                    />
                    <span>Ocultar este item da galeria pública</span>
                  </label>

                  {!editingItem.isHidden && monetization.fcm.enabled && (
                    <label className="flex items-center gap-2 text-xs text-[#F2B705] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifyOnCatalogSave}
                        onChange={(e) => setNotifyOnCatalogSave(e.target.checked)}
                        className="accent-[#F2B705]"
                      />
                      <span>Notificar usuários (Push FCM) ao salvar</span>
                    </label>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingCatalog}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs hover:bg-[#eab308] disabled:opacity-50"
                >
                  {savingCatalog ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar no Catálogo</span>
                </button>
              </div>
            </form>
          )}

          {/* Catalog Table */}
          <div className="rounded-2xl bg-[#111115] border border-zinc-800/90 overflow-hidden">
            <div className="divide-y divide-zinc-800/80">
              {adminCatalogRows.map((row) => {
                const hasOverride = overrideMap.has(row.id);
                const isCustom = !builtInIds.has(row.id);
                return (
                  <div
                    key={row.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#16161B]/60 transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                        <span className={row.isHidden ? 'line-through text-zinc-500' : ''}>
                          {row.title}
                        </span>
                        {hasOverride && (
                          <span className="text-[11px] font-mono text-[#F2B705]">
                            {isCustom ? '· Custom' : '· Editado'}
                          </span>
                        )}
                        {row.isHidden && (
                          <span className="text-[11px] text-red-400">· Oculto</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 flex flex-wrap items-center gap-2">
                        <span>{row.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{row.aspectLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span>{row.tags.join(', ') || 'Sem tags'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditWallpaperForm(row)}
                        className="px-3 py-1.5 rounded-lg bg-[#16161B] border border-zinc-700 text-xs text-zinc-200 hover:border-zinc-500"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickToggleHidden(row)}
                        disabled={savingCatalog}
                        title={row.isHidden ? 'Mostrar na galeria' : 'Ocultar da galeria'}
                        className="p-2 rounded-lg bg-[#16161B] border border-zinc-800 text-zinc-300 hover:border-zinc-600"
                      >
                        {row.isHidden ? (
                          <Eye className="w-3.5 h-3.5" />
                        ) : (
                          <EyeOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {hasOverride && (
                        <button
                          type="button"
                          onClick={() => handleRevertOrDeleteCatalog(row.id)}
                          disabled={savingCatalog}
                          title={isCustom ? 'Excluir item' : 'Restaurar padrão original'}
                          className="p-2 rounded-lg bg-[#16161B] border border-zinc-800 text-red-300 hover:border-red-700"
                        >
                          {isCustom ? (
                            <Trash2 className="w-3.5 h-3.5" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: FIREBASE CLOUD MESSAGING (PUSH NOTIFICATIONS) */}
      {section === 'push' && (
        <div className="space-y-6">
          {/* Subscriber Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl bg-[#111115] border border-zinc-800/90 p-4">
              <p className="text-[11px] text-zinc-400">Inscritos Ativos</p>
              <p className="font-mono text-xl font-semibold text-zinc-100 mt-1 tabular-nums">
                {subscribers.filter((s) => s.enabled).length}
              </p>
            </div>
            <div className="rounded-xl bg-[#111115] border border-zinc-800/90 p-4">
              <p className="text-[11px] text-zinc-400">Dispositivos Web</p>
              <p className="font-mono text-xl font-semibold text-zinc-100 mt-1 tabular-nums">
                {subscribers.filter((s) => s.enabled && s.platform === 'web').length}
              </p>
            </div>
            <div className="rounded-xl bg-[#111115] border border-zinc-800/90 p-4">
              <p className="text-[11px] text-zinc-400">Android APK</p>
              <p className="font-mono text-xl font-semibold text-zinc-100 mt-1 tabular-nums">
                {subscribers.filter((s) => s.enabled && s.platform === 'android').length}
              </p>
            </div>
            <div className="rounded-xl bg-[#111115] border border-zinc-800/90 p-4">
              <p className="text-[11px] text-zinc-400">Alertas Publicados</p>
              <p className="font-mono text-xl font-semibold text-zinc-100 mt-1 tabular-nums">
                {collectionAlerts.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Composer: Send New Collection Push */}
            <form
              onSubmit={handlePublishPushAlert}
              className="lg:col-span-7 rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#F2B705]" />
                <h2 className="text-base font-semibold text-zinc-100">
                  Avisar sobre Nova Coleção de Papéis de Parede
                </h2>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Publica um alerta instantâneo para todos os usuários que ativaram notificações na Web e no Android APK.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block space-y-1.5">
                  <span className="text-xs text-zinc-300">Título da Notificação</span>
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={pushTitle}
                    onChange={(e) => setPushTitle(e.target.value)}
                    placeholder="Ex: Nova Coleção Cinéfilo 4K"
                    className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  />
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs text-zinc-300">Categoria de Destino</span>
                  <select
                    value={pushCategory}
                    onChange={(e) =>
                      setPushCategory(e.target.value as CollectionAlertRecord['category'])
                    }
                    className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  >
                    <option value="Todos">Todas as Categorias</option>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-300">Mensagem (máx. 240 caracteres)</span>
                <textarea
                  rows={3}
                  required
                  maxLength={240}
                  value={pushBody}
                  onChange={(e) => setPushBody(e.target.value)}
                  placeholder="Ex: 6 novos papéis de parede 4K com iluminação de estúdio acabam de chegar ao catálogo."
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-300">Imagem de Destaque (opcional)</span>
                <select
                  value={pushWallpaperId}
                  onChange={(e) => setPushWallpaperId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                >
                  <option value="">Sem imagem específica (ícone Atelier Club)</option>
                  {mergedWallpapers
                    .filter((w) => Boolean(w.imageUrl))
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title} ({w.category})
                      </option>
                    ))}
                </select>
              </label>

              {pushFeedback && (
                <div
                  className={`rounded-xl px-4 py-2.5 text-xs border ${
                    pushFeedback.type === 'ok'
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                      : 'bg-red-950/50 border-red-900 text-red-200'
                  }`}
                >
                  {pushFeedback.text}
                </div>
              )}

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={sendingPush}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs sm:text-sm hover:bg-[#eab308] disabled:opacity-50"
                >
                  {sendingPush ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Publicar Notificação</span>
                </button>
              </div>
            </form>

            {/* FCM Configuration & VAPID */}
            <form
              onSubmit={handleSaveMonetization}
              className="lg:col-span-5 rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-zinc-100">
                  Configuração FCM (Web &amp; Android)
                </h2>
                <button
                  type="button"
                  onClick={() =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      fcm: { ...prev.fcm, enabled: !prev.fcm.enabled },
                    }))
                  }
                  className={`px-3 py-1 rounded-lg text-xs font-semibold shrink-0 ${
                    draftConfig.fcm.enabled
                      ? 'bg-[#F2B705] text-zinc-950'
                      : 'bg-[#16161B] border border-zinc-700 text-zinc-400'
                  }`}
                >
                  {draftConfig.fcm.enabled ? 'FCM Ativo' : 'Pausado'}
                </button>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-300">
                  Chave VAPID Web Push (Firebase Console → Cloud Messaging)
                </span>
                <input
                  type="text"
                  maxLength={200}
                  value={draftConfig.fcm.vapidKey}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      fcm: { ...prev.fcm, vapidKey: e.target.value },
                    }))
                  }
                  placeholder="Ex: BEl62iUYgUivxIkv69yViEuiBIa..."
                  className="w-full px-3.5 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
                />
              </label>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draftConfig.fcm.autoNotifyOnNewWallpaper}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      fcm: {
                        ...prev.fcm,
                        autoNotifyOnNewWallpaper: e.target.checked,
                      },
                    }))
                  }
                  className="accent-[#F2B705]"
                />
                <span>Marcar envio automático ao adicionar novo wallpaper no Catálogo</span>
              </label>

              {configFeedback && (
                <div
                  className={`rounded-xl px-3.5 py-2 text-xs border ${
                    configFeedback.type === 'ok'
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                      : 'bg-red-950/50 border-red-900 text-red-200'
                  }`}
                >
                  {configFeedback.text}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
                <button
                  type="button"
                  onClick={() => {
                    const realTokens = subscribers
                      .filter((s) => s.enabled && !s.token.startsWith('web_live_'))
                      .map((s) => ({ platform: s.platform, token: s.token }));
                    handleCopyText('fcmTokens', JSON.stringify(realTokens, null, 2));
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-zinc-300 hover:text-[#F2B705]"
                >
                  {copiedSnippet === 'fcmTokens' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Tokens copiados</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar Tokens FCM</span>
                    </>
                  )}
                </button>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs hover:bg-[#eab308] disabled:opacity-50"
                >
                  {savingConfig ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Salvar FCM</span>
                </button>
              </div>

              <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
                Alertas em tempo real e notificações Web funcionam imediatamente no app aberto. Para disparo em segundo plano com o navegador fechado, preencha a Chave VAPID acima e utilize o Firebase Console Messaging (ou faça upgrade do projeto no Firebase para Cloud Functions).
              </p>
            </form>
          </div>

          {/* Published Alerts History */}
          <div className="rounded-2xl bg-[#111115] border border-zinc-800/90 overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-100">
                Histórico de Alertas de Coleções
              </h3>
              <span className="text-xs font-mono text-zinc-500 tabular-nums">
                {collectionAlerts.length} recentes
              </span>
            </div>
            {collectionAlerts.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-zinc-500">
                Nenhuma notificação de coleção publicada ainda.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {collectionAlerts.map((al) => (
                  <div
                    key={al.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-[#16161B]/60 transition-colors"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-zinc-100 truncate">{al.title}</p>
                      <p className="text-xs text-zinc-400 truncate">{al.body}</p>
                      <p className="text-[11px] text-zinc-500 font-mono tabular-nums">
                        {al.category} · {new Date(al.createdAtMs).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteCollectionAlertInFirestore(al.id)}
                      title="Excluir alerta"
                      className="p-2 rounded-lg bg-[#16161B] border border-zinc-800 text-red-300 hover:border-red-700 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: ANNOUNCEMENT BANNER & PRODUCTION CHECKLIST */}
      {section === 'system' && (
        <form onSubmit={handleSaveMonetization} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">
                  Aviso Global no Topo do App
                </h2>
                <p className="text-xs text-zinc-400">
                  Exiba comunicados rápidos, novidades ou avisos de manutenção para todos os usuários.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    announcementBanner: {
                      ...prev.announcementBanner,
                      enabled: !prev.announcementBanner.enabled,
                    },
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 ${
                  draftConfig.announcementBanner.enabled
                    ? 'bg-[#F2B705] text-zinc-950'
                    : 'bg-[#16161B] border border-zinc-700 text-zinc-400'
                }`}
              >
                {draftConfig.announcementBanner.enabled ? 'Ativo' : 'Oculto'}
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs text-zinc-300">Mensagem do aviso (máx. 240 caracteres)</span>
              <textarea
                rows={3}
                maxLength={240}
                value={draftConfig.announcementBanner.text}
                onChange={(e) =>
                  setDraftConfig((prev) => ({
                    ...prev,
                    announcementBanner: {
                      ...prev.announcementBanner,
                      text: e.target.value,
                    },
                  }))
                }
                placeholder="Ex: Nova coleção 4K Cinéfilo disponível no Estúdio Fotográfico."
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-[#F2B705]"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-300">Texto do botão</span>
                <input
                  type="text"
                  maxLength={40}
                  value={draftConfig.announcementBanner.ctaLabel}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      announcementBanner: {
                        ...prev.announcementBanner,
                        ctaLabel: e.target.value,
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs text-zinc-300">Aba de destino</span>
                <select
                  value={draftConfig.announcementBanner.targetTab}
                  onChange={(e) =>
                    setDraftConfig((prev) => ({
                      ...prev,
                      announcementBanner: {
                        ...prev.announcementBanner,
                        targetTab: e.target.value as MonetizationConfig['announcementBanner']['targetTab'],
                      },
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0B0E] border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                >
                  <option value="gallery">Galeria 4K</option>
                  <option value="templates">Modelos IA</option>
                  <option value="background">Criar Fundo</option>
                  <option value="photo">Estúdio Foto</option>
                </select>
              </label>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingConfig}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs hover:bg-[#eab308] disabled:opacity-50"
              >
                {savingConfig ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Publicar Aviso Global</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-6 space-y-4">
            <h2 className="text-base font-semibold text-zinc-100">
              Checklist de Publicação &amp; Segurança
            </h2>
            <ul className="space-y-2.5 text-xs text-zinc-300 leading-relaxed">
              <li className="border-b border-zinc-800/70 pb-2.5">
                <strong className="text-zinc-100">Conta Admin vinculada:</strong> acesso restrito exclusivamente ao e-mail Google verificado{' '}
                <span className="font-mono text-[#F2B705]">{BOOTSTRAPPED_ADMIN_EMAIL}</span> nas regras do Firestore.
              </li>
              <li className="border-b border-zinc-800/70 pb-2.5">
                <strong className="text-zinc-100">Domínios no Firebase Auth:</strong> ao publicar em produção (Render/Koyeb/domínio próprio), adicione a URL em Firebase Console → Authentication → Settings → Authorized domains.
              </li>
              <li className="border-b border-zinc-800/70 pb-2.5">
                <strong className="text-zinc-100">AdSense Web:</strong> adicione o arquivo <span className="font-mono">ads.txt</span> na raiz pública e preencha Publisher ID + Slot IDs na aba Anúncios.
              </li>
              <li>
                <strong className="text-zinc-100">AdMob Android APK:</strong> ao gerar o APK via Capacitor, instale <span className="font-mono">@capacitor-community/admob</span> e cole a tag <span className="font-mono">APPLICATION_ID</span> no <span className="font-mono">AndroidManifest.xml</span>.
              </li>
            </ul>

            <div className="pt-4 border-t border-zinc-800/80 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-zinc-100">
                    Pacote Completo do Projeto (.ZIP)
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Inclui todo o código do Atelier Club + guia <span className="font-mono">GUIA_HOSPEDAGEM_E_DOMINIO.md</span>.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadFullBundle}
                  disabled={downloadingBundle}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs hover:bg-[#eab308] disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {downloadingBundle ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {downloadingBundle ? 'Compactando ZIP...' : 'Baixar Atelier Club (.ZIP)'}
                  </span>
                </button>
              </div>
              {bundleError && (
                <p className="text-xs text-red-300 bg-red-950/50 border border-red-900 rounded-lg px-3 py-2">
                  {bundleError}
                </p>
              )}
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
