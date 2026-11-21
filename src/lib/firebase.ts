import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AiHistoryEntry,
  AspectPresetId,
  CatalogOverrideRecord,
  CollectionAlertRecord,
  EditableTemplate,
  LocalProfile,
  MonetizationConfig,
  PhotoAnalysisResult,
  PushSubscriptionRecord,
  QuickFilterTag,
  StudioBackgroundRecipe,
  WallpaperItem,
} from '../types/studio';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'miqueiasmelouber@gmail.com';

export const DEFAULT_MONETIZATION_CONFIG: MonetizationConfig = {
  adsEnabled: false,
  adsense: {
    enabled: false,
    clientId: '',
    gallerySlotId: '',
    studioSlotId: '',
    footerSlotId: '',
    autoAds: false,
  },
  admob: {
    enabled: false,
    appId: '',
    bannerUnitId: '',
    interstitialUnitId: '',
    rewardedUnitId: '',
    testMode: true,
    frequencyMinutes: 5,
  },
  announcementBanner: {
    enabled: false,
    text: '',
    ctaLabel: 'Explorar',
    targetTab: 'gallery',
  },
  donation: {
    enabled: true,
    pixKey: 'miqueiasmelouber@gmail.com',
    recipientName: 'Atelier Club',
    recipientCity: 'SAO PAULO',
    thankYouMessage:
      'Sua contribuição mantém nossos servidores gratuitos e ajuda a trazer novos modelos de IA e papéis de parede 4K.',
  },
  fcm: {
    enabled: true,
    vapidKey: '',
    autoNotifyOnNewWallpaper: true,
  },
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(firebaseApp);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || `item_${Date.now()}`;
}

export function isBootstrappedAdminUser(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      user.email.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL
  );
}

export async function signInWithGoogle(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}

