/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyD59OVVHBpNpYGEHSeH5Xtu0rs0xdqrluk',
  authDomain: 'halogen-tesla-6flln.firebaseapp.com',
  projectId: 'halogen-tesla-6flln',
  storageBucket: 'halogen-tesla-6flln.firebasestorage.app',
  messagingSenderId: '558284049266',
  appId: '1:558284049266:web:404cb9981bd92be9476beb',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    'Nova Coleção 4K — Atelier Club';
  const notificationBody =
    (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    'Novos papéis de parede 4K acabam de chegar ao catálogo.';
  const category = (payload.data && payload.data.category) || 'Todos';
  const image = (payload.notification && payload.notification.image) || (payload.data && payload.data.imageUrl) || undefined;

  self.registration.showNotification(notificationTitle, {
    body: notificationBody,
    image,
    tag: 'atelier-club-new-collection',
    data: { category },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const category = (event.notification.data && event.notification.data.category) || 'Todos';
  const targetUrl =
    category && category !== 'Todos'
      ? `/?alertCategory=${encodeURIComponent(category)}`
      : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.postMessage({ type: 'ATELIER_COLLECTION_ALERT_CLICK', category });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
