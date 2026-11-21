import { getMessaging, getToken, isSupported, onMessage, Messaging } from 'firebase/messaging';
import { firebaseApp } from './firebase';

export type BrowserNotificationPermission = 'granted' | 'denied' | 'default' | 'unsupported';

export interface FcmRegistrationResult {
  permission: BrowserNotificationPermission;
  platform: 'web' | 'android';
  token: string | null;
  mode: 'fcm-token' | 'web-live' | 'capacitor-android' | 'denied' | 'unsupported';
  message: string;
}

export interface ForegroundFcmPayload {
  title: string;
  body: string;
  category?: string;
  imageUrl?: string;
}

interface CapacitorPushPlugin {
  requestPermissions?: () => Promise<{ receive: 'granted' | 'denied' | 'prompt' }>;
  register?: () => Promise<void>;
  addListener?: (
    event: string,
    cb: (data: { value?: string; error?: string; title?: string; body?: string; data?: Record<string, string> }) => void
  ) => { remove?: () => void };
}

function getCapacitorPushPlugin(): CapacitorPushPlugin | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        PushNotifications?: CapacitorPushPlugin;
      };
    };
  };
  if (win.Capacitor?.isNativePlatform?.() && win.Capacitor.Plugins?.PushNotifications) {
    return win.Capacitor.Plugins.PushNotifications;
  }
  return null;
}

export function getBrowserNotificationStatus(): BrowserNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as BrowserNotificationPermission;
}

export async function registerFcmPush(
  configuredVapidKey?: string
): Promise<FcmRegistrationResult> {
  // 1. Native Android APK via Capacitor PushNotifications (FCM)
  const capPush = getCapacitorPushPlugin();
  if (capPush?.requestPermissions && capPush.register) {
    try {
      const perm = await capPush.requestPermissions();
      if (perm.receive !== 'granted') {
        return {
          permission: 'denied',
          platform: 'android',
          token: null,
          mode: 'denied',
          message: 'Permissão de notificações negada no dispositivo Android.',
        };
      }

      const token = await new Promise<string | null>((resolve) => {
        const timeout = setTimeout(() => resolve(null), 5000);
        capPush.addListener?.('registration', (res) => {
          clearTimeout(timeout);
          resolve(res.value || null);
        });
        capPush.addListener?.('registrationError', () => {
          clearTimeout(timeout);
          resolve(null);
        });
        capPush.register?.();
      });

      return {
        permission: 'granted',
        platform: 'android',
        token,
        mode: 'capacitor-android',
        message: token
          ? 'Notificações Push FCM ativadas no Android!'
          : 'Notificações ativadas no Android (aguardando token FCM).',
      };
    } catch {
      // Fallback to web notification if Capacitor fails in preview
    }
  }

  // 2. Web Push via Notification API + Service Worker + Firebase Cloud Messaging
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      permission: 'unsupported',
      platform: 'web',
      token: null,
      mode: 'unsupported',
      message: 'Este navegador não suporta notificações Web Push.',
    };
  }

  const permission = (await Notification.requestPermission()) as BrowserNotificationPermission;
  if (permission !== 'granted') {
    return {
      permission,
      platform: 'web',
      token: null,
      mode: 'denied',
      message:
        'Permissão de notificações bloqueada. Libere as notificações para o site nas configurações do navegador.',
    };
  }

  let swReg: ServiceWorkerRegistration | undefined;
  if ('serviceWorker' in navigator) {
    try {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch (err) {
      console.warn('Service Worker FCM registration warning:', err);
    }
  }

  const vapidKey =
    (configuredVapidKey || '').trim() ||
    ((import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined) || '').trim();

  if (vapidKey) {
    try {
      const supported = await isSupported();
      if (supported) {
        const messaging: Messaging = getMessaging(firebaseApp);
        const token = await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swReg,
        });
        if (token) {
          return {
            permission: 'granted',
            platform: 'web',
            token,
            mode: 'fcm-token',
            message: 'Notificações Push FCM ativadas! Você será avisado sobre novas coleções.',
          };
        }
      }
    } catch (err) {
      console.warn('FCM getToken fallback to web-live:', err);
    }
  }

  return {
    permission: 'granted',
    platform: 'web',
    token: null,
    mode: 'web-live',
    message:
      'Avisos de novas coleções ativados neste navegador! Você receberá alertas em tempo real.',
  };
}

export async function listenForegroundFcm(
  onPayload: (payload: ForegroundFcmPayload) => void
): Promise<() => void> {
  try {
    const supported = await isSupported();
    if (!supported) return () => {};
    const messaging = getMessaging(firebaseApp);
    return onMessage(messaging, (payload) => {
      const title =
        payload.notification?.title ||
        payload.data?.title ||
        'Nova Coleção 4K — Atelier Club';
      const body =
        payload.notification?.body ||
        payload.data?.body ||
        'Novos papéis de parede disponíveis no catálogo.';
      onPayload({
        title,
        body,
        category: payload.data?.category,
        imageUrl: payload.notification?.image || payload.data?.imageUrl,
      });
    });
  } catch {
    return () => {};
  }
}

export async function showLocalCollectionNotification(alert: {
  title: string;
  body: string;
  category?: string;
  imageUrl?: string;
}): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(alert.title, {
          body: alert.body,
          tag: 'atelier-club-new-collection',
          data: { category: alert.category || 'Todos' },
        });
        return;
      }
    }
    new Notification(alert.title, {
      body: alert.body,
      tag: 'atelier-club-new-collection',
    });
  } catch {
    // Ignore browser notification restrictions inside iframes
  }
}