export async function ensureAdminDocIfAuthorized(user: User): Promise<boolean> {
  if (!user.emailVerified) return false;

  if (isBootstrappedAdminUser(user)) {
    const adminRef = doc(db, 'admins', user.uid);
    try {
      const snap = await getDoc(adminRef);
      if (!snap.exists()) {
        await setDoc(adminRef, {
          uid: user.uid,
          email: (user.email || BOOTSTRAPPED_ADMIN_EMAIL).slice(0, 254),
          role: 'admin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(adminRef, {
          email: (user.email || BOOTSTRAPPED_ADMIN_EMAIL).slice(0, 254),
          role: 'admin',
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      // Bootstrapped token admin access still applies in rules
    }
    return true;
  }

  try {
    const snap = await getDoc(doc(db, 'admins', user.uid));
    return snap.exists() && snap.data()?.role === 'admin';
  } catch {
    return false;
  }
}

export async function ensureUserProfileDocs(user: User): Promise<LocalProfile> {
  const uid = user.uid;
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;

  const displayName = (user.displayName || 'Criador Atelier').trim().slice(0, 80);
  const defaultHandle = `@${(user.email?.split('@')[0] || 'atelier')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30)}`;
  const photoUrl = (user.photoURL || '').slice(0, 500);

  let resolvedProfile: LocalProfile = {
    name: displayName,
    handle: defaultHandle,
    defaultPlatform: 'instagram',
  };

  try {
    const existingSnap = await getDoc(doc(db, 'users', uid));
    if (!existingSnap.exists()) {
      await setDoc(doc(db, 'users', uid), {
        uid,
        displayName,
        handle: defaultHandle,
        photoUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = existingSnap.data();
      resolvedProfile = {
        name: typeof data.displayName === 'string' ? data.displayName : displayName,
        handle: typeof data.handle === 'string' ? data.handle : defaultHandle,
        defaultPlatform: 'instagram',
      };
      await updateDoc(doc(db, 'users', uid), {
        displayName: resolvedProfile.name.slice(0, 80),
        handle: resolvedProfile.handle.slice(0, 50),
        photoUrl,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  if (user.email) {
    try {
      await setDoc(doc(db, 'users', uid, 'private', 'info'), {
        uid,
        email: user.email.slice(0, 254),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, privatePath);
    }
  }

  return resolvedProfile;
}

export async function updateUserProfileInFirestore(
  uid: string,
  displayName: string,
  handle: string,
  photoUrl = ''
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: displayName.trim().slice(0, 80) || 'Criador Atelier',
      handle: handle.trim().slice(0, 50) || '@atelierclub',
      photoUrl: photoUrl.slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function setFavoriteInFirestore(
  uid: string,
  wallpaperId: string,
  title: string,
  shouldFavorite: boolean
): Promise<void> {
  const safeId = sanitizeId(wallpaperId);
  const path = `users/${uid}/favorites/${safeId}`;
  try {
    if (shouldFavorite) {
      await setDoc(doc(db, 'users', uid, 'favorites', safeId), {
        uid,
        wallpaperId: safeId,
        title: title.slice(0, 120) || 'Wallpaper',
        createdAt: serverTimestamp(),
      });
    } else {
      await deleteDoc(doc(db, 'users', uid, 'favorites', safeId));
    }
  } catch (error) {
    handleFirestoreError(error, shouldFavorite ? OperationType.CREATE : OperationType.DELETE, path);
  }
}

export interface CloudProjectRecord {
  id: string;
  kind: 'template' | 'background';
  title: string;
  aspectId: AspectPresetId;
  socialCaption: string;
  hashtags: string[];
  background: StudioBackgroundRecipe;
  layers?: EditableTemplate['layers'];
}

export async function saveProjectInFirestore(
  uid: string,
  project: CloudProjectRecord
): Promise<void> {
  const safeId = sanitizeId(project.id);
  const path = `users/${uid}/projects/${safeId}`;

  const safeBg: Record<string, unknown> = {
    id: sanitizeId(project.background.id),
    name: (project.background.name || 'Fundo Estúdio').slice(0, 120),
    description: (project.background.description || '').slice(0, 300),
    patternType: project.background.patternType,
    palette: project.background.palette,
    lighting: project.background.lighting,
    texture: project.background.texture,
  };

  if (
    project.background.imageUrl &&
    !project.background.imageUrl.startsWith('data:') &&
    project.background.imageUrl.length <= 300
  ) {
    safeBg.imageUrl = project.background.imageUrl;
  }

  const baseFields: Record<string, unknown> = {
    title: (project.title || 'Projeto Atelier').slice(0, 120),
    aspectId: project.aspectId.slice(0, 32),
    socialCaption: (project.socialCaption || '').slice(0, 500),
    hashtags: (project.hashtags || []).slice(0, 10).map((h) => String(h).slice(0, 50)),
    background: safeBg,
    updatedAt: serverTimestamp(),
  };

  if (project.layers && project.layers.length > 0) {
    baseFields.layers = project.layers.slice(0, 20);
  }

  try {
    const ref = doc(db, 'users', uid, 'projects', safeId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, baseFields);
    } else {
      await setDoc(ref, {
        id: safeId,
        uid,
        kind: project.kind,
        ...baseFields,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProjectInFirestore(uid: string, projectId: string): Promise<void> {
  const safeId = sanitizeId(projectId);
  const path = `users/${uid}/projects/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'projects', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveMonetizationConfigInFirestore(
  uid: string,
  config: MonetizationConfig
): Promise<void> {
  const path = 'appConfig/monetization';
  const payload = {
    adsEnabled: Boolean(config.adsEnabled),
    adsense: {
      enabled: Boolean(config.adsense.enabled),
      clientId: config.adsense.clientId.trim().slice(0, 40),
      gallerySlotId: config.adsense.gallerySlotId.trim().slice(0, 30),
      studioSlotId: config.adsense.studioSlotId.trim().slice(0, 30),
      footerSlotId: config.adsense.footerSlotId.trim().slice(0, 30),
      autoAds: Boolean(config.adsense.autoAds),
    },
    admob: {
      enabled: Boolean(config.admob.enabled),
      appId: config.admob.appId.trim().slice(0, 60),
      bannerUnitId: config.admob.bannerUnitId.trim().slice(0, 60),
      interstitialUnitId: config.admob.interstitialUnitId.trim().slice(0, 60),
      rewardedUnitId: config.admob.rewardedUnitId.trim().slice(0, 60),
      testMode: Boolean(config.admob.testMode),
      frequencyMinutes: Math.max(1, Math.min(60, Math.round(config.admob.frequencyMinutes || 5))),
    },
    announcementBanner: {
      enabled: Boolean(config.announcementBanner.enabled),
      text: config.announcementBanner.text.trim().slice(0, 240),
      ctaLabel: (config.announcementBanner.ctaLabel.trim() || 'Explorar').slice(0, 40),
      targetTab: config.announcementBanner.targetTab,
    },
    donation: {
      enabled: Boolean(config.donation.enabled),
      pixKey: (config.donation.pixKey.trim() || BOOTSTRAPPED_ADMIN_EMAIL).slice(0, 120),
      recipientName: (config.donation.recipientName.trim() || 'Atelier Club').slice(0, 25),
      recipientCity: (config.donation.recipientCity.trim() || 'SAO PAULO').slice(0, 15),
      thankYouMessage: config.donation.thankYouMessage.trim().slice(0, 240),
    },
    fcm: {
      enabled: Boolean(config.fcm.enabled),
      vapidKey: (config.fcm.vapidKey || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 200),
      autoNotifyOnNewWallpaper: Boolean(config.fcm.autoNotifyOnNewWallpaper),
    },
    updatedBy: sanitizeId(uid),
    updatedAt: serverTimestamp(),
  };

  try {
    const ref = doc(db, 'appConfig', 'monetization');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveCatalogOverrideInFirestore(
  uid: string,
  item: CatalogOverrideRecord
): Promise<void> {
  const safeId = sanitizeId(item.id);
  const path = `catalogItems/${safeId}`;

  const cleanImageUrl = (item.imageUrl || '').trim().slice(0, 500);
  const validImageUrl =
    cleanImageUrl.startsWith('/src/assets/') || cleanImageUrl.startsWith('https://')
      ? cleanImageUrl
      : '';

  const paletteClean = (item.palette.length > 0 ? item.palette : ['#18181B', '#F2B705'])
    .slice(0, 6)
    .map((c) => String(c).slice(0, 16));

  const tagsClean = (item.tags || []).slice(0, 6).map((t) => String(t).slice(0, 32));

  const baseFields: Record<string, unknown> = {
    title: (item.title.trim() || 'Wallpaper 4K').slice(0, 120),
    author: (item.author.trim() || 'Atelier Club').slice(0, 80),
    category: item.category,
    tags: tagsClean,
    resolution: (item.resolution.trim() || '2160 × 3840').slice(0, 32),
    aspectLabel: item.aspectLabel === '16:9' ? '16:9' : '9:16',
    imageUrl: validImageUrl,
    palette: paletteClean,
    cameraSpec: (item.cameraSpec.trim() || 'Estúdio 4K').slice(0, 120),
    isFeatured: Boolean(item.isFeatured),
    isHidden: Boolean(item.isHidden),
    updatedAt: serverTimestamp(),
  };

  if (item.recipe) {
    baseFields.recipe = {
      id: sanitizeId(item.recipe.id),
      name: (item.recipe.name || 'Fundo Estúdio').slice(0, 120),
      description: (item.recipe.description || '').slice(0, 300),
      patternType: item.recipe.patternType,
      palette: item.recipe.palette,
      lighting: item.recipe.lighting,
      texture: item.recipe.texture,
    };
  }

  try {
    const ref = doc(db, 'catalogItems', safeId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, baseFields);
    } else {
      await setDoc(ref, {
        id: safeId,
        ...baseFields,
        createdBy: sanitizeId(uid),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCatalogOverrideInFirestore(itemId: string): Promise<void> {
  const safeId = sanitizeId(itemId);
  const path = `catalogItems/${safeId}`;
  try {
    await deleteDoc(doc(db, 'catalogItems', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

function normalizeMonetizationData(raw: Record<string, unknown> | undefined): MonetizationConfig {
  if (!raw) return DEFAULT_MONETIZATION_CONFIG;
  const adsense = (raw.adsense as Record<string, unknown>) || {};
  const admob = (raw.admob as Record<string, unknown>) || {};
  const ann = (raw.announcementBanner as Record<string, unknown>) || {};
  const don = (raw.donation as Record<string, unknown>) || {};
  const fcm = (raw.fcm as Record<string, unknown>) || {};
  const validTabs = ['gallery', 'templates', 'background', 'photo'];
  const targetTab = validTabs.includes(String(ann.targetTab))
    ? (String(ann.targetTab) as MonetizationConfig['announcementBanner']['targetTab'])
    : 'gallery';

  return {
    adsEnabled: Boolean(raw.adsEnabled),
    adsense: {
      enabled: Boolean(adsense.enabled),
      clientId: typeof adsense.clientId === 'string' ? adsense.clientId : '',
      gallerySlotId: typeof adsense.gallerySlotId === 'string' ? adsense.gallerySlotId : '',
      studioSlotId: typeof adsense.studioSlotId === 'string' ? adsense.studioSlotId : '',
      footerSlotId: typeof adsense.footerSlotId === 'string' ? adsense.footerSlotId : '',
      autoAds: Boolean(adsense.autoAds),
    },
    admob: {
      enabled: Boolean(admob.enabled),
      appId: typeof admob.appId === 'string' ? admob.appId : '',
      bannerUnitId: typeof admob.bannerUnitId === 'string' ? admob.bannerUnitId : '',
      interstitialUnitId:
        typeof admob.interstitialUnitId === 'string' ? admob.interstitialUnitId : '',
      rewardedUnitId: typeof admob.rewardedUnitId === 'string' ? admob.rewardedUnitId : '',
      testMode: admob.testMode === undefined ? true : Boolean(admob.testMode),
      frequencyMinutes:
        typeof admob.frequencyMinutes === 'number' ? admob.frequencyMinutes : 5,
    },
    announcementBanner: {
      enabled: Boolean(ann.enabled),
      text: typeof ann.text === 'string' ? ann.text : '',
      ctaLabel: typeof ann.ctaLabel === 'string' ? ann.ctaLabel : 'Explorar',
      targetTab,
    },
    donation: {
      enabled: don.enabled === undefined ? true : Boolean(don.enabled),
      pixKey:
        typeof don.pixKey === 'string' && don.pixKey.trim()
          ? don.pixKey
          : DEFAULT_MONETIZATION_CONFIG.donation.pixKey,
      recipientName:
        typeof don.recipientName === 'string' && don.recipientName.trim()
          ? don.recipientName
          : DEFAULT_MONETIZATION_CONFIG.donation.recipientName,
      recipientCity:
        typeof don.recipientCity === 'string' && don.recipientCity.trim()
          ? don.recipientCity
          : DEFAULT_MONETIZATION_CONFIG.donation.recipientCity,
      thankYouMessage:
        typeof don.thankYouMessage === 'string' && don.thankYouMessage.trim()
          ? don.thankYouMessage
          : DEFAULT_MONETIZATION_CONFIG.donation.thankYouMessage,
    },
    fcm: {
      enabled: fcm.enabled === undefined ? true : Boolean(fcm.enabled),
      vapidKey: typeof fcm.vapidKey === 'string' ? fcm.vapidKey : '',
      autoNotifyOnNewWallpaper:
        fcm.autoNotifyOnNewWallpaper === undefined ? true : Boolean(fcm.autoNotifyOnNewWallpaper),
    },
  };
}

export function subscribeToAppConfigAndCatalog(
  isBootstrappedAdmin: boolean,
  callbacks: {
    onMonetization: (config: MonetizationConfig) => void;
    onCatalogOverrides: (items: CatalogOverrideRecord[]) => void;
  }
): Unsubscribe {
  const unsubConfig = onSnapshot(
    doc(db, 'appConfig', 'monetization'),
    (snap) => {
      if (snap.exists()) {
        callbacks.onMonetization(normalizeMonetizationData(snap.data()));
      } else {
        callbacks.onMonetization(DEFAULT_MONETIZATION_CONFIG);
      }
    },
    (err) => {
      console.warn('Config subscription fallback:', err.message);
      callbacks.onMonetization(DEFAULT_MONETIZATION_CONFIG);
    }
  );

  const catalogRef = isBootstrappedAdmin
    ? collection(db, 'catalogItems')
    : query(collection(db, 'catalogItems'), where('isHidden', '==', false));

  const unsubCatalog = onSnapshot(
    catalogRef,
    (snap) => {
      const items: CatalogOverrideRecord[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          title: String(data.title || 'Wallpaper 4K'),
          author: String(data.author || 'Atelier Club'),
          category: (data.category as WallpaperItem['category']) || 'Estúdio & Luz',
          tags: Array.isArray(data.tags) ? (data.tags as QuickFilterTag[]) : [],
          resolution: String(data.resolution || '2160 × 3840'),
          aspectLabel: String(data.aspectLabel || '9:16'),
          imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : undefined,
          recipe: data.recipe as StudioBackgroundRecipe | undefined,
          palette: Array.isArray(data.palette) ? data.palette.map(String) : ['#18181B', '#F2B705'],
          cameraSpec: String(data.cameraSpec || 'Estúdio 4K'),
          isFeatured: Boolean(data.isFeatured),
          isHidden: Boolean(data.isHidden),
          createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
        };
      });
      callbacks.onCatalogOverrides(items);
    },
    (err) => {
      console.warn('Catalog overrides subscription fallback:', err.message);
      callbacks.onCatalogOverrides([]);
    }
  );

  return () => {
    unsubConfig();
    unsubCatalog();
  };
}

export function subscribeToUserCloudData(
  uid: string,
  callbacks: {
    onProfile: (profile: LocalProfile) => void;
    onFavorites: (wallpaperIds: string[]) => void;
    onProjects: (projects: CloudProjectRecord[]) => void;
    onError: (err: Error) => void;
  }
): Unsubscribe {
  const unsubProfile = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        callbacks.onProfile({
          name: typeof d.displayName === 'string' ? d.displayName : 'Criador Atelier',
          handle: typeof d.handle === 'string' ? d.handle : '@atelierclub',
          defaultPlatform: 'instagram',
        });
      }
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const favQuery = query(collection(db, 'users', uid, 'favorites'), where('uid', '==', uid));
  const unsubFavs = onSnapshot(
    favQuery,
    (snap) => {
      const ids = snap.docs
        .map((d) => d.data().wallpaperId)
        .filter((v): v is string => typeof v === 'string');
      callbacks.onFavorites(ids);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/favorites`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  const projQuery = query(collection(db, 'users', uid, 'projects'), where('uid', '==', uid));
  const unsubProjs = onSnapshot(
    projQuery,
    (snap) => {
      const items = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id),
          kind: data.kind === 'template' ? 'template' : 'background',
          title: String(data.title || 'Projeto'),
          aspectId: (data.aspectId as AspectPresetId) || 'ig-portrait-4-5',
          socialCaption: String(data.socialCaption || ''),
          hashtags: Array.isArray(data.hashtags) ? data.hashtags.map(String) : [],
          background: data.background as StudioBackgroundRecipe,
          layers: Array.isArray(data.layers) ? data.layers : undefined,
        } satisfies CloudProjectRecord;
      });
      callbacks.onProjects(items);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/projects`);
      } catch (wrapped) {
        callbacks.onError(wrapped as Error);
      }
    }
  );

  return () => {
    unsubProfile();
    unsubFavs();
    unsubProjs();
  };
}

export async function savePushSubscriptionInFirestore(
  uid: string,
  params: {
    token: string;
    platform: 'web' | 'android';
    enabled: boolean;
  }
): Promise<void> {
  const safeUid = sanitizeId(uid);
  const subId = sanitizeId(`sub_${safeUid}_${params.platform}`);
  const path = `pushSubscriptions/${subId}`;
  const rawToken = params.token.trim();
  const safeToken = (
    rawToken.length >= 10 ? rawToken : `web_live_${safeUid}_${params.platform}`
  ).slice(0, 512);

  try {
    const ref = doc(db, 'pushSubscriptions', subId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, {
        token: safeToken,
        platform: params.platform,
        enabled: Boolean(params.enabled),
        topic: 'new_collections',
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: subId,
        uid: safeUid,
        token: safeToken,
        platform: params.platform,
        enabled: Boolean(params.enabled),
        topic: 'new_collections',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export function subscribeToUserPushSubscriptions(
  uid: string,
  onSubscriptions: (subs: PushSubscriptionRecord[]) => void
): Unsubscribe {
  const q = query(collection(db, 'pushSubscriptions'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const items: PushSubscriptionRecord[] = snap.docs.map((d) => {
        const data = d.data();
        const updatedAt =
          data.updatedAt && typeof data.updatedAt.toMillis === 'function'
            ? data.updatedAt.toMillis()
            : undefined;
        return {
          id: String(data.id || d.id),
          uid: String(data.uid || uid),
          token: String(data.token || ''),
          platform: data.platform === 'android' ? 'android' : 'web',
          enabled: Boolean(data.enabled),
          topic: 'new_collections',
          updatedAt,
        };
      });
      onSubscriptions(items);
    },
    (err) => {
      console.warn('User push subscription listener:', err.message);
      onSubscriptions([]);
    }
  );
}

export function subscribeToAdminPushSubscribers(
  onSubscribers: (subs: PushSubscriptionRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'pushSubscriptions'),
    (snap) => {
      const items: PushSubscriptionRecord[] = snap.docs.map((d) => {
        const data = d.data();
        const updatedAt =
          data.updatedAt && typeof data.updatedAt.toMillis === 'function'
            ? data.updatedAt.toMillis()
            : undefined;
        return {
          id: String(data.id || d.id),
          uid: String(data.uid || ''),
          token: String(data.token || ''),
          platform: data.platform === 'android' ? 'android' : 'web',
          enabled: Boolean(data.enabled),
          topic: 'new_collections',
          updatedAt,
        };
      });
      onSubscribers(items);
    },
    (err) => {
      console.warn('Admin push subscribers listener:', err.message);
      onSubscribers([]);
    }
  );
}

const VALID_ALERT_CATEGORIES: CollectionAlertRecord['category'][] = [
  'Todos',
  'Fotografia Editorial',
  'Estúdio & Luz',
  'Abstrato & Seda',
  'Arquitetura',
  'Minimalista Noturno',
];

export async function publishCollectionAlertInFirestore(
  uid: string,
  input: {
    title: string;
    body: string;
    category: CollectionAlertRecord['category'];
    wallpaperId?: string;
    imageUrl?: string;
  }
): Promise<void> {
  const alertId = sanitizeId(`alert_${Date.now()}`);
  const path = `collectionAlerts/${alertId}`;
  const cleanImage = (input.imageUrl || '').trim().slice(0, 500);
  const validImage =
    cleanImage.startsWith('/src/assets/') || cleanImage.startsWith('https://') ? cleanImage : '';
  const validCategory = VALID_ALERT_CATEGORIES.includes(input.category)
    ? input.category
    : 'Todos';

  try {
    await setDoc(doc(db, 'collectionAlerts', alertId), {
      id: alertId,
      title: (input.title.trim() || 'Nova Coleção 4K no Atelier Club').slice(0, 120),
      body: (
        input.body.trim() || 'Novos papéis de parede 4K disponíveis para download gratuito.'
      ).slice(0, 240),
      category: validCategory,
      wallpaperId: (input.wallpaperId || '').trim().slice(0, 128),
      imageUrl: validImage,
      createdBy: sanitizeId(uid),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCollectionAlertInFirestore(alertId: string): Promise<void> {
  const safeId = sanitizeId(alertId);
  const path = `collectionAlerts/${safeId}`;
  try {
    await deleteDoc(doc(db, 'collectionAlerts', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeToCollectionAlerts(
  onAlerts: (alerts: CollectionAlertRecord[]) => void
): Unsubscribe {
  return onSnapshot(
    collection(db, 'collectionAlerts'),
    (snap) => {
      const alerts: CollectionAlertRecord[] = snap.docs
        .map((d) => {
          const data = d.data();
          const createdAtMs =
            data.createdAt && typeof data.createdAt.toMillis === 'function'
              ? data.createdAt.toMillis()
              : Date.now();
          const cat = VALID_ALERT_CATEGORIES.includes(
            data.category as CollectionAlertRecord['category']
          )
            ? (data.category as CollectionAlertRecord['category'])
            : 'Todos';
          return {
            id: String(data.id || d.id),
            title: String(data.title || 'Nova Coleção 4K'),
            body: String(data.body || ''),
            category: cat,
            wallpaperId: String(data.wallpaperId || ''),
            imageUrl: String(data.imageUrl || ''),
            createdBy: String(data.createdBy || ''),
            createdAtMs,
          };
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, 25);
      onAlerts(alerts);
    },
    (err) => {
      console.warn('Collection alerts listener:', err.message);
      onAlerts([]);
    }
  );
}

function sanitizeBackgroundForFirestore(bg: StudioBackgroundRecipe): Record<string, unknown> {
  const safeBg: Record<string, unknown> = {
    id: sanitizeId(bg.id),
    name: (bg.name || 'Fundo Estúdio').slice(0, 120),
    description: (bg.description || '').slice(0, 300),
    patternType: bg.patternType,
    palette: bg.palette,
    lighting: bg.lighting,
    texture: bg.texture,
  };

  if (bg.socialCaption) {
    safeBg.socialCaption = bg.socialCaption.slice(0, 500);
  }
  if (Array.isArray(bg.hashtags) && bg.hashtags.length > 0) {
    safeBg.hashtags = bg.hashtags.slice(0, 10).map((h) => String(h).slice(0, 50));
  }
  if (bg.imageUrl && !bg.imageUrl.startsWith('data:') && bg.imageUrl.length <= 300) {
    safeBg.imageUrl = bg.imageUrl;
  }
  return safeBg;
}

export async function saveAiHistoryEntryInFirestore(
  uid: string,
  entry: AiHistoryEntry,
  idsToPrune: string[] = []
): Promise<void> {
  const safeId = sanitizeId(entry.id);
  const path = `users/${uid}/aiHistory/${safeId}`;

  const payload: Record<string, unknown> = {
    id: safeId,
    uid,
    kind: entry.kind,
    prompt: (entry.prompt.trim() || 'Prompt IA').slice(0, 500),
    resultTitle: (entry.resultTitle.trim() || 'Resultado IA').slice(0, 120),
    resultSummary: (entry.resultSummary || '').trim().slice(0, 500),
    createdAt: serverTimestamp(),
  };

  if (entry.aspectId) {
    payload.aspectId = entry.aspectId.slice(0, 32);
  }
  if (entry.category) {
    payload.category = entry.category.slice(0, 80);
  }
  if (entry.mood) {
    payload.mood = entry.mood.slice(0, 80);
  }
  if (entry.templateData) {
    payload.templateData = {
      id: sanitizeId(entry.templateData.id),
      title: (entry.templateData.title || entry.resultTitle).slice(0, 120),
      category: (entry.templateData.category || 'Editorial').slice(0, 80),
      aspectRatio: entry.templateData.aspectRatio,
      background: sanitizeBackgroundForFirestore(entry.templateData.background),
      layers: (entry.templateData.layers || []).slice(0, 20),
      socialCaption: (entry.templateData.socialCaption || '').slice(0, 500),
      hashtags: (entry.templateData.hashtags || []).slice(0, 10).map((h) => String(h).slice(0, 50)),
      createdAt: entry.templateData.createdAt || Date.now(),
    };
  }
  if (entry.backgroundData) {
    payload.backgroundData = sanitizeBackgroundForFirestore(entry.backgroundData);
  }
  if (entry.photoAnalysisData) {
    payload.photoAnalysisData = {
      subjectDescription: (entry.photoAnalysisData.subjectDescription || '').slice(0, 400),
      recommendedCutoutMode: entry.photoAnalysisData.recommendedCutoutMode,
      suggestedColorMatch: entry.photoAnalysisData.suggestedColorMatch,
      suggestedStudioPrompt: (entry.photoAnalysisData.suggestedStudioPrompt || '').slice(0, 400),
      socialCaption: (entry.photoAnalysisData.socialCaption || '').slice(0, 500),
      hashtags: (entry.photoAnalysisData.hashtags || [])
        .slice(0, 10)
        .map((h) => String(h).slice(0, 50)),
    };
  }

  try {
    await setDoc(doc(db, 'users', uid, 'aiHistory', safeId), payload);
    for (const pruneId of idsToPrune) {
      const safePruneId = sanitizeId(pruneId);
      if (safePruneId !== safeId) {
        await deleteDoc(doc(db, 'users', uid, 'aiHistory', safePruneId)).catch(() => {});
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteAiHistoryEntryInFirestore(
  uid: string,
  entryId: string
): Promise<void> {
  const safeId = sanitizeId(entryId);
  const path = `users/${uid}/aiHistory/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'aiHistory', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearAiHistoryInFirestore(
  uid: string,
  entryIds: string[]
): Promise<void> {
  for (const id of entryIds) {
    await deleteAiHistoryEntryInFirestore(uid, id);
  }
}

export function subscribeToAiHistory(
  uid: string,
  onHistory: (entries: AiHistoryEntry[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'users', uid, 'aiHistory'), where('uid', '==', uid));
  return onSnapshot(
    q,
    (snap) => {
      const entries: AiHistoryEntry[] = snap.docs
        .map((d) => {
          const data = d.data();
          const createdAt =
            data.createdAt && typeof data.createdAt.toMillis === 'function'
              ? data.createdAt.toMillis()
              : Date.now();
          const kind =
            data.kind === 'template' || data.kind === 'background' || data.kind === 'photo-analysis'
              ? data.kind
              : 'template';
          return {
            id: String(data.id || d.id),
            kind,
            prompt: String(data.prompt || ''),
            resultTitle: String(data.resultTitle || 'Resultado IA'),
            resultSummary: String(data.resultSummary || ''),
            aspectId: typeof data.aspectId === 'string' ? (data.aspectId as AspectPresetId) : undefined,
            category: typeof data.category === 'string' ? data.category : undefined,
            mood: typeof data.mood === 'string' ? data.mood : undefined,
            templateData: data.templateData as EditableTemplate | undefined,
            backgroundData: data.backgroundData as StudioBackgroundRecipe | undefined,
            photoAnalysisData: data.photoAnalysisData as PhotoAnalysisResult | undefined,
            createdAt,
          } satisfies AiHistoryEntry;
        })
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 10);
      onHistory(entries);
    },
    (err) => {
      try {
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/aiHistory`);
      } catch (wrapped) {
        onError(wrapped as Error);
      }
    }
  );
}
