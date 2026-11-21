import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { AdBannerSlot } from './components/AdBannerSlot';
import { AdminDashboardView } from './components/AdminDashboardView';
import { BackgroundCreatorView } from './components/BackgroundCreatorView';
import { CollectionDrawer, GoogleMark } from './components/CollectionDrawer';
import { CollectionPushToast } from './components/CollectionPushToast';
import { DeveloperDonationModal } from './components/DeveloperDonationModal';
import { FAQView } from './components/FAQView';
import { PhotoStudioView } from './components/PhotoStudioView';
import { SocialShareModal } from './components/SocialShareModal';
import { TemplateStudioView } from './components/TemplateStudioView';
import { WallpaperGalleryView } from './components/WallpaperGalleryView';
import { CURATED_WALLPAPERS, STUDIO_BACKDROP_PRESETS } from './data/catalog';
import {
  ensureAdSenseScriptLoaded,
  isValidAdSenseClientId,
  syncCapacitorAdMobRuntime,
} from './lib/admobBridge';
import {
  listenForegroundFcm,
  registerFcmPush,
  showLocalCollectionNotification,
} from './lib/fcmMessaging';
import {
  auth,
  clearAiHistoryInFirestore,
  CloudProjectRecord,
  DEFAULT_MONETIZATION_CONFIG,
  deleteAiHistoryEntryInFirestore,
  deleteProjectInFirestore,
  ensureAdminDocIfAuthorized,
  ensureUserProfileDocs,
  isBootstrappedAdminUser,
  saveAiHistoryEntryInFirestore,
  saveProjectInFirestore,
  savePushSubscriptionInFirestore,
  setFavoriteInFirestore,
  signInWithGoogle,
  signOutGoogle,
  subscribeToAiHistory,
  subscribeToAppConfigAndCatalog,
  subscribeToCollectionAlerts,
  subscribeToUserCloudData,
  subscribeToUserPushSubscriptions,
  updateUserProfileInFirestore,
} from './lib/firebase';
import {
  deleteCreationFromLibrary,
  getAllSavedCreations,
  loadAiHistory,
  loadFavoriteIds,
  loadLocalProfile,
  saveAiHistory,
  saveCreationToLibrary,
  saveFavoriteIds,
  saveLocalProfile,
} from './lib/storage';
import {
  AiHistoryEntry,
  AppTab,
  AspectPresetId,
  BackgroundPromptSeed,
  CatalogOverrideRecord,
  CollectionAlertRecord,
  EditableTemplate,
  LocalProfile,
  MonetizationConfig,
  PhotoAnalysisSeed,
  SavedCreation,
  StudioBackgroundRecipe,
  TemplatePromptSeed,
  WallpaperItem,
} from './types/studio';

interface ShareModalState {
  isOpen: boolean;
  title: string;
  imageDataUrl: string;
  caption?: string;
  hashtags?: string[];
  exportVariant?: (presetId: AspectPresetId) => Promise<string>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('gallery');
  const [favorites, setFavorites] = useState<string[]>(() => loadFavoriteIds());
  const [localCreations, setLocalCreations] = useState<SavedCreation[]>([]);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectRecord[]>([]);
  const [profile, setProfile] = useState<LocalProfile>(() => loadLocalProfile());
  const [isCollectionOpen, setIsCollectionOpen] = useState(false);

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [monetization, setMonetization] = useState<MonetizationConfig>(
    DEFAULT_MONETIZATION_CONFIG
  );
  const [catalogOverrides, setCatalogOverrides] = useState<CatalogOverrideRecord[]>([]);

  const [studioBackdrop, setStudioBackdrop] = useState<StudioBackgroundRecipe>(
    STUDIO_BACKDROP_PRESETS[0]
  );
  const [customBackdrops, setCustomBackdrops] = useState<StudioBackgroundRecipe[]>([]);
  const [loadedTemplate, setLoadedTemplate] = useState<EditableTemplate | null>(null);
  const [loadedBackground, setLoadedBackground] = useState<StudioBackgroundRecipe | null>(null);
  const [aiHistory, setAiHistory] = useState<AiHistoryEntry[]>(() => loadAiHistory());
  const [templatePromptSeed, setTemplatePromptSeed] = useState<TemplatePromptSeed | null>(null);
  const [backgroundPromptSeed, setBackgroundPromptSeed] =
    useState<BackgroundPromptSeed | null>(null);
  const [photoAnalysisSeed, setPhotoAnalysisSeed] = useState<PhotoAnalysisSeed | null>(null);

