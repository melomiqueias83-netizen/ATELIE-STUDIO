export type AppTab = 'gallery' | 'templates' | 'background' | 'photo' | 'faq' | 'admin';

export type AspectPresetId =
  | 'mobile-9-16'
  | 'desktop-16-9'
  | 'ig-square-1-1'
  | 'ig-portrait-4-5'
  | 'ig-story-9-16'
  | 'fb-post-1200-630';

export interface AspectPreset {
  id: AspectPresetId;
  label: string;
  platform: string;
  width: number;
  height: number;
  ratioLabel: string;
}

export type BackgroundPatternType =
  | 'cyclorama'
  | 'mesh'
  | 'architectural'
  | 'silk'
  | 'botanical'
  | 'geometric'
  | 'horizon';

export interface StudioBackgroundRecipe {
  id: string;
  name: string;
  description: string;
  patternType: BackgroundPatternType;
  palette: {
    base: string;
    mid: string;
    highlight: string;
    shadow: string;
    accent: string;
  };
  lighting: {
    angle: number; // 0-360 degrees
    intensity: number; // 0-100
    softness: number; // 0-100
    vignette: number; // 0-100
  };
  texture: {
    grain: number; // 0-60
    blur: number; // 0-40
    bokehCount: number; // 0-40
  };
  socialCaption?: string;
  hashtags?: string[];
  imageUrl?: string; // optional photographic backdrop
}

export type TemplateLayerKind = 'text' | 'circle' | 'rect' | 'arch' | 'line' | 'pill';

export interface TemplateLayer {
  id: string;
  kind: TemplateLayerKind;
  name: string;
  content: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  rotation: number; // degrees
  color: string;
  opacity: number; // 0-1
  fontFamily: 'Outfit' | 'Cormorant Garamond' | 'Plus Jakarta Sans' | 'JetBrains Mono';
  fontSize: number; // relative scale 12-140
  fontWeight: '400' | '500' | '600' | '700';
  letterSpacing: number; // px
  align: 'left' | 'center' | 'right';
  shadow: boolean;
  italic?: boolean;
  strokeOnly?: boolean;
}

export interface EditableTemplate {
  id: string;
  title: string;
  category: string;
  aspectRatio: AspectPresetId;
  background: StudioBackgroundRecipe;
  layers: TemplateLayer[];
  socialCaption: string;
  hashtags: string[];
  createdAt: number;
}

export type QuickFilterTag =
  | 'Minimalista'
  | 'Cinéfilo'
  | 'Vintage'
  | 'AMOLED'
  | 'Arquitetônico'
  | 'Solar';

export interface WallpaperItem {
  id: string;
  title: string;
  author: string;
  category:
    | 'Fotografia Editorial'
    | 'Estúdio & Luz'
    | 'Abstrato & Seda'
    | 'Arquitetura'
    | 'Minimalista Noturno';
  tags: QuickFilterTag[];
  resolution: string;
  aspectLabel: string;
  imageUrl?: string;
  recipe?: StudioBackgroundRecipe;
  palette: string[];
  cameraSpec: string;
  isFeatured?: boolean;
}

export interface CatalogOverrideRecord extends WallpaperItem {
  isHidden: boolean;
  createdBy?: string;
  updatedAt?: number;
}

export interface AdSenseConfig {
  enabled: boolean;
  clientId: string; // e.g. ca-pub-1234567890123456
  gallerySlotId: string;
  studioSlotId: string;
  footerSlotId: string;
  autoAds: boolean;
}

export interface AdMobConfig {
  enabled: boolean;
  appId: string; // e.g. ca-app-pub-1234567890123456~1234567890
  bannerUnitId: string; // e.g. ca-app-pub-1234567890123456/1234567890
  interstitialUnitId: string;
  rewardedUnitId: string;
  testMode: boolean;
  frequencyMinutes: number;
}

