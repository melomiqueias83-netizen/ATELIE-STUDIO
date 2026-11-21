import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bookmark,
  Brush,
  Download,
  Eraser,
  ImagePlus,
  Loader2,
  Move,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Upload,
} from 'lucide-react';
import {
  ASPECT_PRESETS,
  SAMPLE_PORTRAIT_URL,
  STUDIO_BACKDROP_PRESETS,
} from '../data/catalog';
import { loadImageCached, triggerDataUrlDownload } from '../lib/studioRenderer';
import {
  buildSubjectCutoutCanvas,
  renderStudioComposite,
} from '../lib/subjectCutout';
import {
  AiHistoryEntry,
  AspectPresetId,
  CutoutSettings,
  PhotoAdjustments,
  PhotoAnalysisResult,
  PhotoAnalysisSeed,
  SavedCreation,
  StudioBackgroundRecipe,
} from '../types/studio';

interface PhotoStudioViewProps {
  activeBackdrop: StudioBackgroundRecipe;
  customBackdrops: StudioBackgroundRecipe[];
  initialAiAnalysis?: PhotoAnalysisSeed | null;
  onChangeBackdrop: (recipe: StudioBackgroundRecipe) => void;
  onSaveCreation: (creation: SavedCreation) => Promise<void>;
  onRecordAiHistory?: (entry: Omit<AiHistoryEntry, 'id' | 'createdAt'>) => void;
  onOpenShare: (
    title: string,
    dataUrl: string,
    caption: string,
    hashtags: string[],
    exportVariant: (presetId: AspectPresetId) => Promise<string>
  ) => void;
  onImageGenerated?: (contextLabel: string) => void;
}

const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  brightness: 4,
  contrast: 8,
  saturation: 4,
  warmth: 6,
  rimLightIntensity: 28,
  rimLightColor: '#F2B705',
  contactShadowOpacity: 55,
  subjectScale: 1,
  subjectOffsetX: 0,
  subjectOffsetY: 0,
};

const DEFAULT_CUTOUT: CutoutSettings = {
  enabled: true,
  mode: 'light-bg',
  tolerance: 36,
  feather: 10,
  edgeCleanup: 45,
};

