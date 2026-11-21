import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  Download,
  Heart,
  Layers,
  Maximize2,
  Monitor,
  Search,
  Share2,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import {
  HERO_BACKDROP_URL,
  SAMPLE_PORTRAIT_URL,
  STARTER_EDITABLE_TEMPLATES,
  STUDIO_BACKDROP_PRESETS,
} from '../data/catalog';
import {
  exportBackgroundRecipeAsDataUrl,
  loadImageCached,
  triggerDataUrlDownload,
} from '../lib/studioRenderer';
import {
  AppTab,
  MonetizationConfig,
  QuickFilterTag,
  StudioBackgroundRecipe,
  WallpaperItem,
} from '../types/studio';
import { AdBannerSlot } from './AdBannerSlot';
import { ProceduralBackdropPreview } from './ProceduralBackdropPreview';

interface WallpaperGalleryViewProps {
  wallpapers: WallpaperItem[];
  favorites: string[];
  monetization: MonetizationConfig;
  isAdmin: boolean;
  pushEnabled?: boolean;
  pushBusy?: boolean;
  pushFeedback?: string | null;
  externalCategoryFilter?: (typeof CATEGORIES)[number] | null;
  onTogglePushNotifications?: () => void;
  onOpenAdmin?: () => void;
  onImageGenerated?: (contextLabel: string) => void;
  onToggleFavorite: (id: string) => void;
  onNavigateTab: (tab: AppTab) => void;
  onUseAsStudioBackground: (recipe: StudioBackgroundRecipe) => void;
  onShareWallpaper: (title: string, dataUrl: string) => void;
}

const CATEGORIES = [
  'Todos',
  'Fotografia Editorial',
  'Estúdio & Luz',
  'Abstrato & Seda',
  'Arquitetura',
  'Minimalista Noturno',
  'Favoritos',
] as const;

const QUICK_STYLE_FILTERS: QuickFilterTag[] = [
  'Minimalista',
  'Cinéfilo',
  'Vintage',
  'AMOLED',
  'Arquitetônico',
  'Solar',
];