export interface AnnouncementBannerConfig {
  enabled: boolean;
  text: string;
  ctaLabel: string;
  targetTab: 'gallery' | 'templates' | 'background' | 'photo';
}

export interface DonationConfig {
  enabled: boolean;
  pixKey: string;
  recipientName: string;
  recipientCity: string;
  thankYouMessage: string;
}

export interface FcmConfig {
  enabled: boolean;
  vapidKey: string;
  autoNotifyOnNewWallpaper: boolean;
}

export interface MonetizationConfig {
  adsEnabled: boolean;
  adsense: AdSenseConfig;
  admob: AdMobConfig;
  announcementBanner: AnnouncementBannerConfig;
  donation: DonationConfig;
  fcm: FcmConfig;
}

export interface PushSubscriptionRecord {
  id: string;
  uid: string;
  token: string;
  platform: 'web' | 'android';
  enabled: boolean;
  topic: 'new_collections';
  updatedAt?: number;
}

export interface CollectionAlertRecord {
  id: string;
  title: string;
  body: string;
  category:
    | 'Todos'
    | 'Fotografia Editorial'
    | 'Estúdio & Luz'
    | 'Abstrato & Seda'
    | 'Arquitetura'
    | 'Minimalista Noturno';
  wallpaperId: string;
  imageUrl: string;
  createdBy: string;
  createdAtMs: number;
}

export interface PhotoAdjustments {
  brightness: number; // -50 to +50
  contrast: number; // -50 to +50
  saturation: number; // -100 to +100
  warmth: number; // -50 to +50
  rimLightIntensity: number; // 0 to 100
  rimLightColor: string;
  contactShadowOpacity: number; // 0 to 100
  subjectScale: number; // 0.3 to 1.8
  subjectOffsetX: number; // -50 to 50 %
  subjectOffsetY: number; // -50 to 50 %
}

export interface CutoutSettings {
  enabled: boolean;
  mode: 'auto' | 'light-bg' | 'dark-bg' | 'chroma';
  tolerance: number; // 5 to 95
  feather: number; // 0 to 25
  edgeCleanup: number; // 0 to 100
}

export interface PhotoAnalysisResult {
  subjectDescription: string;
  recommendedCutoutMode: 'auto' | 'light-bg' | 'dark-bg' | 'chroma';
  suggestedColorMatch: {
    brightness: number;
    contrast: number;
    warmth: number;
    saturation: number;
    rimLightColor: string;
    rimLightIntensity: number;
    contactShadowOpacity: number;
  };
  suggestedStudioPrompt: string;
  socialCaption: string;
  hashtags: string[];
}

export interface SavedCreation {
  id: string;
  kind: 'wallpaper' | 'template' | 'background' | 'photo-edit';
  title: string;
  previewDataUrl: string;
  aspectId: AspectPresetId;
  createdAt: number;
  templateData?: EditableTemplate;
  backgroundData?: StudioBackgroundRecipe;
}

export interface LocalProfile {
  name: string;
  handle: string;
  defaultPlatform: 'instagram' | 'facebook';
}

export type AiHistoryKind = 'template' | 'background' | 'photo-analysis';

export interface AiHistoryEntry {
  id: string;
  kind: AiHistoryKind;
  prompt: string;
  resultTitle: string;
  resultSummary: string;
  aspectId?: AspectPresetId;
  category?: string;
  mood?: string;
  templateData?: EditableTemplate;
  backgroundData?: StudioBackgroundRecipe;
  photoAnalysisData?: PhotoAnalysisResult;
  createdAt: number;
}

export interface TemplatePromptSeed {
  prompt: string;
  category?: string;
  mood?: string;
  nonce: number;
}

export interface BackgroundPromptSeed {
  prompt: string;
  style?: string;
  lightingMood?: string;
  nonce: number;
}

export interface PhotoAnalysisSeed {
  analysis: PhotoAnalysisResult;
  nonce: number;
}