  const [shareState, setShareState] = useState<ShareModalState>({
    isOpen: false,
    title: '',
    imageDataUrl: '',
  });

  const [donationModal, setDonationModal] = useState<{
    isOpen: boolean;
    contextLabel?: string;
  }>({
    isOpen: false,
  });

  // Push Notifications (FCM + Real-time Collection Alerts)
  const [pushEnabled, setPushEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('atelier_push_optin') === '1';
    } catch {
      return false;
    }
  });
  const [pushBusy, setPushBusy] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [collectionAlerts, setCollectionAlerts] = useState<CollectionAlertRecord[]>([]);
  const [activeToastAlert, setActiveToastAlert] = useState<CollectionAlertRecord | null>(null);
  const [galleryFocusCategory, setGalleryFocusCategory] = useState<
    CollectionAlertRecord['category'] | null
  >(null);
  const sessionStartRef = useRef<number>(Date.now());
  const seenAlertIdsRef = useRef<Set<string>>(new Set());

  const handleImageGeneratedPrompt = (contextLabel: string) => {
    if (!monetization.donation.enabled) return;
    setDonationModal({ isOpen: true, contextLabel });
  };

  useEffect(() => {
    getAllSavedCreations().then(setLocalCreations);

    // Handle deep-link from Service Worker notification click
    try {
      const params = new URLSearchParams(window.location.search);
      const cat = params.get('alertCategory') as CollectionAlertRecord['category'] | null;
      if (cat) {
        setGalleryFocusCategory(cat);
        setActiveTab('gallery');
      }
    } catch {
      // ignore URL parsing errors
    }
  }, []);

  // Subscribe to global monetization & catalog hotfix overrides
  useEffect(() => {
    const unsubGlobal = subscribeToAppConfigAndCatalog(isBootstrappedAdminUser(user), {
      onMonetization: setMonetization,
      onCatalogOverrides: setCatalogOverrides,
    });
    return () => unsubGlobal();
  }, [user]);

  // Subscribe to published collection alerts & foreground FCM payloads
  useEffect(() => {
    const unsubAlerts = subscribeToCollectionAlerts((alerts) => {
      setCollectionAlerts(alerts);
      const newest = alerts[0];
      if (
        newest &&
        pushEnabled &&
        newest.createdAtMs > sessionStartRef.current &&
        !seenAlertIdsRef.current.has(newest.id) &&
        newest.createdBy !== user?.uid
      ) {
        seenAlertIdsRef.current.add(newest.id);
        setActiveToastAlert(newest);
        showLocalCollectionNotification({
          title: newest.title,
          body: newest.body,
          category: newest.category,
          imageUrl: newest.imageUrl,
        });
      }
    });

    let cleanupFcm = () => {};
    listenForegroundFcm((payload) => {
      if (!pushEnabled) return;
      const validCats: CollectionAlertRecord['category'][] = [
        'Todos',
        'Fotografia Editorial',
        'Estúdio & Luz',
        'Abstrato & Seda',
        'Arquitetura',
        'Minimalista Noturno',
      ];
      const cat = validCats.includes(payload.category as CollectionAlertRecord['category'])
        ? (payload.category as CollectionAlertRecord['category'])
        : 'Todos';
      setActiveToastAlert({
        id: `fcm_${Date.now()}`,
        title: payload.title,
        body: payload.body,
        category: cat,
        wallpaperId: '',
        imageUrl: payload.imageUrl || '',
        createdBy: 'fcm',
        createdAtMs: Date.now(),
      });
    }).then((unsub) => {
      cleanupFcm = unsub;
    });

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ATELIER_COLLECTION_ALERT_CLICK') {
        const cat = (event.data.category || 'Todos') as CollectionAlertRecord['category'];
        setGalleryFocusCategory(cat);
        setActiveTab('gallery');
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      unsubAlerts();
      cleanupFcm();
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [pushEnabled, user?.uid]);

  // Sync user's Firestore push subscription when signed in
  useEffect(() => {
    if (!authReady || !user) return;
    const unsubPush = subscribeToUserPushSubscriptions(user.uid, (subs) => {
      const anyActive = subs.some((s) => s.enabled);
      if (anyActive) {
        setPushEnabled(true);
        try {
          localStorage.setItem('atelier_push_optin', '1');
        } catch {
          // ignore
        }
      }
    });
    return () => unsubPush();
  }, [authReady, user]);

  // Sync Web AdSense AutoAds & Android Capacitor AdMob runtime whenever monetization updates
  useEffect(() => {
    if (
      monetization.adsEnabled &&
      monetization.adsense.enabled &&
      monetization.adsense.autoAds &&
      isValidAdSenseClientId(monetization.adsense.clientId)
    ) {
      ensureAdSenseScriptLoaded(monetization.adsense.clientId);
    }
    syncCapacitorAdMobRuntime(monetization.admob, monetization.adsEnabled);
  }, [monetization]);

  // Listen to Firebase Auth state and attach Firestore listeners only when authenticated
  useEffect(() => {
    let unsubCloud: (() => void) | null = null;
    let unsubHistory: (() => void) | null = null;
    const unsubAuth = onAuthStateChanged(auth, async (nextUser) => {
      if (unsubCloud) {
        unsubCloud();
        unsubCloud = null;
      }
      if (unsubHistory) {
        unsubHistory();
        unsubHistory = null;
      }

      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        try {
          const [syncedProfile, adminStatus] = await Promise.all([
            ensureUserProfileDocs(nextUser),
            ensureAdminDocIfAuthorized(nextUser),
          ]);
          setIsAdmin(adminStatus);
          setProfile(syncedProfile);
          saveLocalProfile(syncedProfile);

          unsubCloud = subscribeToUserCloudData(nextUser.uid, {
            onProfile: (p) => {
              setProfile(p);
              saveLocalProfile(p);
            },
            onFavorites: (cloudFavs) => {
              setFavorites(cloudFavs);
              saveFavoriteIds(cloudFavs);
            },
            onProjects: (projects) => {
              setCloudProjects(projects);
            },
            onError: (err) => {
              setAuthError(err.message);
            },
          });

          unsubHistory = subscribeToAiHistory(
            nextUser.uid,
            (cloudHistory) => {
              const normalized = saveAiHistory(cloudHistory);
              setAiHistory(normalized);
            },
            (err) => {
              console.warn('AI history listener:', err.message);
            }
          );
        } catch (err) {
          setAuthError(err instanceof Error ? err.message : 'Erro ao sincronizar conta Google.');
        }
      } else {
        setIsAdmin(false);
        setActiveTab((prev) => (prev === 'admin' ? 'gallery' : prev));
        setCloudProjects([]);
        setFavorites(loadFavoriteIds());
        setAiHistory(loadAiHistory());
      }
    });

    return () => {
      unsubAuth();
      if (unsubCloud) unsubCloud();
      if (unsubHistory) unsubHistory();
    };
  }, []);

  // Merge built-in catalog with admin Firestore additions & hotfixes
  const mergedWallpapers = useMemo<WallpaperItem[]>(() => {
    const overrideMap = new Map(catalogOverrides.map((o) => [o.id, o]));
    const builtInIds = new Set(CURATED_WALLPAPERS.map((w) => w.id));

    const customAdditions: WallpaperItem[] = catalogOverrides
      .filter((o) => !builtInIds.has(o.id) && !o.isHidden)
      .map(({ isHidden: _hidden, createdBy: _cb, updatedAt: _ua, ...wp }) => wp);

    const resolvedBuiltIns: WallpaperItem[] = [];
    for (const base of CURATED_WALLPAPERS) {
      const ov = overrideMap.get(base.id);
      if (ov) {
        if (ov.isHidden) continue;
        const { isHidden: _hidden, createdBy: _cb, updatedAt: _ua, ...wp } = ov;
        resolvedBuiltIns.push({
          ...base,
          ...wp,
          imageUrl: wp.imageUrl || base.imageUrl,
          recipe: wp.recipe || base.recipe,
        });
      } else {
        resolvedBuiltIns.push(base);
      }
    }

    return [...customAdditions, ...resolvedBuiltIns];
  }, [catalogOverrides]);

  // Merge local creations (with high-res previewDataUrl) and cloud-synced projects
  const mergedCreations = useMemo<SavedCreation[]>(() => {
    const byId = new Map<string, SavedCreation>();
    for (const item of localCreations) {
      byId.set(item.id, item);
    }
    for (const cp of cloudProjects) {
      const existing = byId.get(cp.id);
      if (existing) {
        byId.set(cp.id, existing);
      } else {
        byId.set(cp.id, {
          id: cp.id,
          kind: cp.kind,
          title: cp.title,
          previewDataUrl: '',
          aspectId: cp.aspectId,
          createdAt: Date.now(),
          backgroundData: cp.background,
          templateData:
            cp.kind === 'template'
              ? {
                  id: cp.id,
                  title: cp.title,
                  category: 'Sincronizado',
                  aspectRatio: cp.aspectId,
                  background: cp.background,
                  layers: cp.layers ?? [],
                  socialCaption: cp.socialCaption,
                  hashtags: cp.hashtags,
                  createdAt: Date.now(),
                }
              : undefined,
        });
      }
    }
    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [localCreations, cloudProjects]);

  const handleSignInGoogle = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao entrar com o Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutGoogle();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleTogglePushNotifications = async () => {
    setPushFeedback(null);
    if (pushEnabled) {
      setPushEnabled(false);
      try {
        localStorage.setItem('atelier_push_optin', '0');
      } catch {
        // ignore
      }
      if (authReady && user) {
        await savePushSubscriptionInFirestore(user.uid, {
          token: `web_live_${user.uid}_disabled`,
          platform: 'web',
          enabled: false,
        });
      }
      setPushFeedback('Avisos de novas coleções desativados neste dispositivo.');
      return;
    }

    setPushBusy(true);
    try {
      const result = await registerFcmPush(monetization.fcm.vapidKey);
      if (result.permission === 'denied' || result.permission === 'unsupported') {
        setPushFeedback(result.message);
        return;
      }

      setPushEnabled(true);
      try {
        localStorage.setItem('atelier_push_optin', '1');
      } catch {
        // ignore
      }
      setPushFeedback(result.message);

      if (authReady && user) {
        await savePushSubscriptionInFirestore(user.uid, {
          token: result.token || `web_live_${user.uid}`,
          platform: result.platform,
          enabled: true,
        });
      }
    } catch (err) {
      setPushFeedback(
        err instanceof Error ? err.message : 'Não foi possível ativar as notificações.'
      );
    } finally {
      setPushBusy(false);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    const isCurrentlyFav = favorites.includes(id);
    const next = isCurrentlyFav ? favorites.filter((item) => item !== id) : [...favorites, id];
    setFavorites(next);
    saveFavoriteIds(next);

    if (authReady && user) {
      const wp = mergedWallpapers.find((w) => w.id === id);
      await setFavoriteInFirestore(user.uid, id, wp?.title || 'Wallpaper 4K', !isCurrentlyFav);
    }
  };

  const handleSaveCreation = async (creation: SavedCreation) => {
    await saveCreationToLibrary(creation);
    const all = await getAllSavedCreations();
    setLocalCreations(all);

    if (authReady && user && (creation.kind === 'template' || creation.kind === 'background')) {
      const bg = creation.templateData?.background || creation.backgroundData;
      if (bg) {
        await saveProjectInFirestore(user.uid, {
          id: creation.id,
          kind: creation.kind,
          title: creation.title,
          aspectId: creation.aspectId,
          socialCaption: creation.templateData?.socialCaption || bg.socialCaption || '',
          hashtags: creation.templateData?.hashtags || bg.hashtags || [],
          background: bg,
          layers: creation.templateData?.layers,
        });
      }
    }
  };

  const handleDeleteCreation = async (item: SavedCreation) => {
    await deleteCreationFromLibrary(item.id);
    const all = await getAllSavedCreations();
    setLocalCreations(all);

    if (authReady && user && (item.kind === 'template' || item.kind === 'background')) {
      await deleteProjectInFirestore(user.uid, item.id);
    }
  };

  const handleUpdateProfile = async (next: LocalProfile) => {
    setProfile(next);
    saveLocalProfile(next);
    if (authReady && user) {
      await updateUserProfileInFirestore(user.uid, next.name, next.handle, user.photoURL || '');
    }
  };

  const handleOpenCreation = (item: SavedCreation) => {
    if (item.templateData) {
      setLoadedTemplate(item.templateData);
      setActiveTab('templates');
    } else if (item.backgroundData) {
      setLoadedBackground(item.backgroundData);
      setActiveTab('background');
    }
  };

  const handleRecordAiHistory = async (draft: Omit<AiHistoryEntry, 'id' | 'createdAt'>) => {
    const newEntry: AiHistoryEntry = {
      ...draft,
      id: `aih_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
    };

    const combined = [newEntry, ...aiHistory.filter((item) => item.id !== newEntry.id)];
    const capped = saveAiHistory(combined);
    const prunedIds = combined.slice(10).map((item) => item.id);
    setAiHistory(capped);

    if (authReady && user) {
      await saveAiHistoryEntryInFirestore(user.uid, newEntry, prunedIds).catch((err) => {
        console.warn('Falha ao sincronizar histórico de IA:', err);
      });
    }
  };

  const handleReuseAiHistoryPrompt = (entry: AiHistoryEntry) => {
    if (entry.kind === 'template') {
      setTemplatePromptSeed({
        prompt: entry.prompt,
        category: entry.category,
        mood: entry.mood,
        nonce: Date.now(),
      });
      setActiveTab('templates');
    } else if (entry.kind === 'background') {
      setBackgroundPromptSeed({
        prompt: entry.prompt,
        style: entry.category,
        lightingMood: entry.mood,
        nonce: Date.now(),
      });
      setActiveTab('background');
    } else {
      const suggestedPrompt = entry.photoAnalysisData?.suggestedStudioPrompt || entry.prompt;
      setBackgroundPromptSeed({
        prompt: suggestedPrompt,
        nonce: Date.now(),
      });
      setActiveTab('background');
    }
  };

  const handleReopenAiHistoryResult = (entry: AiHistoryEntry) => {
    if (entry.kind === 'template' && entry.templateData) {
      setLoadedTemplate(entry.templateData);
      setTemplatePromptSeed({
        prompt: entry.prompt,
        category: entry.category,
        mood: entry.mood,
        nonce: Date.now(),
      });
      setActiveTab('templates');
    } else if (entry.kind === 'background' && entry.backgroundData) {
      setLoadedBackground(entry.backgroundData);
      setBackgroundPromptSeed({
        prompt: entry.prompt,
        style: entry.category,
        lightingMood: entry.mood,
        nonce: Date.now(),
      });
      setActiveTab('background');
    } else if (entry.kind === 'photo-analysis') {
      if (entry.backgroundData) {
        setStudioBackdrop(entry.backgroundData);
      }
      if (entry.photoAnalysisData) {
        setPhotoAnalysisSeed({
          analysis: entry.photoAnalysisData,
          nonce: Date.now(),
        });
      }
      setActiveTab('photo');
    }
  };

  const handleDeleteAiHistoryEntry = async (entryId: string) => {
    const next = saveAiHistory(aiHistory.filter((item) => item.id !== entryId));
    setAiHistory(next);
    if (authReady && user) {
      await deleteAiHistoryEntryInFirestore(user.uid, entryId).catch((err) => {
        console.warn('Falha ao excluir item do histórico de IA:', err);
      });
    }
  };

  const handleClearAiHistory = async () => {
    const idsToDelete = aiHistory.map((item) => item.id);
    setAiHistory(saveAiHistory([]));
    if (authReady && user && idsToDelete.length > 0) {
      await clearAiHistoryInFirestore(user.uid, idsToDelete).catch((err) => {
        console.warn('Falha ao limpar histórico de IA:', err);
      });
    }
  };

  const navItems: Array<{ id: AppTab; label: string }> = [
    { id: 'gallery', label: 'Galeria' },
    { id: 'templates', label: 'Modelos IA' },
    { id: 'background', label: 'Criar Fundo' },
    { id: 'photo', label: 'Estúdio Foto' },
    { id: 'faq', label: 'Ajuda' },
    ...(isAdmin ? [{ id: 'admin' as AppTab, label: 'Admin' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#08080A] text-zinc-100 flex flex-col">
      {/* Strict 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 bg-[#08080A]/90 backdrop-blur-md border-b border-zinc-800/80">
        <div className="max-w-[1440px] mx-auto px-5 sm:px-8 py-4 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Wordmark */}
          <button
            onClick={() => setActiveTab('gallery')}
            className="font-display text-lg sm:text-xl font-bold tracking-tight text-zinc-50 hover:text-[#F2B705] transition-colors whitespace-nowrap shrink-0 text-left"
          >
            Atelier Club
          </button>

          {/* Zone 2: 5 Clean Single-Line Nav Links */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Navegação principal">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                    active ? 'text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute inset-x-0 -bottom-1 h-[2px] bg-[#F2B705] rounded-full" />
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setIsCollectionOpen(true)}
              className="relative py-1 text-sm font-medium text-zinc-400 hover:text-zinc-100 transition-colors whitespace-nowrap shrink-0"
            >
              Coleção{mergedCreations.length > 0 ? ` (${mergedCreations.length})` : ''}
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action — Google Sign-In / Connected Account */}
          <div className="shrink-0">
            {!user ? (
              <button
                onClick={handleSignInGoogle}
                disabled={authBusy}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-zinc-900 font-semibold text-xs sm:text-sm hover:bg-zinc-100 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <GoogleMark className="w-4 h-4 shrink-0" />
                <span>{authBusy ? 'Conectando...' : 'Entrar com Google'}</span>
              </button>
            ) : (
              <button
                onClick={() => setIsCollectionOpen(true)}
                className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg bg-[#16161B] border border-zinc-700 text-zinc-100 text-xs sm:text-sm font-medium hover:border-zinc-500 transition-colors whitespace-nowrap shrink-0"
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={profile.name}
                    referrerPolicy="no-referrer"
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-[#F2B705] text-zinc-950 font-bold text-xs flex items-center justify-center shrink-0">
                    {profile.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[120px] truncate">{profile.name.split(' ')[0]}</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Nav Strip */}
        <nav
          className="md:hidden flex items-center gap-4 px-5 pb-3 overflow-x-auto border-t border-zinc-900 pt-2"
          aria-label="Navegação móvel"
        >
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`text-xs font-medium py-1 whitespace-nowrap shrink-0 ${
                  active ? 'text-[#F2B705] border-b border-[#F2B705]' : 'text-zinc-400'
                }`}
              >
                {item.label}
              </button>
            );
          })}
          <button
            onClick={() => setIsCollectionOpen(true)}
            className="text-xs font-medium py-1 whitespace-nowrap shrink-0 text-zinc-400"
          >
            Coleção ({mergedCreations.length})
          </button>
        </nav>
      </header>

      {monetization.announcementBanner.enabled && monetization.announcementBanner.text && (
        <div className="bg-[#111115] border-b border-zinc-800/80">
          <div className="max-w-[1440px] mx-auto px-5 sm:px-8 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <p className="text-zinc-200">{monetization.announcementBanner.text}</p>
            <button
              type="button"
              onClick={() => setActiveTab(monetization.announcementBanner.targetTab)}
              className="text-[#F2B705] font-semibold hover:underline self-start sm:self-auto whitespace-nowrap shrink-0"
            >
              {monetization.announcementBanner.ctaLabel || 'Explorar'}
            </button>
          </div>
        </div>
      )}

      {authError && (
        <div className="max-w-[1440px] w-full mx-auto px-5 sm:px-8 pt-4">
          <div className="rounded-lg bg-red-950/50 border border-red-900 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-red-200">
            <span>{authError}</span>
            <button onClick={() => setAuthError(null)} className="underline shrink-0">
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-5 sm:px-8 py-8 sm:py-10">
        {activeTab === 'gallery' && (
          <WallpaperGalleryView
            wallpapers={mergedWallpapers}
            favorites={favorites}
            monetization={monetization}
            isAdmin={isAdmin}
            pushEnabled={pushEnabled}
            pushBusy={pushBusy}
            pushFeedback={pushFeedback}
            externalCategoryFilter={galleryFocusCategory}
            onTogglePushNotifications={handleTogglePushNotifications}
            onOpenAdmin={() => setActiveTab('admin')}
            onImageGenerated={handleImageGeneratedPrompt}
            onToggleFavorite={handleToggleFavorite}
            onNavigateTab={setActiveTab}
            onUseAsStudioBackground={(recipe) => {
              setStudioBackdrop(recipe);
              setActiveTab('photo');
            }}
            onShareWallpaper={(title, dataUrl) => {
              setShareState({
                isOpen: true,
                title,
                imageDataUrl: dataUrl,
                caption: `Papel de parede 4K "${title}" baixado gratuitamente no Atelier Club.`,
                hashtags: ['#AtelierClub', '#Wallpaper4K', '#DesignMinimalista'],
              });
            }}
          />
        )}

        {activeTab === 'templates' && (
          <TemplateStudioView
            initialTemplate={loadedTemplate}
            initialPromptSeed={templatePromptSeed}
            onSaveCreation={handleSaveCreation}
            onRecordAiHistory={handleRecordAiHistory}
            onImageGenerated={handleImageGeneratedPrompt}
            onOpenShare={(title, dataUrl, caption, hashtags, exportVariant) => {
              setShareState({
                isOpen: true,
                title,
                imageDataUrl: dataUrl,
                caption,
                hashtags,
                exportVariant,
              });
            }}
          />
        )}

        {activeTab === 'background' && (
          <BackgroundCreatorView
            initialBackground={loadedBackground}
            initialPromptSeed={backgroundPromptSeed}
            onSendToPhotoStudio={(recipe) => {
              setStudioBackdrop(recipe);
              setActiveTab('photo');
            }}
            onSaveCreation={handleSaveCreation}
            onRecordAiHistory={handleRecordAiHistory}
            onAddCustomBackground={(recipe) => {
              setCustomBackdrops((prev) => [recipe, ...prev.filter((b) => b.id !== recipe.id)]);
            }}
            onImageGenerated={handleImageGeneratedPrompt}
            onOpenShare={(title, dataUrl, caption, hashtags, exportVariant) => {
              setShareState({
                isOpen: true,
                title,
                imageDataUrl: dataUrl,
                caption,
                hashtags,
                exportVariant,
              });
            }}
          />
        )}

        {activeTab === 'photo' && (
          <PhotoStudioView
            activeBackdrop={studioBackdrop}
            customBackdrops={customBackdrops}
            initialAiAnalysis={photoAnalysisSeed}
            onChangeBackdrop={setStudioBackdrop}
            onSaveCreation={handleSaveCreation}
            onRecordAiHistory={handleRecordAiHistory}
            onImageGenerated={handleImageGeneratedPrompt}
            onOpenShare={(title, dataUrl, caption, hashtags, exportVariant) => {
              setShareState({
                isOpen: true,
                title,
                imageDataUrl: dataUrl,
                caption,
                hashtags,
                exportVariant,
              });
            }}
          />
        )}
        {activeTab === 'faq' && (
          <FAQView
            onNavigateTab={setActiveTab}
            onOpenCollection={() => setIsCollectionOpen(true)}
            onOpenDonation={
              monetization.donation.enabled
                ? () => setDonationModal({ isOpen: true })
                : undefined
            }
          />
        )}
        {activeTab === 'admin' && isAdmin && user && (
          <AdminDashboardView
            user={user}
            monetization={monetization}
            catalogOverrides={catalogOverrides}
            mergedWallpapers={mergedWallpapers}
            collectionAlerts={collectionAlerts}
            onPreviewDonation={() =>
              setDonationModal({
                isOpen: true,
                contextLabel: 'Pré-visualização do convite pós-geração de imagem',
              })
            }
          />
        )}

        {(activeTab === 'templates' || activeTab === 'background' || activeTab === 'photo') && (
          <div className="mt-8">
            <AdBannerSlot
              placement="studio"
              monetization={monetization}
              isAdmin={isAdmin}
              onOpenAdmin={() => setActiveTab('admin')}
            />
          </div>
        )}
      </main>

      {/* Quiet Editorial Footer */}
      <footer className="border-t border-zinc-900 py-6 px-5 sm:px-8">
        <div className="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <p>Atelier Club · Papéis de Parede 4K &amp; Estúdio Fotográfico</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span>
              Acesso Gratuito · Login Google &amp; Exportação Instagram / Facebook
              {!monetization.adsEnabled ? ' · Modo Sem Anúncios' : ''}
            </span>
            {monetization.donation.enabled && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setDonationModal({ isOpen: true })}
                  className="text-[#F2B705] hover:underline font-medium"
                >
                  Apoiar o Desenvolvedor
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* Collection & Google Account Drawer */}
      <CollectionDrawer
        isOpen={isCollectionOpen}
        onClose={() => setIsCollectionOpen(false)}
        user={user}
        isAdmin={isAdmin}
        onOpenAdmin={() => setActiveTab('admin')}
        pushEnabled={pushEnabled}
        pushBusy={pushBusy}
        onTogglePushNotifications={handleTogglePushNotifications}
        authBusy={authBusy}
        authError={authError}
        onSignInGoogle={handleSignInGoogle}
        onSignOut={handleSignOut}
        creations={mergedCreations}
        favorites={favorites}
        wallpapers={mergedWallpapers}
        aiHistory={aiHistory}
        profile={profile}
        onUpdateProfile={handleUpdateProfile}
        onDeleteCreation={handleDeleteCreation}
        onOpenCreation={handleOpenCreation}
        onShareCreation={(item, resolvedDataUrl) => {
          setIsCollectionOpen(false);
          setShareState({
            isOpen: true,
            title: item.title,
            imageDataUrl: resolvedDataUrl,
            caption: item.templateData?.socialCaption || `Criado no Atelier Club: ${item.title}.`,
            hashtags: item.templateData?.hashtags || ['#AtelierClub', '#DesignCriativo'],
          });
        }}
        onReuseAiHistoryPrompt={handleReuseAiHistoryPrompt}
        onReopenAiHistoryResult={handleReopenAiHistoryResult}
        onDeleteAiHistoryEntry={handleDeleteAiHistoryEntry}
        onClearAiHistory={handleClearAiHistory}
      />

      {/* Social Media Share Modal (Instagram / Facebook / Native) */}
      <SocialShareModal
        isOpen={shareState.isOpen}
        onClose={() => setShareState((prev) => ({ ...prev, isOpen: false }))}
        title={shareState.title}
        imageDataUrl={shareState.imageDataUrl}
        defaultCaption={shareState.caption}
        defaultHashtags={shareState.hashtags}
        profile={profile}
        onExportVariant={shareState.exportVariant}
      />

      {/* Optional Developer Donation Modal (PIX QR Code + Copia e Cola) */}
      <DeveloperDonationModal
        isOpen={donationModal.isOpen}
        onClose={() => setDonationModal({ isOpen: false })}
        contextLabel={donationModal.contextLabel}
        donation={monetization.donation}
      />

      {/* Live Push Notification Toast for New Collections */}
      <CollectionPushToast
        alert={activeToastAlert}
        onExplore={(category) => {
          setGalleryFocusCategory(category);
          setActiveTab('gallery');
          setActiveToastAlert(null);
        }}
        onClose={() => setActiveToastAlert(null)}
      />
    </div>
  );
}
