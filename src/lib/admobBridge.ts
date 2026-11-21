import { AdMobConfig } from '../types/studio';

export const GOOGLE_TEST_ADMOB_IDS = {
  appId: 'ca-app-pub-3940256099942544~3347511713',
  bannerUnitId: 'ca-app-pub-3940256099942544/6300978111',
  interstitialUnitId: 'ca-app-pub-3940256099942544/1033173712',
  rewardedUnitId: 'ca-app-pub-3940256099942544/5224354917',
};

interface CapacitorAdMobPlugin {
  initialize?: (options?: {
    requestTrackingAuthorization?: boolean;
    initializeForTesting?: boolean;
  }) => Promise<void>;
  showBanner?: (options: {
    adId: string;
    adSize?: string;
    position?: string;
    margin?: number;
    isTesting?: boolean;
  }) => Promise<void>;
  hideBanner?: () => Promise<void>;
  removeBanner?: () => Promise<void>;
  prepareInterstitial?: (options: { adId: string; isTesting?: boolean }) => Promise<void>;
  showInterstitial?: () => Promise<void>;
}

interface CapacitorBridgeWindow extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: {
      AdMob?: CapacitorAdMobPlugin;
    };
  };
  adsbygoogle?: Array<Record<string, unknown>>;
}

export function detectAdRuntime(): 'android-capacitor' | 'web' {
  if (typeof window === 'undefined') return 'web';
  const w = window as CapacitorBridgeWindow;
  if (w.Capacitor?.isNativePlatform?.() && w.Capacitor?.getPlatform?.() === 'android') {
    return 'android-capacitor';
  }
  return 'web';
}

export function isValidAdSenseClientId(clientId: string): boolean {
  return /^ca-pub-[0-9]{10,20}$/.test(clientId.trim());
}

export function isValidAdSenseSlotId(slotId: string): boolean {
  return /^[0-9]{6,20}$/.test(slotId.trim());
}

export function isValidAdMobAppId(appId: string): boolean {
  return /^ca-app-pub-[0-9]+~[0-9]+$/.test(appId.trim());
}

export function isValidAdMobUnitId(unitId: string): boolean {
  return /^ca-app-pub-[0-9]+\/[0-9]+$/.test(unitId.trim());
}

const loadedAdSenseClients = new Set<string>();

export function ensureAdSenseScriptLoaded(clientId: string): boolean {
  if (typeof document === 'undefined') return false;
  const cleanId = clientId.trim();
  if (!isValidAdSenseClientId(cleanId)) return false;
  if (loadedAdSenseClients.has(cleanId)) return true;

  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-atelier-adsense="${cleanId}"]`
  );
  if (existing) {
    loadedAdSenseClients.add(cleanId);
    return true;
  }

  const script = document.createElement('script');
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.dataset.atelierAdsense = cleanId;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
    cleanId
  )}`;
  document.head.appendChild(script);
  loadedAdSenseClients.add(cleanId);
  return true;
}

let lastInterstitialTimestamp = 0;
let admobInitialized = false;

export async function syncCapacitorAdMobRuntime(
  admob: AdMobConfig,
  adsEnabled: boolean
): Promise<void> {
  if (detectAdRuntime() !== 'android-capacitor') return;
  const w = window as CapacitorBridgeWindow;
  const plugin = w.Capacitor?.Plugins?.AdMob;
  if (!plugin) return;

  try {
    if (!adsEnabled || !admob.enabled) {
      await plugin.hideBanner?.();
      return;
    }

    if (!admobInitialized) {
      await plugin.initialize?.({
        requestTrackingAuthorization: true,
        initializeForTesting: admob.testMode,
      });
      admobInitialized = true;
    }

    const bannerId = admob.testMode
      ? GOOGLE_TEST_ADMOB_IDS.bannerUnitId
      : admob.bannerUnitId.trim();

    if (isValidAdMobUnitId(bannerId)) {
      await plugin.showBanner?.({
        adId: bannerId,
        adSize: 'ADAPTIVE_BANNER',
        position: 'BOTTOM_CENTER',
        margin: 0,
        isTesting: admob.testMode,
      });
    }
  } catch (err) {
    console.warn('AdMob Capacitor sync warning:', err);
  }
}

export async function maybeShowAdMobInterstitial(
  admob: AdMobConfig,
  adsEnabled: boolean
): Promise<void> {
  if (detectAdRuntime() !== 'android-capacitor') return;
  if (!adsEnabled || !admob.enabled) return;

  const w = window as CapacitorBridgeWindow;
  const plugin = w.Capacitor?.Plugins?.AdMob;
  if (!plugin) return;

  const unitId = admob.testMode
    ? GOOGLE_TEST_ADMOB_IDS.interstitialUnitId
    : admob.interstitialUnitId.trim();
  if (!isValidAdMobUnitId(unitId)) return;

  const now = Date.now();
  const minIntervalMs = Math.max(1, admob.frequencyMinutes) * 60_000;
  if (now - lastInterstitialTimestamp < minIntervalMs) return;

  try {
    await plugin.prepareInterstitial?.({
      adId: unitId,
      isTesting: admob.testMode,
    });
    await plugin.showInterstitial?.();
    lastInterstitialTimestamp = now;
  } catch (err) {
    console.warn('AdMob interstitial skipped:', err);
  }
}
