import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Download,
  Loader2,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  Type as TypeIcon,
} from 'lucide-react';
import { ASPECT_PRESETS, STARTER_EDITABLE_TEMPLATES } from '../data/catalog';
import {
  renderBackgroundToCanvas,
  renderTemplateLayersToCanvas,
  triggerDataUrlDownload,
} from '../lib/studioRenderer';
import {
  AiHistoryEntry,
  AspectPresetId,
  EditableTemplate,
  SavedCreation,
  TemplateLayer,
  TemplateLayerKind,
  TemplatePromptSeed,
} from '../types/studio';

interface TemplateStudioViewProps {
  initialTemplate?: EditableTemplate | null;
  initialPromptSeed?: TemplatePromptSeed | null;
  onSaveCreation: (creation: SavedCreation) => Promise<void>;
  onRecordAiHistory?: (entry: Omit<AiHistoryEntry, 'id' | 'createdAt'>) => void;
  onImageGenerated?: (contextLabel: string) => void;
  onOpenShare: (
    title: string,
    dataUrl: string,
    caption: string,
    hashtags: string[],
    exportVariant: (presetId: AspectPresetId) => Promise<string>
  ) => void;
}

export const TemplateStudioView: React.FC<TemplateStudioViewProps> = ({
  initialTemplate,
  initialPromptSeed,
  onSaveCreation,
  onRecordAiHistory,
  onImageGenerated,
  onOpenShare,
}) => {
  const [template, setTemplate] = useState<EditableTemplate>(
    initialTemplate ?? STARTER_EDITABLE_TEMPLATES[0]
  );
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(
    (initialTemplate ?? STARTER_EDITABLE_TEMPLATES[0]).layers[1]?.id ?? null
  );
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCategory, setAiCategory] = useState('Editorial & Moda');
  const [aiMood, setAiMood] = useState('Estúdio Quente');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ layerId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    if (initialTemplate) {
      setTemplate(initialTemplate);
      setSelectedLayerId(initialTemplate.layers[0]?.id ?? null);
    }
  }, [initialTemplate]);

  useEffect(() => {
    if (!initialPromptSeed) return;
    setAiPrompt(initialPromptSeed.prompt);
    if (initialPromptSeed.category) setAiCategory(initialPromptSeed.category);
    if (initialPromptSeed.mood) setAiMood(initialPromptSeed.mood);
  }, [initialPromptSeed]);

  const preset = ASPECT_PRESETS[template.aspectRatio];
  const previewScale = Math.min(1, 760 / Math.max(preset.width, preset.height));
  const canvasW = Math.round(preset.width * previewScale);
  const canvasH = Math.round(preset.height * previewScale);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderBackgroundToCanvas(ctx, canvasW, canvasH, template.background).then(() => {
      if (!active) return;
      renderTemplateLayersToCanvas(ctx, canvasW, canvasH, template.layers, selectedLayerId);
    });

    return () => {
      active = false;
    };
  }, [template, selectedLayerId, canvasW, canvasH]);

  const selectedLayer = template.layers.find((l) => l.id === selectedLayerId) ?? null;

  const updateLayer = (id: string, patch: Partial<TemplateLayer>) => {
    setTemplate((prev) => ({
      ...prev,
      layers: prev.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    }));
  };

  const addLayer = (kind: TemplateLayerKind) => {
    const id = `layer-${Date.now()}`;
    const newLayer: TemplateLayer =
      kind === 'text'
        ? {
            id,
            kind: 'text',
            name: 'Novo Texto',
            content: 'Edite este texto',
            x: 50,
            y: 50,
            width: 72,
            height: 16,
            rotation: 0,
            color: '#FFFFFF',
            opacity: 1,
            fontFamily: 'Outfit',
            fontSize: 42,
            fontWeight: '600',
            letterSpacing: 0,
            align: 'center',
            shadow: true,
          }
        : {
            id,
            kind,
            name: kind === 'arch' ? 'Arco Estúdio' : kind === 'line' ? 'Linha' : 'Forma',
            content: '',
            x: 50,
            y: 50,
            width: kind === 'line' ? 35 : 44,
            height: kind === 'line' ? 2 : 34,
            rotation: 0,
            color: template.background.palette.accent,
            opacity: 0.45,
            fontFamily: 'Outfit',
            fontSize: 16,
            fontWeight: '400',
            letterSpacing: 0,
            align: 'center',
            shadow: false,
            strokeOnly: kind !== 'line',
          };
    setTemplate((prev) => ({ ...prev, layers: [...prev.layers, newLayer] }));
    setSelectedLayerId(id);
  };

  const deleteLayer = (id: string) => {
    setTemplate((prev) => ({
      ...prev,
      layers: prev.layers.filter((l) => l.id !== id),
    }));
    if (selectedLayerId === id) setSelectedLayerId(null);
  };

  const handleGenerateAiTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const resp = await fetch('/api/ai/generate-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          category: aiCategory,
          aspectRatio: template.aspectRatio,
          mood: aiMood,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Falha ao gerar modelo com IA.');
      }
      const generated = data.template;
      const nextTemplate: EditableTemplate = {
        id: `ai-tpl-${Date.now()}`,
        title: generated.title || 'Modelo IA Personalizado',
        category: generated.category || aiCategory,
        aspectRatio: template.aspectRatio,
        background: {
          id: `ai-bg-${Date.now()}`,
          ...generated.background,
        },
        layers: Array.isArray(generated.layers) ? generated.layers : [],
        socialCaption: generated.socialCaption || '',
        hashtags: Array.isArray(generated.hashtags) ? generated.hashtags : ['#AtelierClub'],
        createdAt: Date.now(),
      };
      setTemplate(nextTemplate);
      setSelectedLayerId(nextTemplate.layers[0]?.id ?? null);
      onRecordAiHistory?.({
        kind: 'template',
        prompt: aiPrompt.trim(),
        resultTitle: nextTemplate.title,
        resultSummary: `${nextTemplate.category} · ${nextTemplate.layers.length} camadas · ${ASPECT_PRESETS[nextTemplate.aspectRatio].ratioLabel}`,
        aspectId: nextTemplate.aspectRatio,
        category: aiCategory,
        mood: aiMood,
        templateData: nextTemplate,
      });
      onImageGenerated?.(`Modelo "${nextTemplate.title}" gerado com sucesso!`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao conectar com a IA.');
    } finally {
      setIsGenerating(false);
    }
  };

  const renderHighResDataUrl = async (targetAspectId?: AspectPresetId): Promise<string> => {
    const targetPreset = ASPECT_PRESETS[targetAspectId ?? template.aspectRatio];
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = targetPreset.width;
    exportCanvas.height = targetPreset.height;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) throw new Error('Canvas indisponível.');
    await renderBackgroundToCanvas(ctx, targetPreset.width, targetPreset.height, template.background);
    renderTemplateLayersToCanvas(ctx, targetPreset.width, targetPreset.height, template.layers, null);
    return exportCanvas.toDataURL('image/png');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;

    // Hit test from topmost layer downwards
    const hit = [...template.layers].reverse().find((layer) => {
      const halfW = Math.max(8, layer.width / 2);
      const halfH = Math.max(6, layer.height / 2);
      return (
        px >= layer.x - halfW &&
        px <= layer.x + halfW &&
        py >= layer.y - halfH &&
        py <= layer.y + halfH
      );
    });

    if (hit) {
      setSelectedLayerId(hit.id);
      dragRef.current = {
        layerId: hit.id,
        startX: px,
        startY: py,
        origX: hit.x,
        origY: hit.y,
      };
      canvas.setPointerCapture(e.pointerId);
    } else {
      setSelectedLayerId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * 100;
    const py = ((e.clientY - rect.top) / rect.height) * 100;
    const dx = px - dragRef.current.startX;
    const dy = py - dragRef.current.startY;
    updateLayer(dragRef.current.layerId, {
      x: Math.max(5, Math.min(95, Math.round(dragRef.current.origX + dx))),
      y: Math.max(5, Math.min(95, Math.round(dragRef.current.origY + dy))),
    });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-6">
      {/* AI Template Prompt Bar */}
      <form
        onSubmit={handleGenerateAiTemplate}
        className="rounded-2xl bg-[#111115] border border-zinc-800 p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1">
            <label className="sr-only" htmlFor="ai-template-prompt">
              Descreva seu modelo editável
            </label>
            <input
              id="ai-template-prompt"
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Ex: Capa minimalista de estúdio para lançamento de coleção de café artesanal..."
              className="w-full rounded-lg bg-[#09090B] border border-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-[#F2B705]"
            />
          </div>
          <select
            value={aiCategory}
            onChange={(e) => setAiCategory(e.target.value)}
            className="rounded-lg bg-[#09090B] border border-zinc-800 px-3 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-[#F2B705]"
          >
            <option value="Editorial & Moda">Editorial &amp; Moda</option>
            <option value="Papel de Parede Tipográfico">Papel de Parede</option>
            <option value="Instagram & Stories">Instagram &amp; Stories</option>
            <option value="Facebook & Negócios">Facebook &amp; Negócios</option>
          </select>
          <select
            value={aiMood}
            onChange={(e) => setAiMood(e.target.value)}
            className="rounded-lg bg-[#09090B] border border-zinc-800 px-3 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-[#F2B705]"
          >
            <option value="Estúdio Quente">Estúdio Quente</option>
            <option value="Preto Dramático">Preto Dramático</option>
            <option value="Azul Cobalto Galeria">Cobalto Galeria</option>
            <option value="Botânico Solar">Botânico Solar</option>
          </select>
          <button
            type="submit"
            disabled={isGenerating || !aiPrompt.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {isGenerating ? 'Criando Modelo...' : 'Gerar Modelo com IA'}
          </button>
        </div>

        {/* Starter Presets & Format Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/70">
          <div className="flex items-center gap-2 overflow-x-auto">
            <span className="text-xs text-zinc-500 whitespace-nowrap">Modelos base:</span>
            {STARTER_EDITABLE_TEMPLATES.map((starter) => (
              <button
                key={starter.id}
                type="button"
                onClick={() => {
                  setTemplate(starter);
                  setSelectedLayerId(starter.layers[1]?.id ?? starter.layers[0]?.id ?? null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap shrink-0 ${
                  template.id === starter.id
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-600'
                    : 'bg-[#09090B] text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                }`}
              >
                {starter.title}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-500">Formato:</span>
            <select
              value={template.aspectRatio}
              onChange={(e) =>
                setTemplate((prev) => ({
                  ...prev,
                  aspectRatio: e.target.value as AspectPresetId,
                }))
              }
              className="rounded-md bg-[#09090B] border border-zinc-800 px-2.5 py-1.5 text-xs font-mono-tabular text-zinc-200"
            >
              {Object.values(ASPECT_PRESETS).map((ap) => (
                <option key={ap.id} value={ap.id}>
                  {ap.label} ({ap.ratioLabel})
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg bg-red-950/50 border border-red-900 px-4 py-2.5 text-xs text-red-200">
            {errorMsg}
          </div>
        )}
      </form>

      {/* Main Editor Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Interactive Canvas */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0D0D10] border border-zinc-800 p-6 flex flex-col items-center justify-center min-h-[540px]">
          <div className="w-full flex items-center justify-between mb-4">
            <p className="text-xs text-zinc-400">
              Arraste qualquer texto ou forma diretamente na prancheta ·{' '}
              <span className="font-mono-tabular">
                {preset.width}×{preset.height}
              </span>
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => addLayer('text')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                <TypeIcon className="w-3.5 h-3.5" />+ Texto
              </button>
              <button
                onClick={() => addLayer('arch')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                <Plus className="w-3.5 h-3.5" />
                Arco
              </button>
              <button
                onClick={() => addLayer('line')}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                <Plus className="w-3.5 h-3.5" />
                Linha
              </button>
            </div>
          </div>

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="max-h-[62vh] w-auto rounded-xl shadow-2xl border border-zinc-800 cursor-move touch-none"
          />
        </div>

        {/* Right: Layer & Style Inspector */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111115] border border-zinc-800 p-5 space-y-5">
          {/* Layer Stack */}
          <div>
            <p className="text-xs font-medium text-zinc-400 mb-2">
              Camadas Editáveis ({template.layers.length})
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {template.layers.map((layer) => (
                <div
                  key={layer.id}
                  onClick={() => setSelectedLayerId(layer.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    selectedLayerId === layer.id
                      ? 'bg-[#F2B705]/15 border border-[#F2B705] text-zinc-100'
                      : 'bg-[#09090B] border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <span className="truncate font-medium">
                    {layer.name}
                    {layer.kind === 'text' ? `: "${layer.content.slice(0, 22)}"` : ''}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteLayer(layer.id);
                    }}
                    className="p-1 text-zinc-500 hover:text-red-400"
                    aria-label="Excluir camada"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Layer Controls */}
          {selectedLayer ? (
            <div className="space-y-3.5 pt-4 border-t border-zinc-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Editar: {selectedLayer.name}
                </h3>
                <span className="text-[11px] font-mono-tabular text-zinc-400">
                  X {selectedLayer.x}% · Y {selectedLayer.y}%
                </span>
              </div>

              {selectedLayer.kind === 'text' && (
                <>
                  <textarea
                    rows={2}
                    value={selectedLayer.content}
                    onChange={(e) => updateLayer(selectedLayer.id, { content: e.target.value })}
                    className="w-full rounded-lg bg-[#09090B] border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                  />

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Tipografia</label>
                      <select
                        value={selectedLayer.fontFamily}
                        onChange={(e) =>
                          updateLayer(selectedLayer.id, {
                            fontFamily: e.target.value as TemplateLayer['fontFamily'],
                          })
                        }
                        className="w-full rounded-md bg-[#09090B] border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200"
                      >
                        <option value="Outfit">Outfit (Geométrica)</option>
                        <option value="Cormorant Garamond">Cormorant (Editorial)</option>
                        <option value="Plus Jakarta Sans">Jakarta (Moderna)</option>
                        <option value="JetBrains Mono">JetBrains (Mono)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-zinc-400 mb-1">Alinhamento</label>
                      <div className="grid grid-cols-3 gap-1 bg-[#09090B] p-0.5 rounded-md border border-zinc-800">
                        {(['left', 'center', 'right'] as const).map((al) => (
                          <button
                            key={al}
                            type="button"
                            onClick={() => updateLayer(selectedLayer.id, { align: al })}
                            className={`py-1 text-[11px] rounded ${
                              selectedLayer.align === al
                                ? 'bg-zinc-800 text-white'
                                : 'text-zinc-400'
                            }`}
                          >
                            {al === 'left' ? 'Esq' : al === 'center' ? 'Centro' : 'Dir'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span>Tamanho da Fonte</span>
                      <span className="font-mono-tabular">{selectedLayer.fontSize}px</span>
                    </div>
                    <input
                      type="range"
                      min={14}
                      max={120}
                      value={selectedLayer.fontSize}
                      onChange={(e) =>
                        updateLayer(selectedLayer.id, { fontSize: Number(e.target.value) })
                      }
                      className="w-full accent-[#F2B705]"
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Cor da Camada</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedLayer.color}
                      onChange={(e) => updateLayer(selectedLayer.id, { color: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer bg-transparent border border-zinc-700"
                    />
                    <span className="text-xs font-mono-tabular text-zinc-300">
                      {selectedLayer.color}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Opacidade</span>
                    <span className="font-mono-tabular">
                      {Math.round(selectedLayer.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={Math.round(selectedLayer.opacity * 100)}
                    onChange={(e) =>
                      updateLayer(selectedLayer.id, { opacity: Number(e.target.value) / 100 })
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Largura</span>
                    <span className="font-mono-tabular">{selectedLayer.width}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={95}
                    value={selectedLayer.width}
                    onChange={(e) =>
                      updateLayer(selectedLayer.id, { width: Number(e.target.value) })
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Rotação</span>
                    <span className="font-mono-tabular">{selectedLayer.rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    value={selectedLayer.rotation}
                    onChange={(e) =>
                      updateLayer(selectedLayer.id, { rotation: Number(e.target.value) })
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-4 border-t border-zinc-800 text-xs text-zinc-400">
              Clique em uma camada na prancheta ou na lista acima para editar texto, fonte, cor e
              posição.
            </div>
          )}

          {/* Background Palette Quick Tweaks */}
          <div className="pt-4 border-t border-zinc-800 space-y-2.5">
            <p className="text-xs font-medium text-zinc-300">Cores do Fundo do Modelo</p>
            <div className="flex items-center gap-3">
              {(['base', 'mid', 'highlight', 'accent'] as const).map((key) => (
                <label key={key} className="flex flex-col items-center gap-1 cursor-pointer">
                  <input
                    type="color"
                    value={template.background.palette[key]}
                    onChange={(e) =>
                      setTemplate((prev) => ({
                        ...prev,
                        background: {
                          ...prev.background,
                          palette: {
                            ...prev.background.palette,
                            [key]: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-7 h-7 rounded border border-zinc-700 bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] text-zinc-500 capitalize">{key}</span>
                </label>
              ))}
            </div>
          </div>

          {savedNotice && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-zinc-200">
              {savedNotice}
            </div>
          )}

          {/* Export Actions */}
          <div className="pt-3 border-t border-zinc-800 space-y-2.5">
            <button
              onClick={async () => {
                const url = await renderHighResDataUrl();
                triggerDataUrlDownload(
                  url,
                  `${template.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`
                );
                onImageGenerated?.(`Arte "${template.title}" baixada em alta resolução!`);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors"
            >
              <Download className="w-4 h-4" />
              Baixar Arte em Alta Resolução
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={async () => {
                  const url = await renderHighResDataUrl();
                  await onSaveCreation({
                    id: `saved-tpl-${Date.now()}`,
                    kind: 'template',
                    title: template.title,
                    previewDataUrl: url,
                    aspectId: template.aspectRatio,
                    createdAt: Date.now(),
                    templateData: template,
                  });
                  setSavedNotice('Modelo salvo na sua Coleção!');
                  setTimeout(() => setSavedNotice(null), 2500);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium transition-colors"
              >
                <Bookmark className="w-3.5 h-3.5" />
                Salvar
              </button>
              <button
                onClick={async () => {
                  const url = await renderHighResDataUrl();
                  onOpenShare(
                    template.title,
                    url,
                    template.socialCaption,
                    template.hashtags,
                    renderHighResDataUrl
                  );
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                Instagram / FB
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