export const WallpaperGalleryView: React.FC<WallpaperGalleryViewProps> = ({
  wallpapers,
  favorites,
  monetization,
  isAdmin,
  pushEnabled = false,
  pushBusy = false,
  pushFeedback = null,
  externalCategoryFilter = null,
  onTogglePushNotifications,
  onOpenAdmin,
  onImageGenerated,
  onToggleFavorite,
  onNavigateTab,
  onUseAsStudioBackground,
  onShareWallpaper,
}) => {
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>('Todos');
  const [activeQuickTag, setActiveQuickTag] = useState<QuickFilterTag | 'all'>('all');
  const [aspectFilter, setAspectFilter] = useState<'all' | '9:16' | '16:9'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [heroSlideIdx, setHeroSlideIdx] = useState(0);
  const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperItem | null>(null);
  const [previewMode, setPreviewMode] = useState<'clean' | 'phone' | 'desktop'>('clean');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (externalCategoryFilter) {
      setActiveCategory(externalCategoryFilter);
    }
  }, [externalCategoryFilter]);

  const heroSlides = [
    {
      id: 'wp-studio-cyclorama',
      label: 'Estúdio Travertino',
      kicker: 'Destaque do Estúdio · Ciclorama Solar',
      title: 'Plinto em Travertino & Luz Lateral',
      imageUrl: HERO_BACKDROP_URL,
    },
    {
      id: 'wp-alpine-dusk',
      label: 'Crepúsculo 4K',
      kicker: 'Fotografia Editorial · 2160 × 3840',
      title: 'Crepúsculo nos Picos Basálticos',
      imageUrl: '/src/assets/images/wallpaper_alpine_dusk_1795281546757.jpg',
    },
    {
      id: 'wp-sculptural-silk',
      label: 'Seda Escultural',
      kicker: 'Macro Estúdio · Contraste Puro',
      title: 'Dobras de Seda Escultural',
      imageUrl: '/src/assets/images/wallpaper_sculptural_silk_1795281546412.jpg',
    },
  ];
  const currentHeroSlide = heroSlides[heroSlideIdx] ?? heroSlides[0];

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filtered = wallpapers.filter((item) => {
    if (activeCategory === 'Favoritos' && !favorites.includes(item.id)) return false;
    if (
      activeCategory !== 'Todos' &&
      activeCategory !== 'Favoritos' &&
      item.category !== activeCategory
    ) {
      return false;
    }
    if (activeQuickTag !== 'all' && !item.tags.includes(activeQuickTag)) {
      return false;
    }
    if (aspectFilter !== 'all' && item.aspectLabel !== aspectFilter) {
      return false;
    }
    if (normalizedQuery) {
      const haystack = `${item.title} ${item.category} ${item.cameraSpec} ${item.tags.join(' ')}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });

  const hasActiveFilters =
    activeCategory !== 'Todos' ||
    activeQuickTag !== 'all' ||
    aspectFilter !== 'all' ||
    normalizedQuery.length > 0;

  const resetAllFilters = () => {
    setActiveCategory('Todos');
    setActiveQuickTag('all');
    setAspectFilter('all');
    setSearchQuery('');
  };

  const resolveWallpaperDataUrl = async (item: WallpaperItem): Promise<string> => {
    if (item.recipe) {
      return exportBackgroundRecipeAsDataUrl(item.recipe, 2160, 3840, 'image/png');
    }
    if (item.imageUrl) {
      const img = await loadImageCached(item.imageUrl);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL('image/png');
      }
      return item.imageUrl;
    }
    return '';
  };

  const handleDownload = async (item: WallpaperItem) => {
    setDownloadingId(item.id);
    try {
      const dataUrl = await resolveWallpaperDataUrl(item);
      const slug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      triggerDataUrlDownload(dataUrl, `${slug}-4k.png`);
      onImageGenerated?.(`Papel de parede "${item.title}" baixado em 4K!`);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSendToPhotoStudio = (item: WallpaperItem) => {
    if (item.recipe) {
      onUseAsStudioBackground(item.recipe);
    } else if (item.imageUrl) {
      onUseAsStudioBackground({
        id: `from-${item.id}`,
        name: item.title,
        description: `${item.category} · ${item.cameraSpec}`,
        patternType: 'cyclorama',
        palette: {
          base: item.palette[0] ?? '#18181B',
          mid: item.palette[1] ?? '#3F3F46',
          highlight: item.palette[2] ?? '#E4E4E7',
          shadow: item.palette[3] ?? '#09090B',
          accent: '#F2B705',
        },
        lighting: { angle: 45, intensity: 70, softness: 70, vignette: 35 },
        texture: { grain: 8, blur: 0, bokehCount: 0 },
        imageUrl: item.imageUrl,
      });
    }
    setSelectedWallpaper(null);
  };

  return (
    <div className="space-y-12">
      {/* Split-Screen Editorial Hero */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl bg-[#111115] border border-zinc-800/90 p-8 lg:p-10">
          <div className="space-y-5">
            <p className="text-xs text-zinc-400 tracking-wide">
              Clube de Papéis de Parede · 100% Gratuito
              {!monetization.adsEnabled ? ' · Sem Propagandas' : ' · Acesso Livre'}
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-zinc-50 leading-[1.08] [text-wrap:balance]">
              Papéis de parede 4K e estúdio criativo com{' '}
              <span className="font-editorial italic font-medium text-[#F2B705]">
                luz de fotografia real.
              </span>
            </h1>
            <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-xl">
              Explore acervos editoriais em alta definição, crie modelos editáveis com inteligência
              artificial, produza planos de fundo personalizados e insira cenários de estúdio nas
              suas fotos prontas para Instagram e Facebook.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-8">
            <button
              onClick={() => onNavigateTab('photo')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors whitespace-nowrap shrink-0"
            >
              <Wand2 className="w-4 h-4" />
              Abrir Estúdio Foto
            </button>
            <button
              onClick={() => onNavigateTab('templates')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100 font-medium text-sm hover:bg-zinc-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Layers className="w-4 h-4" />
              Modelos Editáveis IA
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 relative rounded-2xl overflow-hidden border border-zinc-800/90 min-h-[340px] lg:min-h-[440px] bg-zinc-900">
          {!failedImages[`hero-${currentHeroSlide.id}`] ? (
            <img
              src={currentHeroSlide.imageUrl}
              alt={currentHeroSlide.title}
              referrerPolicy="no-referrer"
              onError={() =>
                setFailedImages((prev) => ({ ...prev, [`hero-${currentHeroSlide.id}`]: true }))
              }
              className="w-full h-full lg:h-full object-cover transition-opacity duration-300"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-stone-800 via-stone-900 to-black flex items-center justify-center p-8 text-stone-300 text-sm">
              {currentHeroSlide.title}
            </div>
          )}

          {/* Top-left subtle scene switcher */}
          <div className="absolute top-4 left-4 flex items-center gap-1 p-1 rounded-lg bg-black/55 backdrop-blur-md border border-white/10">
            {heroSlides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => setHeroSlideIdx(idx)}
                className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                  heroSlideIdx === idx
                    ? 'bg-[#F2B705] text-zinc-950'
                    : 'text-zinc-200 hover:text-white'
                }`}
              >
                {slide.label}
              </button>
            ))}
          </div>

          <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-zinc-300">{currentHeroSlide.kicker}</p>
              <p className="text-base font-semibold text-white mt-0.5">{currentHeroSlide.title}</p>
            </div>
            <button
              onClick={() => {
                const matched = wallpapers.find((w) => w.id === currentHeroSlide.id);
                if (matched) handleSendToPhotoStudio(matched);
              }}
              className="px-3.5 py-2 rounded-lg bg-white/15 backdrop-blur-md border border-white/20 text-xs font-medium text-white hover:bg-white/25 transition-colors whitespace-nowrap shrink-0"
            >
              Usar como Fundo
            </button>
          </div>
        </div>
      </section>

      {/* Full-Width 4-Column Studio Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-[#111115] border border-zinc-800/80 p-5">
          <p className="text-xs text-zinc-400">Resolução Nativa</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1 font-mono-tabular">4K Ultra HD</p>
        </div>
        <div className="rounded-xl bg-[#111115] border border-zinc-800/80 p-5">
          <p className="text-xs text-zinc-400">
            {monetization.adsEnabled ? 'Acesso Aberto' : 'Experiência Limpa'}
          </p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">
            {monetization.adsEnabled ? '100% Gratuito' : 'Zero Propagandas'}
          </p>
        </div>
        <div className="rounded-xl bg-[#111115] border border-zinc-800/80 p-5">
          <p className="text-xs text-zinc-400">Criação Inteligente</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">Modelos Editáveis IA</p>
        </div>
        <div className="rounded-xl bg-[#111115] border border-zinc-800/80 p-5">
          <p className="text-xs text-zinc-400">Exportação Direta</p>
          <p className="text-xl font-semibold text-zinc-100 mt-1">Instagram &amp; Facebook</p>
        </div>
      </section>

      {/* Editorial Bento Suite Showcase */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <p className="text-xs text-[#F2B705]">Suíte Criativa Integrada</p>
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 mt-0.5">
              Tudo o que você pode criar em minutos
            </h2>
          </div>
          <p className="text-xs text-zinc-400">
            Recorte de estúdio · Templates em camadas · Fundos 4K · Formatos sociais
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Primary Bento Anchor: Photo Studio */}
          <div
            onClick={() => onNavigateTab('photo')}
            className="lg:col-span-6 rounded-2xl bg-[#111115] border border-zinc-800/90 overflow-hidden grid grid-cols-1 sm:grid-cols-12 cursor-pointer group hover:border-zinc-600 transition-colors"
          >
            <div className="sm:col-span-5 relative min-h-[240px] bg-zinc-900 overflow-hidden">
              {!failedImages['bento-portrait'] ? (
                <img
                  src={SAMPLE_PORTRAIT_URL}
                  alt="Retrato de estúdio com recorte de fundo"
                  referrerPolicy="no-referrer"
                  onError={() => setFailedImages((prev) => ({ ...prev, 'bento-portrait': true }))}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-400">
                  Estúdio Foto
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
            </div>
            <div className="sm:col-span-7 p-6 flex flex-col justify-between gap-5">
              <div className="space-y-2.5">
                <p className="text-xs text-zinc-400">01. Estúdio Fotográfico</p>
                <h3 className="text-xl font-semibold text-zinc-50 leading-snug">
                  Recorte de sujeito e inserção de planos de fundo estilo estúdio
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Envie sua foto, isole o fundo automaticamente ou refine com pincel, ajuste luz
                  de contorno, sombra no piso e colorimetria assistida por IA.
                </p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
                <span className="text-xs text-[#F2B705] font-medium group-hover:underline">
                  Abrir Estúdio Foto
                </span>
                <span className="text-[11px] font-mono-tabular text-zinc-500">PNG · HD/4K</span>
              </div>
            </div>
          </div>

          {/* Right Bento Column: AI Templates + Background Creator + Social */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Wide top card: AI Editable Templates */}
            <div
              onClick={() => onNavigateTab('templates')}
              className="sm:col-span-2 rounded-2xl bg-[#111115] border border-zinc-800/90 p-5 flex items-center gap-5 cursor-pointer group hover:border-zinc-600 transition-colors"
            >
              <div className="w-24 h-28 rounded-xl overflow-hidden border border-zinc-800 shrink-0 bg-zinc-900">
                <ProceduralBackdropPreview
                  recipe={STARTER_EDITABLE_TEMPLATES[0].background}
                  layers={STARTER_EDITABLE_TEMPLATES[0].layers}
                  width={240}
                  height={280}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs text-zinc-400">02. Modelos Editáveis IA</p>
                <h3 className="text-base font-semibold text-zinc-100">
                  Camadas de texto, arcos e tipografia editorial
                </h3>
                <p className="text-xs text-zinc-400 line-clamp-2">
                  Descreva sua ideia e edite cada texto, fonte, cor e posição diretamente na prancheta.
                </p>
                <p className="text-xs text-[#F2B705] font-medium pt-1 group-hover:underline">
                  Criar Modelo Editável
                </p>
              </div>
            </div>

            {/* Bottom-left: Background Creator */}
            <div
              onClick={() => onNavigateTab('background')}
              className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-5 flex flex-col justify-between gap-4 cursor-pointer group hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-xl overflow-hidden border border-zinc-800 shrink-0">
                  <ProceduralBackdropPreview
                    recipe={STUDIO_BACKDROP_PRESETS[3]}
                    width={140}
                    height={140}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="text-[11px] text-zinc-400">03. Cenários</p>
                  <h3 className="text-sm font-semibold text-zinc-100">Criador de Background</h3>
                </div>
              </div>
              <p className="text-xs text-zinc-400">
                Gere cicloramas, seda, luz arquitetônica e degrades 4K personalizados.
              </p>
              <span className="text-xs text-[#F2B705] font-medium group-hover:underline">
                Criar Fundo 4K
              </span>
            </div>

            {/* Bottom-right: Social Export */}
            <div
              onClick={() => onNavigateTab('templates')}
              className="rounded-2xl bg-[#111115] border border-zinc-800/90 p-5 flex flex-col justify-between gap-4 cursor-pointer group hover:border-zinc-600 transition-colors"
            >
              <div className="space-y-1">
                <p className="text-[11px] text-zinc-400">04. Redes Sociais</p>
                <h3 className="text-sm font-semibold text-zinc-100">
                  Pronto para Instagram e Facebook
                </h3>
              </div>
              <p className="text-xs text-zinc-400">
                Formatos <span className="font-mono-tabular text-zinc-300">4:5</span>,{' '}
                <span className="font-mono-tabular text-zinc-300">9:16</span> e{' '}
                <span className="font-mono-tabular text-zinc-300">1200×630</span> com legenda IA.
              </p>
              <span className="text-xs text-[#F2B705] font-medium group-hover:underline">
                Explorar Formatos
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* AdSense / AdMob Gallery Placement */}
      <AdBannerSlot
        placement="gallery"
        monetization={monetization}
        isAdmin={isAdmin}
        onOpenAdmin={onOpenAdmin}
      />

      {/* Category Filter Toolbar */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-100">
                Curadoria do Clube
              </h2>
              {monetization.fcm.enabled && onTogglePushNotifications && (
                <button
                  type="button"
                  onClick={onTogglePushNotifications}
                  disabled={pushBusy}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 ${
                    pushEnabled
                      ? 'bg-[#16161B] border border-[#F2B705]/50 text-[#F2B705]'
                      : 'bg-[#121216] border border-zinc-800 text-zinc-300 hover:border-zinc-600'
                  }`}
                >
                  {pushEnabled ? (
                    <BellRing className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <Bell className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>
                    {pushBusy
                      ? 'Ativando...'
                      : pushEnabled
                      ? 'Avisos de coleções ativados'
                      : 'Avisar sobre novas coleções'}
                  </span>
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-400">
              {pushFeedback ||
                'Toque em qualquer arte para visualizar no celular, baixar em 4K ou aplicar como fundo de foto.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#F2B705] text-zinc-950'
                      : 'bg-[#121216] text-zinc-400 hover:text-zinc-100 border border-zinc-800/80'
                  }`}
                >
                  {cat}
                  {cat === 'Favoritos' && favorites.length > 0 ? ` (${favorites.length})` : ''}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick Filters Panel */}
        <div className="rounded-xl bg-[#111115] border border-zinc-800/90 p-4 space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 mr-1 whitespace-nowrap">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#F2B705]" />
                Filtros Rápidos:
              </span>
              <button
                onClick={() => setActiveQuickTag('all')}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeQuickTag === 'all'
                    ? 'bg-zinc-100 text-zinc-950'
                    : 'bg-[#09090B] text-zinc-400 hover:text-zinc-100 border border-zinc-800'
                }`}
              >
                Todos os Estilos
              </button>
              {QUICK_STYLE_FILTERS.map((tag) => {
                const isSelected = activeQuickTag === tag;
                const count = wallpapers.filter((w) => w.tags.includes(tag)).length;
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveQuickTag(isSelected ? 'all' : tag)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      isSelected
                        ? 'bg-[#F2B705] text-zinc-950'
                        : 'bg-[#09090B] text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    {tag}{' '}
                    <span className="font-mono-tabular opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar arte 4K..."
                  className="w-48 sm:w-56 rounded-lg bg-[#09090B] border border-zinc-800 pl-8 pr-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#F2B705]"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#09090B] rounded-lg border border-zinc-800">
                {(
                  [
                    ['all', 'Todos'],
                    ['9:16', 'Celular 9:16'],
                    ['16:9', 'Desktop 16:9'],
                  ] as const
                ).map(([ratioId, label]) => (
                  <button
                    key={ratioId}
                    onClick={() => setAspectFilter(ratioId)}
                    className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 ${
                      aspectFilter === ratioId
                        ? 'bg-zinc-800 text-zinc-100'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-zinc-800/70 text-xs text-zinc-400">
            <span>
              Exibindo <strong className="text-zinc-100 font-mono-tabular">{filtered.length}</strong> de{' '}
              <span className="font-mono-tabular">{wallpapers.length}</span> artes 4K disponíveis
            </span>
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="text-xs text-[#F2B705] hover:underline whitespace-nowrap"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {/* Wallpaper Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 py-16 text-center px-6 space-y-3">
            <p className="text-sm font-medium text-zinc-300">
              {activeCategory === 'Favoritos'
                ? 'Nenhum papel de parede salvo em Favoritos corresponde aos filtros.'
                : 'Nenhuma arte 4K encontrada para esta combinação de filtros.'}
            </p>
            <p className="text-xs text-zinc-500">
              Experimente limpar os filtros rápidos ou selecionar outra proporção.
            </p>
            {hasActiveFilters && (
              <button
                onClick={resetAllFilters}
                className="inline-flex items-center px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-100 transition-colors"
              >
                Mostrar Todas as Artes
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {filtered.map((item) => {
              const isFav = favorites.includes(item.id);
              return (
                <article
                  key={item.id}
                  className="group relative rounded-2xl overflow-hidden bg-[#111115] border border-zinc-800/90 flex flex-col"
                >
                  <div
                    onClick={() => {
                      setSelectedWallpaper(item);
                      setPreviewMode('clean');
                    }}
                    className="relative aspect-[9/14] w-full overflow-hidden cursor-pointer bg-zinc-900"
                  >
                    {item.imageUrl && !failedImages[item.id] ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [item.id]: true }))
                        }
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : item.recipe ? (
                      <ProceduralBackdropPreview
                        recipe={item.recipe}
                        width={540}
                        height={840}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center p-6 text-center text-xs text-zinc-300"
                        style={{
                          background: `linear-gradient(135deg, ${item.palette[0] ?? '#18181B'}, ${
                            item.palette[1] ?? '#27272A'
                          })`,
                        }}
                      >
                        {item.title}
                      </div>
                    )}

                    {/* Top hover quick actions */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 opacity-95">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(item.id);
                        }}
                        className={`p-2 rounded-lg backdrop-blur-md border transition-colors ${
                          isFav
                            ? 'bg-[#F2B705] border-[#F2B705] text-zinc-950'
                            : 'bg-black/55 border-white/15 text-white hover:bg-black/75'
                        }`}
                        aria-label={isFav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                      >
                        <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWallpaper(item);
                          setPreviewMode('clean');
                        }}
                        className="p-2 rounded-lg bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/75 transition-colors"
                        aria-label="Visualizar em tela cheia"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Scrim & Unboxed Editorial Metadata */}
                    <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/90 via-black/45 to-transparent">
                      <p className="text-[11px] text-zinc-300">
                        {item.category} · <span className="font-mono-tabular">{item.aspectLabel}</span>
                      </p>
                      <h3 className="text-sm font-semibold text-white mt-0.5 line-clamp-1">
                        {item.title}
                      </h3>
                    </div>
                  </div>

                  {/* Card Footer Controls */}
                  <div className="p-3.5 flex items-center justify-between gap-2 border-t border-zinc-800/80">
                    <span className="text-[11px] font-mono-tabular text-zinc-400 truncate">
                      {item.resolution}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleSendToPhotoStudio(item)}
                        className="px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-[11px] font-medium text-zinc-200 hover:border-zinc-500 transition-colors whitespace-nowrap"
                        title="Inserir como fundo de foto"
                      >
                        Estúdio
                      </button>
                      <button
                        onClick={() => handleDownload(item)}
                        disabled={downloadingId === item.id}
                        className="px-2.5 py-1.5 rounded-md bg-[#F2B705] text-zinc-950 text-[11px] font-semibold hover:bg-[#e5ad04] transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        {downloadingId === item.id ? 'Gerando...' : 'Baixar'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* AI Studio Callout Strip */}
      <section className="rounded-2xl bg-[#111115] border border-zinc-800 p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <p className="text-xs text-[#F2B705] font-medium">Criador Exclusivo Atelier</p>
          <h3 className="text-xl font-semibold text-zinc-100">
            Quer um plano de fundo inédito ou modelo editável?
          </h3>
          <p className="text-sm text-zinc-400 max-w-2xl">
            Descreva o clima, iluminação e cores desejadas para gerar fundos 4K sob medida ou
            templates com textos editáveis prontos para Instagram e Facebook.
          </p>
        </div>
        <button
          onClick={() => onNavigateTab('background')}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-sm hover:bg-white transition-colors whitespace-nowrap shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          Criar Background com IA
        </button>
      </section>

      {/* AdSense / AdMob Footer Placement */}
      <AdBannerSlot
        placement="footer"
        monetization={monetization}
        isAdmin={isAdmin}
        onOpenAdmin={onOpenAdmin}
      />

      {/* Fullscreen Lightbox & Device Preview Modal */}
      {selectedWallpaper && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-label={selectedWallpaper.title}
        >
          <div className="relative w-full max-w-5xl rounded-2xl bg-[#111115] border border-zinc-800 overflow-hidden flex flex-col lg:flex-row max-h-[92vh]">
            <button
              onClick={() => setSelectedWallpaper(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-black/60 text-zinc-200 hover:text-white border border-zinc-700"
              aria-label="Fechar visualização"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Preview Stage */}
            <div className="lg:w-7/12 bg-[#070709] p-6 flex flex-col items-center justify-center min-h-[380px] relative">
              <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800 mb-5">
                <button
                  onClick={() => setPreviewMode('clean')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    previewMode === 'clean'
                      ? 'bg-[#F2B705] text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Original
                </button>
                <button
                  onClick={() => setPreviewMode('phone')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    previewMode === 'phone'
                      ? 'bg-[#F2B705] text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Celular
                </button>
                <button
                  onClick={() => setPreviewMode('desktop')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    previewMode === 'desktop'
                      ? 'bg-[#F2B705] text-zinc-950'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Monitor className="w-3.5 h-3.5" />
                  Desktop
                </button>
              </div>

              {previewMode === 'phone' ? (
                <div className="w-[220px] aspect-[9/19] rounded-[30px] border-[6px] border-zinc-800 bg-black overflow-hidden relative shadow-2xl">
                  {selectedWallpaper.imageUrl ? (
                    <img
                      src={selectedWallpaper.imageUrl}
                      alt={selectedWallpaper.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : selectedWallpaper.recipe ? (
                    <ProceduralBackdropPreview
                      recipe={selectedWallpaper.recipe}
                      width={540}
                      height={1140}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                  <div className="absolute top-8 inset-x-0 text-center pointer-events-none">
                    <p className="text-[10px] uppercase tracking-widest text-white/80">
                      Sábado, 21 de Novembro
                    </p>
                    <p className="text-4xl font-semibold text-white font-mono-tabular mt-0.5 drop-shadow">
                      09:41
                    </p>
                  </div>
                </div>
              ) : previewMode === 'desktop' ? (
                <div className="w-full max-w-md aspect-video rounded-xl border-4 border-zinc-800 bg-black overflow-hidden relative shadow-2xl">
                  {selectedWallpaper.imageUrl ? (
                    <img
                      src={selectedWallpaper.imageUrl}
                      alt={selectedWallpaper.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : selectedWallpaper.recipe ? (
                    <ProceduralBackdropPreview
                      recipe={selectedWallpaper.recipe}
                      width={960}
                      height={540}
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                  <div className="absolute bottom-2 inset-x-10 h-4 rounded-full bg-black/50 backdrop-blur-md border border-white/15" />
                </div>
              ) : (
                <div className="max-h-[58vh] rounded-xl overflow-hidden border border-zinc-800 shadow-2xl">
                  {selectedWallpaper.imageUrl ? (
                    <img
                      src={selectedWallpaper.imageUrl}
                      alt={selectedWallpaper.title}
                      referrerPolicy="no-referrer"
                      className="max-h-[58vh] w-auto object-contain"
                    />
                  ) : selectedWallpaper.recipe ? (
                    <ProceduralBackdropPreview
                      recipe={selectedWallpaper.recipe}
                      width={540}
                      height={840}
                      className="max-h-[58vh] w-auto object-contain"
                    />
                  ) : null}
                </div>
              )}
            </div>

            {/* Metadata & Actions */}
            <div className="lg:w-5/12 p-6 lg:p-8 flex flex-col justify-between gap-6 border-t lg:border-t-0 lg:border-l border-zinc-800">
              <div className="space-y-4">
                <p className="text-xs text-zinc-400">
                  {selectedWallpaper.category} · {selectedWallpaper.author}
                </p>
                <h2 className="text-2xl font-semibold text-zinc-50">{selectedWallpaper.title}</h2>
                <div className="space-y-2 pt-2 border-t border-zinc-800/80 text-xs text-zinc-300">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Resolução</span>
                    <span className="font-mono-tabular">{selectedWallpaper.resolution}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Proporção</span>
                    <span className="font-mono-tabular">{selectedWallpaper.aspectLabel}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Ficha Técnica</span>
                    <span>{selectedWallpaper.cameraSpec}</span>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-zinc-500 mb-2">Paleta Cromática</p>
                  <div className="flex items-center gap-2">
                    {selectedWallpaper.palette.map((hex) => (
                      <div key={hex} className="flex items-center gap-1.5">
                        <span
                          className="w-6 h-6 rounded-md border border-white/15"
                          style={{ backgroundColor: hex }}
                        />
                        <span className="text-[11px] font-mono-tabular text-zinc-400">{hex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2.5">
                <button
                  onClick={() => handleDownload(selectedWallpaper)}
                  disabled={downloadingId === selectedWallpaper.id}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors"
                >
                  <Download className="w-4 h-4" />
                  {downloadingId === selectedWallpaper.id
                    ? 'Preparando 4K...'
                    : 'Baixar em 4K Gratuito'}
                </button>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={() => handleSendToPhotoStudio(selectedWallpaper)}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium transition-colors"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Usar no Estúdio Foto
                  </button>
                  <button
                    onClick={async () => {
                      const url = await resolveWallpaperDataUrl(selectedWallpaper);
                      onShareWallpaper(selectedWallpaper.title, url);
                    }}
                    className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium transition-colors"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Instagram / Facebook
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