export const PhotoStudioView: React.FC<PhotoStudioViewProps> = ({
  activeBackdrop,
  customBackdrops,
  initialAiAnalysis,
  onChangeBackdrop,
  onSaveCreation,
  onRecordAiHistory,
  onImageGenerated,
  onOpenShare,
}) => {
  const [sourceUrl, setSourceUrl] = useState<string>(SAMPLE_PORTRAIT_URL);
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [aspectId, setAspectId] = useState<AspectPresetId>('ig-portrait-4-5');
  const [studioTab, setStudioTab] = useState<'cutout' | 'backdrop' | 'lighting'>('backdrop');

  const [cutout, setCutout] = useState<CutoutSettings>(DEFAULT_CUTOUT);
  const [adjustments, setAdjustments] = useState<PhotoAdjustments>(DEFAULT_ADJUSTMENTS);

  const [toolMode, setToolMode] = useState<'move' | 'erase' | 'restore'>('move');
  const [brushSize, setBrushSize] = useState(28);
  const [maskVersion, setMaskVersion] = useState(0);

  const [aiAnalysis, setAiAnalysis] = useState<PhotoAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const manualMaskRef = useRef<HTMLCanvasElement | null>(null);
  const pointerStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const backdropFileInputRef = useRef<HTMLInputElement | null>(null);

  // Load source image & initialize manual mask canvas
  useEffect(() => {
    let mounted = true;
    loadImageCached(sourceUrl)
      .then((img) => {
        if (!mounted) return;
        setSourceImg(img);
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = img.naturalWidth;
        maskCanvas.height = img.naturalHeight;
        manualMaskRef.current = maskCanvas;
        setMaskVersion((v) => v + 1);
      })
      .catch(() => {
        if (mounted) setSourceImg(null);
      });
    return () => {
      mounted = false;
    };
  }, [sourceUrl]);

  useEffect(() => {
    if (!initialAiAnalysis) return;
    const result = initialAiAnalysis.analysis;
    setAiAnalysis(result);
    setCutout((prev) => ({
      ...prev,
      enabled: true,
      mode: result.recommendedCutoutMode || prev.mode,
    }));
    setAdjustments((prev) => ({
      ...prev,
      brightness: result.suggestedColorMatch.brightness ?? prev.brightness,
      contrast: result.suggestedColorMatch.contrast ?? prev.contrast,
      warmth: result.suggestedColorMatch.warmth ?? prev.warmth,
      saturation: result.suggestedColorMatch.saturation ?? prev.saturation,
      rimLightColor: result.suggestedColorMatch.rimLightColor || prev.rimLightColor,
      rimLightIntensity: result.suggestedColorMatch.rimLightIntensity ?? prev.rimLightIntensity,
      contactShadowOpacity:
        result.suggestedColorMatch.contactShadowOpacity ?? prev.contactShadowOpacity,
    }));
  }, [initialAiAnalysis]);

  // Recompute cutout buffer when source, cutout settings, or manual mask change
  const cutoutCanvas = useMemo(() => {
    if (!sourceImg) return null;
    return buildSubjectCutoutCanvas(sourceImg, cutout, manualMaskRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceImg, cutout, maskVersion]);

  const preset = ASPECT_PRESETS[aspectId];
  const previewScale = Math.min(1, 760 / Math.max(preset.width, preset.height));
  const canvasW = Math.round(preset.width * previewScale);
  const canvasH = Math.round(preset.height * previewScale);

  // Render final studio composite to visible canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    renderStudioComposite(canvas, canvasW, canvasH, activeBackdrop, cutoutCanvas, adjustments);
  }, [canvasW, canvasH, activeBackdrop, cutoutCanvas, adjustments]);

  const allBackdrops = useMemo(() => {
    const combined = [...customBackdrops, ...STUDIO_BACKDROP_PRESETS];
    const seen = new Set<string>();
    return combined.filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
  }, [customBackdrops]);

  const handleUploadPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        setAiAnalysis(null);
        setCutout({ ...DEFAULT_CUTOUT, mode: 'auto' });
        setAdjustments(DEFAULT_ADJUSTMENTS);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadCustomBackdrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onChangeBackdrop({
          id: `user-bg-${Date.now()}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          description: 'Plano de fundo enviado do seu dispositivo',
          patternType: 'cyclorama',
          palette: activeBackdrop.palette,
          lighting: { angle: 45, intensity: 70, softness: 70, vignette: 30 },
          texture: { grain: 0, blur: 0, bokehCount: 0 },
          imageUrl: reader.result,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeWithAi = async () => {
    if (!sourceImg) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      // Resize photo down for fast multimodal analysis
      const tmp = document.createElement('canvas');
      const maxDim = 640;
      const s = Math.min(1, maxDim / Math.max(sourceImg.naturalWidth, sourceImg.naturalHeight));
      tmp.width = Math.round(sourceImg.naturalWidth * s);
      tmp.height = Math.round(sourceImg.naturalHeight * s);
      const tCtx = tmp.getContext('2d');
      if (!tCtx) throw new Error('Canvas indisponível.');
      tCtx.drawImage(sourceImg, 0, 0, tmp.width, tmp.height);
      const dataUrl = tmp.toDataURL('image/jpeg', 0.82);

      const resp = await fetch('/api/ai/analyze-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: dataUrl,
          mimeType: 'image/jpeg',
          targetBackdropName: activeBackdrop.name,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Erro ao analisar fotografia.');

      const result = data.analysis as PhotoAnalysisResult;
      setAiAnalysis(result);
      setCutout((prev) => ({
        ...prev,
        enabled: true,
        mode: result.recommendedCutoutMode || prev.mode,
      }));
      setAdjustments((prev) => ({
        ...prev,
        brightness: result.suggestedColorMatch.brightness ?? prev.brightness,
        contrast: result.suggestedColorMatch.contrast ?? prev.contrast,
        warmth: result.suggestedColorMatch.warmth ?? prev.warmth,
        saturation: result.suggestedColorMatch.saturation ?? prev.saturation,
        rimLightColor: result.suggestedColorMatch.rimLightColor || prev.rimLightColor,
        rimLightIntensity: result.suggestedColorMatch.rimLightIntensity ?? prev.rimLightIntensity,
        contactShadowOpacity:
          result.suggestedColorMatch.contactShadowOpacity ?? prev.contactShadowOpacity,
      }));
      onRecordAiHistory?.({
        kind: 'photo-analysis',
        prompt: `Análise IA para fundo "${activeBackdrop.name}" · ${result.suggestedStudioPrompt || result.subjectDescription}`,
        resultTitle: result.subjectDescription || 'Análise Fotográfica IA',
        resultSummary:
          result.suggestedStudioPrompt ||
          result.socialCaption ||
          `Recorte: ${result.recommendedCutoutMode}`,
        aspectId,
        category: activeBackdrop.name,
        mood: result.recommendedCutoutMode,
        backgroundData: { ...activeBackdrop, imageUrl: undefined },
        photoAnalysisData: result,
      });
    } catch (err: unknown) {
      setAnalysisError(err instanceof Error ? err.message : 'Erro na análise IA.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Convert canvas pointer event into subject source image coordinates for brush painting
  const paintBrushAtPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!sourceImg || !manualMaskRef.current || !previewCanvasRef.current) return;
    const canvas = previewCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvasW;
    const cy = ((e.clientY - rect.top) / rect.height) * canvasH;

    const subRatio = sourceImg.naturalWidth / sourceImg.naturalHeight;
    const baseH = canvasH * 0.88 * adjustments.subjectScale;
    const drawW = baseH * subRatio;
    const drawH = baseH;
    const drawX = canvasW * 0.5 - drawW / 2 + (adjustments.subjectOffsetX / 100) * canvasW;
    const drawY = canvasH - drawH + (adjustments.subjectOffsetY / 100) * canvasH;

    const u = (cx - drawX) / drawW;
    const v = (cy - drawY) / drawH;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;

    const mCtx = manualMaskRef.current.getContext('2d');
    if (!mCtx) return;
    const mx = u * manualMaskRef.current.width;
    const my = v * manualMaskRef.current.height;
    const scaledRadius = (brushSize / drawW) * manualMaskRef.current.width;

    mCtx.save();
    mCtx.beginPath();
    mCtx.arc(mx, my, Math.max(4, scaledRadius), 0, Math.PI * 2);
    mCtx.fillStyle = toolMode === 'erase' ? 'rgba(255,0,0,1)' : 'rgba(0,255,0,1)';
    mCtx.fill();
    mCtx.restore();

    setMaskVersion((ver) => ver + 1);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    if (toolMode === 'move') {
      pointerStateRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        origOffsetX: adjustments.subjectOffsetX,
        origOffsetY: adjustments.subjectOffsetY,
      };
    } else {
      pointerStateRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        origOffsetX: 0,
        origOffsetY: 0,
      };
      paintBrushAtPointer(e);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerStateRef.current?.active || !previewCanvasRef.current) return;
    if (toolMode === 'move') {
      const rect = previewCanvasRef.current.getBoundingClientRect();
      const dxPct = ((e.clientX - pointerStateRef.current.startX) / rect.width) * 100;
      const dyPct = ((e.clientY - pointerStateRef.current.startY) / rect.height) * 100;
      setAdjustments((prev) => ({
        ...prev,
        subjectOffsetX: Math.max(-50, Math.min(50, Math.round(pointerStateRef.current!.origOffsetX + dxPct))),
        subjectOffsetY: Math.max(-50, Math.min(50, Math.round(pointerStateRef.current!.origOffsetY + dyPct))),
      }));
    } else {
      paintBrushAtPointer(e);
    }
  };

  const handlePointerUp = () => {
    pointerStateRef.current = null;
  };

  const clearManualBrush = () => {
    if (!manualMaskRef.current) return;
    const mCtx = manualMaskRef.current.getContext('2d');
    if (mCtx) {
      mCtx.clearRect(0, 0, manualMaskRef.current.width, manualMaskRef.current.height);
      setMaskVersion((v) => v + 1);
    }
  };

  const exportCompositeDataUrl = async (targetAspectId?: AspectPresetId): Promise<string> => {
    const targetPreset = ASPECT_PRESETS[targetAspectId ?? aspectId];
    const exportCanvas = document.createElement('canvas');
    await renderStudioComposite(
      exportCanvas,
      targetPreset.width,
      targetPreset.height,
      activeBackdrop,
      cutoutCanvas,
      adjustments
    );
    return exportCanvas.toDataURL('image/png');
  };

  return (
    <div className="space-y-6">
      {/* Top Studio Bar */}
      <div className="rounded-2xl bg-[#111115] border border-zinc-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadPhoto}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-xs hover:bg-[#e5ad04] transition-colors whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5" />
            Enviar Minha Foto
          </button>
          <button
            onClick={() => {
              setSourceUrl(SAMPLE_PORTRAIT_URL);
              setCutout(DEFAULT_CUTOUT);
              setAdjustments(DEFAULT_ADJUSTMENTS);
            }}
            className="px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap"
          >
            Usar Retrato Modelo
          </button>
          <button
            onClick={handleAnalyzeWithAi}
            disabled={isAnalyzing || !sourceImg}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-zinc-100 text-zinc-950 font-semibold text-xs hover:bg-white transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isAnalyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {isAnalyzing ? 'Analisando Luz...' : 'Harmonizar Luz com IA'}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={aspectId}
            onChange={(e) => setAspectId(e.target.value as AspectPresetId)}
            className="rounded-lg bg-[#09090B] border border-zinc-800 px-3 py-2 text-xs font-mono-tabular text-zinc-200"
          >
            {Object.values(ASPECT_PRESETS).map((ap) => (
              <option key={ap.id} value={ap.id}>
                {ap.label} ({ap.ratioLabel})
              </option>
            ))}
          </select>
        </div>
      </div>

      {analysisError && (
        <div className="rounded-lg bg-red-950/50 border border-red-900 px-4 py-2.5 text-xs text-red-200">
          {analysisError}
        </div>
      )}

      {aiAnalysis && (
        <div className="rounded-xl bg-[#111115] border border-zinc-800 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <p className="text-zinc-300">
            <span className="text-[#F2B705] font-semibold mr-1.5">Diagnóstico IA:</span>
            {aiAnalysis.subjectDescription}
          </p>
          <span className="text-zinc-400 shrink-0 font-mono-tabular">
            Modo: {aiAnalysis.recommendedCutoutMode}
          </span>
        </div>
      )}

      {/* Main Studio Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Live Interactive Studio Canvas */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0D0D10] border border-zinc-800 p-5 flex flex-col items-center justify-center min-h-[540px]">
          {/* Interactive Pointer Mode Bar */}
          <div className="w-full flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-lg border border-zinc-800">
              <button
                onClick={() => setToolMode('move')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  toolMode === 'move' ? 'bg-[#F2B705] text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <Move className="w-3.5 h-3.5" />
                Mover
              </button>
              <button
                onClick={() => setToolMode('erase')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  toolMode === 'erase' ? 'bg-[#F2B705] text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
                Apagar Fundo
              </button>
              <button
                onClick={() => setToolMode('restore')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  toolMode === 'restore' ? 'bg-[#F2B705] text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <Brush className="w-3.5 h-3.5" />
                Restaurar
              </button>
            </div>

            {toolMode !== 'move' ? (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-400">
                  Pincel
                  <input
                    type="range"
                    min={8}
                    max={80}
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="w-24 accent-[#F2B705]"
                  />
                </label>
                <button
                  onClick={clearManualBrush}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-zinc-900 border border-zinc-700 text-xs text-zinc-300 hover:text-white"
                >
                  <RotateCcw className="w-3 h-3" />
                  Limpar Pincel
                </button>
              </div>
            ) : (
              <span className="text-xs font-mono-tabular text-zinc-400">
                {preset.width}×{preset.height}
              </span>
            )}
          </div>

          <canvas
            ref={previewCanvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`max-h-[62vh] w-auto rounded-xl border border-zinc-800 shadow-2xl touch-none ${
              toolMode === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
            }`}
          />
        </div>

        {/* Right: Studio Inspector */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111115] border border-zinc-800 p-5 space-y-5">
          {/* Inspector Section Tabs */}
          <div className="grid grid-cols-3 gap-1 p-1 bg-[#09090B] rounded-lg border border-zinc-800">
            <button
              onClick={() => setStudioTab('backdrop')}
              className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                studioTab === 'backdrop' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              01. Cenário
            </button>
            <button
              onClick={() => setStudioTab('cutout')}
              className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                studioTab === 'cutout' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              02. Recorte
            </button>
            <button
              onClick={() => setStudioTab('lighting')}
              className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                studioTab === 'lighting' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              03. Luz &amp; Cor
            </button>
          </div>

          {studioTab === 'backdrop' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-zinc-300">Planos de Fundo de Estúdio</p>
                <input
                  ref={backdropFileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUploadCustomBackdrop}
                  className="hidden"
                />
                <button
                  onClick={() => backdropFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-xs text-[#F2B705] hover:underline"
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Subir Fundo Próprio
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                {allBackdrops.map((bg) => {
                  const selected = activeBackdrop.id === bg.id;
                  return (
                    <button
                      key={bg.id}
                      onClick={() => onChangeBackdrop(bg)}
                      className={`p-2.5 rounded-xl text-left border transition-colors ${
                        selected
                          ? 'bg-[#F2B705]/10 border-[#F2B705]'
                          : 'bg-[#09090B] border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div
                        className="w-full h-12 rounded-lg mb-2 border border-white/10 bg-cover bg-center"
                        style={
                          bg.imageUrl
                            ? { backgroundImage: `url(${bg.imageUrl})` }
                            : {
                                background: `linear-gradient(135deg, ${bg.palette.shadow}, ${bg.palette.mid}, ${bg.palette.highlight})`,
                              }
                        }
                      />
                      <p className="text-xs font-medium text-zinc-100 truncate">{bg.name}</p>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3 pt-3 border-t border-zinc-800">
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Desfoque de Lente (Bokeh Fundo)</span>
                    <span className="font-mono-tabular">{activeBackdrop.texture.blur}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={35}
                    value={activeBackdrop.texture.blur}
                    onChange={(e) =>
                      onChangeBackdrop({
                        ...activeBackdrop,
                        texture: { ...activeBackdrop.texture, blur: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Vinheta de Estúdio</span>
                    <span className="font-mono-tabular">{activeBackdrop.lighting.vignette}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={activeBackdrop.lighting.vignette}
                    onChange={(e) =>
                      onChangeBackdrop({
                        ...activeBackdrop,
                        lighting: { ...activeBackdrop.lighting, vignette: Number(e.target.value) },
                      })
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
              </div>
            </div>
          )}

          {studioTab === 'cutout' && (
            <div className="space-y-4">
              <label className="flex items-center justify-between p-3 rounded-lg bg-[#09090B] border border-zinc-800 cursor-pointer">
                <span className="text-xs font-medium text-zinc-200">
                  Ativar Recorte Automático de Fundo
                </span>
                <input
                  type="checkbox"
                  checked={cutout.enabled}
                  onChange={(e) => setCutout((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="accent-[#F2B705] w-4 h-4"
                />
              </label>

              <div>
                <p className="text-xs text-zinc-400 mb-1.5">Tipo de Fundo Original da Foto</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      ['light-bg', 'Fundo Claro / Neutro'],
                      ['dark-bg', 'Fundo Escuro'],
                      ['chroma', 'Cor Uniforme'],
                      ['auto', 'Misto / Automático'],
                    ] as const
                  ).map(([modeId, label]) => (
                    <button
                      key={modeId}
                      onClick={() => setCutout((prev) => ({ ...prev, mode: modeId }))}
                      className={`px-3 py-2 rounded-lg text-xs text-left border transition-colors ${
                        cutout.mode === modeId
                          ? 'bg-[#F2B705]/15 border-[#F2B705] text-zinc-100'
                          : 'bg-[#09090B] border-zinc-800 text-zinc-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Tolerância do Recorte</span>
                    <span className="font-mono-tabular">{cutout.tolerance}%</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={90}
                    value={cutout.tolerance}
                    onChange={(e) =>
                      setCutout((prev) => ({ ...prev, tolerance: Number(e.target.value) }))
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Suavização de Contorno (Feather)</span>
                    <span className="font-mono-tabular">{cutout.feather}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={25}
                    value={cutout.feather}
                    onChange={(e) =>
                      setCutout((prev) => ({ ...prev, feather: Number(e.target.value) }))
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-400 mb-1">
                    <span>Limpeza de Halo / Descontaminação</span>
                    <span className="font-mono-tabular">{cutout.edgeCleanup}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={cutout.edgeCleanup}
                    onChange={(e) =>
                      setCutout((prev) => ({ ...prev, edgeCleanup: Number(e.target.value) }))
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
              </div>
            </div>
          )}

          {studioTab === 'lighting' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="inline-flex items-center gap-1.5 text-zinc-200 font-medium">
                  <Sun className="w-3.5 h-3.5 text-[#F2B705]" />
                  Colorimetria &amp; Luz de Estúdio
                </span>
                <button
                  onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                  className="text-zinc-400 hover:text-zinc-100 underline"
                >
                  Resetar
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Brilho</span>
                    <span className="font-mono-tabular">{adjustments.brightness}</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    value={adjustments.brightness}
                    onChange={(e) =>
                      setAdjustments((p) => ({ ...p, brightness: Number(e.target.value) }))
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Contraste</span>
                    <span className="font-mono-tabular">{adjustments.contrast}</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={45}
                    value={adjustments.contrast}
                    onChange={(e) =>
                      setAdjustments((p) => ({ ...p, contrast: Number(e.target.value) }))
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Saturação</span>
                    <span className="font-mono-tabular">{adjustments.saturation}</span>
                  </div>
                  <input
                    type="range"
                    min={-80}
                    max={60}
                    value={adjustments.saturation}
                    onChange={(e) =>
                      setAdjustments((p) => ({ ...p, saturation: Number(e.target.value) }))
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Temperatura</span>
                    <span className="font-mono-tabular">{adjustments.warmth}</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    value={adjustments.warmth}
                    onChange={(e) =>
                      setAdjustments((p) => ({ ...p, warmth: Number(e.target.value) }))
                    }
                    className="w-full accent-[#F2B705]"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span>Luz de Contorno (Rim Light)</span>
                      <span className="font-mono-tabular">{adjustments.rimLightIntensity}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={adjustments.rimLightIntensity}
                      onChange={(e) =>
                        setAdjustments((p) => ({
                          ...p,
                          rimLightIntensity: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-[#F2B705]"
                    />
                  </div>
                  <input
                    type="color"
                    value={adjustments.rimLightColor}
                    onChange={(e) =>
                      setAdjustments((p) => ({ ...p, rimLightColor: e.target.value }))
                    }
                    className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer shrink-0"
                    title="Cor da luz de contorno"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span>Sombra de Estúdio</span>
                      <span className="font-mono-tabular">
                        {adjustments.contactShadowOpacity}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={adjustments.contactShadowOpacity}
                      onChange={(e) =>
                        setAdjustments((p) => ({
                          ...p,
                          contactShadowOpacity: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-[#F2B705]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-zinc-400 mb-1">
                      <span>Escala Sujeito</span>
                      <span className="font-mono-tabular">
                        {Math.round(adjustments.subjectScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={40}
                      max={160}
                      value={Math.round(adjustments.subjectScale * 100)}
                      onChange={(e) =>
                        setAdjustments((p) => ({
                          ...p,
                          subjectScale: Number(e.target.value) / 100,
                        }))
                      }
                      className="w-full accent-[#F2B705]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {savedMsg && (
            <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-xs text-zinc-200">
              {savedMsg}
            </div>
          )}

          {/* Export Actions */}
          <div className="pt-3 border-t border-zinc-800 space-y-2.5">
            <button
              onClick={async () => {
                const url = await exportCompositeDataUrl();
                triggerDataUrlDownload(url, `atelier-estudio-${aspectId}.png`);
                onImageGenerated?.('Foto Estúdio HD gerada e baixada!');
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors"
            >
              <Download className="w-4 h-4" />
              Baixar Foto Estúdio HD
            </button>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={async () => {
                  const url = await exportCompositeDataUrl();
                  await onSaveCreation({
                    id: `saved-photo-${Date.now()}`,
                    kind: 'photo-edit',
                    title: `Estúdio · ${activeBackdrop.name}`,
                    previewDataUrl: url,
                    aspectId,
                    createdAt: Date.now(),
                    backgroundData: activeBackdrop,
                  });
                  setSavedMsg('Foto salva na Coleção!');
                  setTimeout(() => setSavedMsg(null), 2400);
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium"
              >
                <Bookmark className="w-3.5 h-3.5" />
                Salvar
              </button>
              <button
                onClick={async () => {
                  const url = await exportCompositeDataUrl();
                  onOpenShare(
                    `Foto Estúdio — ${activeBackdrop.name}`,
                    url,
                    aiAnalysis?.socialCaption ||
                      `Novo retrato editado no Atelier Club com iluminação de estúdio (${activeBackdrop.name}).`,
                    aiAnalysis?.hashtags || [
                      '#AtelierClub',
                      '#RetratoEstudio',
                      '#EdicaoDeFotos',
                      '#InstagramBrasil',
                    ],
                    exportCompositeDataUrl
                  );
                }}
                className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium"
              >
                <Share2 className="w-3.5 h-3.5" />
                Instagram / FB
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-zinc-500 pt-1">
            <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
            <span>Dica: arraste a foto na prancheta para reenquadrar ou use os pincéis para refinar o recorte.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
