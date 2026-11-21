import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Download,
  Loader2,
  Share2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { ASPECT_PRESETS, STUDIO_BACKDROP_PRESETS } from '../data/catalog';
import {
  exportBackgroundRecipeAsDataUrl,
  triggerDataUrlDownload,
} from '../lib/studioRenderer';
import {
  AiHistoryEntry,
  AspectPresetId,
  BackgroundPatternType,
  BackgroundPromptSeed,
  SavedCreation,
  StudioBackgroundRecipe,
} from '../types/studio';
import { ProceduralBackdropPreview } from './ProceduralBackdropPreview';

interface BackgroundCreatorViewProps {
  initialBackground?: StudioBackgroundRecipe | null;
  initialPromptSeed?: BackgroundPromptSeed | null;
  onSendToPhotoStudio: (recipe: StudioBackgroundRecipe) => void;
  onSaveCreation: (creation: SavedCreation) => Promise<void>;
  onRecordAiHistory?: (entry: Omit<AiHistoryEntry, 'id' | 'createdAt'>) => void;
  onAddCustomBackground: (recipe: StudioBackgroundRecipe) => void;
  onImageGenerated?: (contextLabel: string) => void;
  onOpenShare: (
    title: string,
    dataUrl: string,
    caption: string,
    hashtags: string[],
    exportVariant: (presetId: AspectPresetId) => Promise<string>
  ) => void;
}

const PATTERN_OPTIONS: Array<{ id: BackgroundPatternType; label: string }> = [
  { id: 'cyclorama', label: 'Ciclorama Estúdio' },
  { id: 'architectural', label: 'Luz Arquitetônica' },
  { id: 'silk', label: 'Seda & Ondas' },
  { id: 'mesh', label: 'Malha Cromática' },
  { id: 'botanical', label: 'Botânico Solar' },
  { id: 'geometric', label: 'Brutalista Arco' },
  { id: 'horizon', label: 'Horizonte Atmosférico' },
];

