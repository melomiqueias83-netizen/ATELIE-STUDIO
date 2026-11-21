import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, ExternalLink, Share2, X } from 'lucide-react';
import { ASPECT_PRESETS } from '../data/catalog';
import { triggerDataUrlDownload } from '../lib/studioRenderer';
import { AspectPresetId, LocalProfile } from '../types/studio';

interface SocialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  imageDataUrl: string;
  defaultCaption?: string;
  defaultHashtags?: string[];
  profile: LocalProfile;
  onExportVariant?: (presetId: AspectPresetId) => Promise<string>;
}

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  isOpen,
  onClose,
  title,
  imageDataUrl,
  defaultCaption = 'Criado no Atelier Club com iluminação estilo estúdio e zero anúncios.',
  defaultHashtags = ['#AtelierClub', '#EstudioIA', '#DesignCriativo', '#Wallpaper4K'],
  profile,
  onExportVariant,
}) => {
  const [platform, setPlatform] = useState<'instagram-feed' | 'instagram-story' | 'facebook'>('instagram-feed');
  const [caption, setCaption] = useState(defaultCaption);
  const [hashtagsText, setHashtagsText] = useState(defaultHashtags.join(' '));
  const [copied, setCopied] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState(imageDataUrl);
  const [busyExport, setBusyExport] = useState(false);

  useEffect(() => {
    setCaption(defaultCaption);
    setHashtagsText(defaultHashtags.join(' '));
    setActivePreviewUrl(imageDataUrl);
    setStatusNotice(null);
  }, [isOpen, imageDataUrl, defaultCaption, defaultHashtags]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fullCopyText = `${caption.trim()}\n\n${hashtagsText.trim()}`.trim();

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(fullCopyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setStatusNotice('Selecione e copie o texto da legenda manualmente.');
    }
  };

  const getTargetPreset = (): AspectPresetId => {
    if (platform === 'instagram-story') return 'ig-story-9-16';
    if (platform === 'facebook') return 'fb-post-1200-630';
    return 'ig-portrait-4-5';
  };

  const resolveImageForPlatform = async (): Promise<string> => {
    if (!onExportVariant) return activePreviewUrl;
    setBusyExport(true);
    try {
      const rendered = await onExportVariant(getTargetPreset());
      setActivePreviewUrl(rendered);
      return rendered;
    } finally {
      setBusyExport(false);
    }
  };

  const handleInstagramPack = async () => {
    const dataUrl = await resolveImageForPlatform();
    const preset = ASPECT_PRESETS[getTargetPreset()];
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'atelier';
    triggerDataUrlDownload(dataUrl, `${slug}-${preset.id}.png`);
    try {
      await navigator.clipboard.writeText(fullCopyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // clipboard fallback ignored
    }
    setStatusNotice(
      `Imagem ${preset.width}×${preset.height} baixada e legenda copiada. Pronta para publicar no Instagram!`
    );
  };

  const handleFacebookShare = async () => {
    const dataUrl = await resolveImageForPlatform();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'atelier';
    triggerDataUrlDownload(dataUrl, `${slug}-facebook-1200x630.png`);
    try {
      await navigator.clipboard.writeText(fullCopyText);
    } catch {
      // ignore
    }

    // Try Web Share API with file first on supported devices
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${slug}-facebook.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title,
          text: fullCopyText,
          files: [file],
        });
        setStatusNotice('Compartilhado via menu nativo do dispositivo!');
        return;
      }
    } catch {
      // fallback to download + notice
    }

    const fbUrl = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(fullCopyText)}`;
    const link = document.createElement('a');
    link.href = fbUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
    setStatusNotice('Arte em alta resolução baixada e janela do Facebook aberta.');
  };

  const handleNativeShare = async () => {
    const dataUrl = await resolveImageForPlatform();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 32) || 'atelier';
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${slug}.png`, { type: 'image/png' });
      if (navigator.share) {
        await navigator.share({
          title,
          text: fullCopyText,
          files: navigator.canShare && navigator.canShare({ files: [file] }) ? [file] : undefined,
        });
        setStatusNotice('Compartilhamento concluído.');
        return;
      }
    } catch {
      // user cancelled or unsupported
    }
    triggerDataUrlDownload(dataUrl, `${slug}.png`);
    setStatusNotice('Arquivo PNG em alta resolução baixado.');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Compartilhar nas Redes Sociais"
    >
      <div className="relative w-full max-w-4xl rounded-2xl bg-[#111115] border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Publicar &amp; Exportar para Redes</h2>
            <p className="text-xs text-zinc-400">
              Formato otimizado sem marca d&apos;água · {title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 overflow-y-auto">
          {/* Left: Social Mockup Preview */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center bg-[#09090B] rounded-xl border border-zinc-800/80 p-5">
            <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-lg mb-4 border border-zinc-800">
              <button
                onClick={async () => {
                  setPlatform('instagram-feed');
                  if (onExportVariant) setActivePreviewUrl(await onExportVariant('ig-portrait-4-5'));
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  platform === 'instagram-feed'
                    ? 'bg-[#F2B705] text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Instagram Feed
              </button>
              <button
                onClick={async () => {
                  setPlatform('instagram-story');
                  if (onExportVariant) setActivePreviewUrl(await onExportVariant('ig-story-9-16'));
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  platform === 'instagram-story'
                    ? 'bg-[#F2B705] text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Stories 9:16
              </button>
              <button
                onClick={async () => {
                  setPlatform('facebook');
                  if (onExportVariant) setActivePreviewUrl(await onExportVariant('fb-post-1200-630'));
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  platform === 'facebook'
                    ? 'bg-[#F2B705] text-zinc-950'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Facebook Post
              </button>
            </div>

            {platform === 'instagram-story' ? (
              <div className="w-[210px] aspect-[9/16] rounded-[24px] border-4 border-zinc-800 bg-black overflow-hidden relative shadow-xl">
                <img
                  src={activePreviewUrl}
                  alt={title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 inset-x-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#F2B705] text-zinc-950 flex items-center justify-center text-[10px] font-bold">
                    {profile.name.slice(0, 1).toUpperCase()}
                  </div>
                  <span className="text-[11px] font-medium text-white drop-shadow">{profile.handle}</span>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-[320px] rounded-xl bg-[#16161B] border border-zinc-800 overflow-hidden shadow-xl">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800/70">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#F2B705] text-zinc-950 flex items-center justify-center text-xs font-bold">
                      {profile.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-100 leading-tight">{profile.name}</p>
                      <p className="text-[11px] text-zinc-400 leading-tight">
                        {platform === 'facebook' ? 'Facebook · Agora' : profile.handle}
                      </p>
                    </div>
                  </div>
                </div>
                <div
                  className={`w-full bg-black overflow-hidden ${
                    platform === 'facebook' ? 'aspect-[1200/630]' : 'aspect-[4/5]'
                  }`}
                >
                  <img
                    src={activePreviewUrl}
                    alt={title}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 text-xs text-zinc-300 line-clamp-2">
                  <span className="font-semibold text-zinc-100 mr-1.5">{profile.handle}</span>
                  {caption}
                </div>
              </div>
            )}
          </div>

          {/* Right: Caption & Share Actions */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-zinc-300">Legenda sugerida</label>
                  <button
                    onClick={handleCopyCaption}
                    className="inline-flex items-center gap-1.5 text-xs text-[#F2B705] hover:underline"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado' : 'Copiar legenda'}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full rounded-lg bg-[#09090B] border border-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-[#F2B705]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Hashtags</label>
                <input
                  type="text"
                  value={hashtagsText}
                  onChange={(e) => setHashtagsText(e.target.value)}
                  className="w-full rounded-lg bg-[#09090B] border border-zinc-800 px-3 py-2 text-xs font-mono-tabular text-zinc-200 focus:outline-none focus:border-[#F2B705]"
                />
              </div>

              {statusNotice && (
                <div className="rounded-lg bg-zinc-900 border border-zinc-700 px-3.5 py-2.5 text-xs text-zinc-200">
                  {statusNotice}
                </div>
              )}
            </div>

            <div className="space-y-2.5 pt-2">
              <button
                onClick={handleInstagramPack}
                disabled={busyExport}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#F2B705] text-zinc-950 font-semibold text-sm hover:bg-[#e5ad04] transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {busyExport ? 'Renderizando formato...' : 'Baixar para Instagram + Copiar Legenda'}
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleFacebookShare}
                  disabled={busyExport}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#1877F2] text-white font-medium text-xs hover:bg-[#166fe5] transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Facebook
                </button>
                <button
                  onClick={handleNativeShare}
                  disabled={busyExport}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-zinc-800 text-zinc-100 font-medium text-xs hover:bg-zinc-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Compartilhar Arquivo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
