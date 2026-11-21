import { AiHistoryEntry, LocalProfile, SavedCreation } from '../types/studio';

const DB_NAME = 'atelier_club_db';
const STORE_NAME = 'creations';
const FAVORITES_KEY = 'atelier_club_favorites_v1';
const PROFILE_KEY = 'atelier_club_profile_v1';
const AI_HISTORY_KEY = 'atelier_club_ai_history_v1';
export const MAX_AI_HISTORY_ITEMS = 10;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllSavedCreations(): Promise<SavedCreation[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as SavedCreation[]) ?? [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveCreationToLibrary(creation: SavedCreation): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(creation);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteCreationFromLibrary(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function loadFavoriteIds(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function saveFavoriteIds(ids: string[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // ignore storage errors
  }
}

export function loadLocalProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return JSON.parse(raw) as LocalProfile;
  } catch {
    // ignore
  }
  return {
    name: 'Estúdio Criativo',
    handle: '@atelierclub',
    defaultPlatform: 'instagram',
  };
}

export function saveLocalProfile(profile: LocalProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export function normalizeAiHistoryList(entries: AiHistoryEntry[]): AiHistoryEntry[] {
  const seen = new Set<string>();
  const unique: AiHistoryEntry[] = [];
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  for (const item of sorted) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    unique.push(item);
    if (unique.length >= MAX_AI_HISTORY_ITEMS) break;
  }
  return unique;
}

export function loadAiHistory(): AiHistoryEntry[] {
  try {
    const raw = localStorage.getItem(AI_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeAiHistoryList(parsed as AiHistoryEntry[]);
  } catch {
    return [];
  }
}

export function saveAiHistory(entries: AiHistoryEntry[]): AiHistoryEntry[] {
  const capped = normalizeAiHistoryList(entries);
  try {
    localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(capped));
  } catch {
    // ignore storage quota errors
  }
  return capped;
}