export const BackgroundCreatorView: React.FC<BackgroundCreatorViewProps> = ({
  initialBackground,
  initialPromptSeed,
  onSendToPhotoStudio,
  onSaveCreation,
  onRecordAiHistory,
  onAddCustomBackground,
  onImageGenerated,
  onOpenShare,
}) => {
  const [recipe, setRecipe] = useState<StudioBackgroundRecipe>(
    initialBackground ?? {
      ...STUDIO_BACKDROP_PRESETS[2],
      imageUrl: undefined,
    }
  );
  const [aspectId, setAspectId] = useState<AspectPresetId>('mobile-9-16');
  const [prompt, setPrompt] = useState('');
  const [styleChoice, setStyleChoice] = useState('Estúdio Fotográfico');
  const [lightingMood, setLightingMood] = useState('Luz Lateral Quente');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialBackground) {
      setRecipe({ ...initialBackground, imageUrl: undefined });
    }
  }, [initialBackground]);

  useEffect(() => {
    if (!initialPromptSeed) return;
    setPrompt(initialPromptSeed.prompt);
    if (initialPromptSeed.style) setStyleChoice(initialPromptSeed.style);
    if (initialPromptSeed.lightingMood) setLightingMood(initialPromptSeed.lightingMood);
  }, [initialPromptSeed]);

  const preset = ASPECT_PRESETS[aspectId];
  const previewScale = Math.min(1, 680 / Math.max(preset.width, preset.height));
  const previewW = Math.round(preset.width * previewScale);
  const previewH = Math.round(preset.height * previewScale);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/ai/generate-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          style: styleChoice,
          lightingMood,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Não foi possível gerar o plano de fundo.');
      }
      const next: StudioBackgroundRecipe = {
        ...data.background,
        id: `bg-${Date.now()}`,
        imageUrl: undefined,
      };
      setRecipe(next);
      onAddCustomBackground(next);
      onRecordAiHistory?.({
        kind: 'background',
        prompt: prompt.trim(),
        resultTitle: next.name,
        resultSummary: next.description || `${styleChoice} · ${lightingMood}`,
        aspectId,
        category: styleChoice,
        mood: lightingMood,
        backgroundData: next,
      });
      onImageGenerated?.(`Plano de fundo "${next.name}" gerado com sucesso!`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao conectar com a IA.');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderForExport = async (targetAspectId?: AspectPresetId): Promise<string> => {
    const p = ASPECT_PRESETS[targetAspectId ?? aspectId];
    return exportBackgroundRecipeAsDataUrl(recipe, p.width, p.height, 'image/png');
  };

  return (
    <div className="space-y-6">
      {/* AI Prompt Header */}
      <form
        onSubmit={handleGenerate}
        className="rounded-2xl bg-[#111115] border border-zinc-800 p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Descreva o background: Ex: Estúdio cinza quente com feixe de luz dourada e sombras suaves..."
            className="flex-1 rounded-lg bg-[#09090B] border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#F2B705]"
          />
          <select
            value={styleChoice}
            onChange={(e) => setStyleChoice(e.target.value)}
            className="rounded-lg bg-[#09090B] border border-zinc-800 px-3 py-2.5 text-xs text-zinc-200"
          >
            <option value="Estúdio Fotográfico">Estúdio Fotográfico</option>
            <option value="Seda & Luxo Minimalista">Seda &amp; Luxo</option>
            <option value="Arquitetura Brutalista">Arquitetura</option>
            <option value="Papel de Parede Noturno">Noturno AMOLED</option>
          </select>
          <select
            value={lightingMood}
            onChange={(e) => setLightingMood(e.target.value)}
            className="rounded-lg bg-[#09090B] border border-zinc-800 px-3 py-2.5 text-xs text-zinc-200"
          >
            <option value="Luz Lateral Quente">Luz Lateral Quente</option>
            <option value="Softbox Central Difuso">Softbox Central</option>
            <option value="Contraluz Dramática">Contraluz Dramática</option>
            <option value="Amanhecer Nórdico">Amanhecer Suave</option>
          </select>
          <button
            type="submit"
            disabled={isGenerating || !prompt.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isGenerating ? 'Sintetizando...' : 'Criar Fundo com IA'}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/70">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-xs text-zinc-500 mr-1 whitespace-nowrap">Estilos rápidos:</span>
            {STUDIO_BACKDROP_PRESETS.slice(1).map((presetItem) => (
              <button
                key={presetItem.id}
                type="button"
                onClick={() => setRecipe({ ...presetItem, imageUrl: undefined })}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap shrink-0 ${
                  recipe.id === presetItem.id
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-600'
                    : 'bg-[#09090B] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                {presetItem.name}
              </button>
            ))}
          </div>

          <select
            value={aspectId}
            onChange={(e) => setAspectId(e.target.value as AspectPresetId)}
            className="rounded-md bg-[#09090B] border border-zinc-800 px-2.5 py-1.5 text-xs font-mono-tabular text-zinc-200"
          >
            {Object.values(ASPECT_PRESETS).map((ap) => (
              <option key={ap.id} value={ap.id}>
                {ap.label} ({ap.width}×{ap.height})
              </option>
            ))}
          </select>
        </div>

        {errorMsg && (
          <div className="rounded-lg bg-red-950/50 border border-red-900 px-4 py-2.5 text-xs text-red-200">
            {errorMsg}
          </div>
        )}
      </form>

      {/* Main Creator Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 rounded-2xl bg-[#0D0D10] border border-zinc-800 p-6 flex flex-col items-center justify-center min-h-[520px]">
          <div className="w-full flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">{recipe.name}</h2>
              <p className="text-xs text-zinc-400">{recipe.description}</p>
            </div>
            <span className="text-xs font-mono-tabular text-zinc-400">
              {preset.width}×{preset.height}
            </span>
          </div>

          <ProceduralBackdropPreview
            recipe={recipe}
            width={previewW}
            height={previewH}
            className="max-h-[60vh] w-auto rounded-xl border border-zinc-800 shadow-2xl"
          />
        </div>

        <div className="lg:col-span-5 rounded-2xl bg-[#111115] border border-zinc-800 p-5 space-y-5">
          {/* Pattern Selector */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Estrutura do Cenário
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {PATTERN_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRecipe((prev) => ({ ...prev, patternType: opt.id }))}
                  className={`px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                    recipe.patternType === opt.id
                      ? 'bg-[#F2B705]/15 border border-[#F2B705] text-zinc-100 font-medium'
                      : 'bg-[#09090B] border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 5-Color Palette */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-2">
              Paleta de Iluminação e Superfície
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(
                [
                  ['base', 'Base'],
                  ['mid', 'Meio'],
                  ['highlight', 'Luz'],
                  ['shadow', 'Sombra'],
                  ['accent', 'Realce'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-[#09090B] border border-zinc-800 cursor-pointer"
                >
                  <input
                    type="color"
                    value={recipe.palette[key]}
                    onChange={(e) =>
                      setRecipe((prev) => ({
                        ...prev,
                        palette: { ...prev.palette, [key]: e.target.value },
                      }))
                    }
                    className="w-8 h-8 rounded cursor-pointer bg-transparent"
                  />
                  <span className="text-[11px] text-zinc-400">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Lighting & Texture Sliders */}
          <div className="space-y-3 pt-2 border-t border-zinc-800">
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Ângulo da Luz</span>
                <span className="font-mono-tabular">{recipe.lighting.angle}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={360}
                value={recipe.lighting.angle}
                onChange={(e) =>
                  setRecipe((prev) => ({
                    ...prev,
                    lighting: { ...prev.lighting, angle: Number(e.target.value) },
                  }))
                }
                className="w-full accent-[#F2B705]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Intensidade</span>
                  <span className="font-mono-tabular">{recipe.lighting.intensity}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={recipe.lighting.intensity}
                  onChange={(e) =>
                    setRecipe((prev) => ({
                      ...prev,
                      lighting: { ...prev.lighting, intensity: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[#F2B705]"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Vinheta Estúdio</span>
                  <span className="font-mono-tabular">{recipe.lighting.vignette}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={90}
                  value={recipe.lighting.vignette}
                  onChange={(e) =>
                    setRecipe((prev) => ({
                      ...prev,
                      lighting: { ...prev.lighting, vignette: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[#F2B705]"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Grão</span>
                  <span className="font-mono-tabular">{recipe.texture.grain}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={45}
                  value={recipe.texture.grain}
                  onChange={(e) =>
                    setRecipe((prev) => ({
                      ...prev,
                      texture: { ...prev.texture, grain: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[#F2B705]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Desfoque</span>
                  <span className="font-mono-tabular">{recipe.texture.blur}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={35}
                  value={recipe.texture.blur}
                  onChange={(e) =>
                    setRecipe((prev) => ({
                      ...prev,
                      texture: { ...prev.texture, blur: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[#F2B705]"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                  <span>Bokeh</span>
                  <span className="font-mono-tabular">{recipe.texture.bokehCount}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={recipe.texture.bokehCount}
                  onChange={(e) =>
                    setRecipe((prev) => ({
                      ...prev,
                      texture: { ...prev.texture, bokehCount: Number(e.target.value) },
                    }))
                  }
                  className="w-full accent-[#F2B705]"
                />
              </div>
            </div>
          </div>

          {notice && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-zinc-200">
              {notice}
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-zinc-800 space-y-2.5">
            <button
              onClick={() => {
                onAddCustomBackground(recipe);
                onSendToPhotoStudio(recipe);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors"
            >
              <Wand2 className="w-4 h-4" />
              Inserir em Foto no Estúdio
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={async () => {
                  const url = await renderForExport();
                  triggerDataUrlDownload(
                    url,
                    `${recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${aspectId}.png`
                  );
                  onImageGenerated?.(`Background "${recipe.name}" baixado em alta resolução!`);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar
              </button>
              <button
                onClick={async () => {
                  const url = await renderForExport();
                  onAddCustomBackground(recipe);
                  await onSaveCreation({
                    id: `saved-bg-${Date.now()}`,
                    kind: 'background',
                    title: recipe.name,
                    previewDataUrl: url,
                    aspectId,
                    createdAt: Date.now(),
                    backgroundData: recipe,
                  });
                  setNotice('Plano de fundo salvo na Coleção!');
                  setTimeout(() => setNotice(null), 2400);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium"
              >
                <Bookmark className="w-3.5 h-3.5" />
                Salvar
              </button>
              <button
                onClick={async () => {
                  const url = await renderForExport();
                  onOpenShare(
                    recipe.name,
                    url,
                    recipe.socialCaption ||
                      `Plano de fundo personalizado criado no Atelier Club: ${recipe.name}.`,
                    recipe.hashtags || ['#AtelierClub', '#Background4K', '#DesignEstudio'],
                    renderForExport
                  );
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium"
              >
                <Share2 className="w-3.5 h-3.5" />
                Redes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
