import React, { useEffect, useRef } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  detectAdRuntime,
  ensureAdSenseScriptLoaded,
  isValidAdMobUnitId,
  isValidAdSenseClientId,
  isValidAdSenseSlotId,
} from '../lib/admobBridge';
import { MonetizationConfig } from '../types/studio';

interface AdBannerSlotProps {
  placement: 'gallery' | 'studio' | 'footer';
  monetization: MonetizationConfig;
  isAdmin: boolean;
  onOpenAdmin?: () => void;
}

const PLACEMENT_LABELS: Record<AdBannerSlotProps['placement'], string> = {
  gallery: 'Bloco Galeria 4K',
  studio: 'Bloco Estúdio Criativo',
  footer: 'Bloco Rodapé Editorial',
};

export const AdBannerSlot: React.FC<AdBannerSlotProps> = ({
  placement,
  monetization,
  isAdmin,
  onOpenAdmin,
}) => {
  const insRef = useRef<HTMLModElement | null>(null);
  const pushedKeyRef = useRef<string>('');
  const runtime = detectAdRuntime();

  const slotId =
    placement === 'gallery'
      ? monetization.adsense.gallerySlotId
      : placement === 'studio'
      ? monetization.adsense.studioSlotId
      : monetization.adsense.footerSlotId;

  const clientId = monetization.adsense.clientId.trim();
  const hasValidWebAd =
    runtime === 'web' &&
    monetization.adsEnabled &&
    monetization.adsense.enabled &&
    isValidAdSenseClientId(clientId) &&
    isValidAdSenseSlotId(slotId);

  const hasValidAndroidAd =
    runtime === 'android-capacitor' &&
    monetization.adsEnabled &&
    monetization.admob.enabled &&
    (monetization.admob.testMode || isValidAdMobUnitId(monetization.admob.bannerUnitId));

  useEffect(() => {
    if (!hasValidWebAd) return;
    const loaded = ensureAdSenseScriptLoaded(clientId);
    if (!loaded || !insRef.current) return;

    const pushKey = `${clientId}:${slotId}:${placement}`;
    if (pushedKeyRef.current === pushKey) return;

    try {
      const win = window as Window & { adsbygoogle?: Array<Record<string, unknown>> };
      win.adsbygoogle = win.adsbygoogle || [];
      win.adsbygoogle.push({});
      pushedKeyRef.current = pushKey;
    } catch {
      // AdSense script still initializing or blocked by browser extension
    }
  }, [hasValidWebAd, clientId, slotId, placement]);

  if (!monetization.adsEnabled) {
    return null;
  }

  // Native Android APK (Capacitor + AdMob) renders native bottom banner via admobBridge
  if (runtime === 'android-capacitor') {
    if (!hasValidAndroidAd) return null;
    if (placement !== 'footer') return null;
    return (
      <div
        className="h-14 w-full flex items-center justify-center text-[11px] text-zinc-500 border-t border-zinc-900"
        aria-label="Espaço reservado para banner nativo AdMob"
      >
        Publicidade Android · AdMob ativo
      </div>
    );
  }

  // Live Google AdSense web unit
  if (hasValidWebAd) {
    return (
      <aside
        aria-label={`Publicidade · ${PLACEMENT_LABELS[placement]}`}
        className="rounded-2xl bg-[#111115] border border-zinc-800/80 px-5 py-4"
      >
        <div className="flex items-center justify-between gap-4 mb-2.5">
          <span className="text-[11px] font-medium tracking-wide text-zinc-500">
            Publicidade · {PLACEMENT_LABELS[placement]}
          </span>
          {isAdmin && onOpenAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="text-[11px] text-zinc-400 hover:text-[#F2B705] transition-colors inline-flex items-center gap-1"
            >
              <SlidersHorizontal className="w-3 h-3" />
              Gerenciar bloco
            </button>
          )}
        </div>
        <div className="min-h-[90px] w-full overflow-hidden flex items-center justify-center">
          <ins
            ref={insRef}
            className="adsbygoogle block w-full"
            style={{ display: 'block', minHeight: '90px' }}
            data-ad-client={clientId}
            data-ad-slot={slotId.trim()}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        </div>
      </aside>
    );
  }

  // Only show configuration hint to verified Admin when ads are enabled without valid IDs yet
  if (isAdmin) {
    return (
      <aside className="rounded-xl bg-[#111115] border border-dashed border-zinc-700/80 px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-zinc-200">
            Espaço AdSense reservado · {PLACEMENT_LABELS[placement]}
          </p>
          <p className="text-[11px] text-zinc-400">
            Visível apenas para você (Admin). Preencha o Publisher ID e o Slot ID para exibir anúncios reais aos usuários.
          </p>
        </div>
        {onOpenAdmin && (
          <button
            type="button"
            onClick={onOpenAdmin}
            className="px-3.5 py-2 rounded-lg bg-[#16161B] border border-zinc-700 text-xs font-medium text-[#F2B705] hover:border-[#F2B705] transition-colors whitespace-nowrap shrink-0"
          >
            Configurar no Painel Admin
          </button>
        )}
      </aside>
    );
  }

  return null;
};
