'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { toast as sonnerToast } from 'sonner';
import { Shirt, User, LogOut, ChevronRight, ChevronLeft, Sparkles, Calendar, TrendingUp, MessageCircle, MapPin, Cloud, Plus, Check, Heart, Camera, Loader2, RefreshCw, Trash2, RotateCcw, Download, AlertTriangle } from 'lucide-react';
import Image from 'next/image';
import { ClothingIcon } from './components/ClothingIcon';
import { ClothingSticker } from './components/ClothingSticker';
import { ChatInterface } from './components/ChatInterface';
import { OnboardingFlow } from './components/OnboardingFlow';
import { UploadFlow } from './components/UploadFlow';
import { EmptyState } from './components/EmptyState';
import { SelfieUpload } from './components/SelfieUpload';
import { AuthDialog } from './components/AuthDialog';
import { ResetPasswordDialog } from './components/ResetPasswordDialog';
import { getGarmentImage } from '@/lib/garment-images';
import { getWardrobeStorageState, storage } from '@/lib/storage';
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';
import {
  fetchProfile,
  fetchSavedOutfits,
  fetchWardrobe,
  insertSavedOutfit,
  bulkInsertWardrobeItems,
  ensureProfileRow,
  updateProfile,
} from '@/lib/supabase/sync';
import { fetchCanonicalSyncFromApi, fetchWardrobeFromApi } from '@/lib/wardrobe-api';
import { getSessionOrchestrator, type AuthOrchestratorState } from '@/lib/auth/session-orchestrator';
import type { Session } from '@supabase/supabase-js';
import type { SavedOutfit, WardrobeCategory, WardrobeItem } from '@/types/wardrobe';
import type { CreateTryOnJobResponse, TryOnJobSnapshot, VtoErrorCode, VtoStage } from '@/lib/vto/contracts';
import { getVtoCopy } from '@/lib/vto/copy';

const SUPABASE_ON = isSupabaseConfigured();
const AUTH_HYDRATION_TELEMETRY =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_AUTH_HYDRATION_TELEMETRY === '1';

const LOCAL_SAVED_OUTFITS_KEY = 'clueless_saved_outfits_v1';
const LOCAL_SAVED_OUTFITS_USER_PREFIX = 'clueless_saved_outfits_user_v1';
const LOCAL_TRYON_HISTORY_KEY = 'clueless_tryon_history_v1';
const LOCAL_SELECTED_OUTFIT_KEY = 'clueless_selected_outfit_v1';
const LOCAL_SYNC_QUEUE_KEY = 'clueless_sync_queue_v1';
const TRYON_HISTORY_PAGE_SIZE = 9;

type TryOnHistoryEntry = {
  id: string;
  createdAt: string;
  imageUrl: string;
  personImageUrl: string;
  garmentImageUrl: string;
  garmentCode?: string;
};

type SyncQueueItem =
  | {
      id: string;
      kind: 'wardrobe_create';
      payload: WardrobeItem & { sortOrder?: number };
      attempts: number;
      lastError?: string;
    }
  | {
      id: string;
      kind: 'wardrobe_delete';
      payload: { code: string };
      attempts: number;
      lastError?: string;
    }
  | {
      id: string;
      kind: 'favorite_create';
      payload: {
        localId: string;
        tops?: WardrobeItem;
        bottoms?: WardrobeItem;
        accessories?: WardrobeItem;
        savedAt: string;
      };
      attempts: number;
      lastError?: string;
    }
  | {
      id: string;
      kind: 'favorite_delete';
      payload: { id: string };
      attempts: number;
      lastError?: string;
    };

const VTO_STAGE_LABELS: Record<VtoStage, string> = {
  upload: 'Upload',
  validation: 'Validation',
  processing: 'Processing',
  generating: 'Generating',
  final: 'Final Result',
};

function loadTryOnHistory(): TryOnHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_TRYON_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TryOnHistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function inferTryOnErrorHint(code?: VtoErrorCode): string {
  switch (code) {
    case 'INVALID_IMAGE':
      return 'Use a clear, full-body photo with good lighting and a visible garment image.';
    case 'NETWORK':
      return 'Check your connection and retry. We keep your last inputs.';
    case 'BILLING':
      return 'Add Replicate credit / billing, then retry.';
    case 'PROVIDER':
      return 'Provider issue detected. Retry in a moment.';
    case 'TIMEOUT':
      return 'The generation timed out. Retry or reduce image size.';
    default:
      return 'Retry now or upload a different photo.';
  }
}

function resolvePrimaryTryOnGarment(
  selectedOutfit: { tops?: WardrobeItem; bottoms?: WardrobeItem; accessories?: WardrobeItem },
  selectedCategory: WardrobeCategory
): WardrobeItem | null {
  const categoryPick =
    selectedCategory === 'tops'
      ? selectedOutfit.tops
      : selectedCategory === 'bottoms'
        ? selectedOutfit.bottoms
        : selectedOutfit.accessories;
  if (categoryPick) return categoryPick;
  return selectedOutfit.tops ?? selectedOutfit.bottoms ?? selectedOutfit.accessories ?? null;
}

function toVtoCategory(item: WardrobeItem): 'upper_body' | 'lower_body' | 'dresses' {
  const isDress = /\bdress\b/i.test(item.type);
  if (item.category === 'tops') return isDress ? 'dresses' : 'upper_body';
  if (item.category === 'bottoms') return 'lower_body';
  return 'upper_body';
}

function resolveTryOnGarments(
  selectedOutfit: { tops?: WardrobeItem; bottoms?: WardrobeItem; accessories?: WardrobeItem },
  _selectedCategory: WardrobeCategory
): WardrobeItem[] {
  // Apply base garments first, then accessories last so they are not overwritten
  // by later generation passes.
  return [selectedOutfit.tops, selectedOutfit.bottoms, selectedOutfit.accessories].filter(
    (item): item is WardrobeItem => !!item
  );
}

function buildTryOnPrompt(item: WardrobeItem): string {
  if (item.category === 'accessories') {
    return `Add the ${item.type} accessory clearly and naturally. Preserve previously applied clothing fit and texture.`;
  }
  return `Virtual try-on with ${item.type}. Preserve previously applied garments and overall realism.`;
}

function loadLocalSavedOutfits(): SavedOutfit[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_SAVED_OUTFITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedOutfit[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((o) => ({
      ...o,
      savedAt: o.savedAt instanceof Date ? o.savedAt : new Date(String(o.savedAt)),
    }));
  } catch {
    return [];
  }
}

function savedOutfitsUserKey(userId: string): string {
  return `${LOCAL_SAVED_OUTFITS_USER_PREFIX}:${userId}`;
}

function normalizeSavedOutfits(value: unknown): SavedOutfit[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row && typeof row === 'object')
    .map((row) => {
      const r = row as Partial<SavedOutfit> & { savedAt?: unknown };
      return {
        id: String(r.id ?? ''),
        tops: r.tops,
        bottoms: r.bottoms,
        accessories: r.accessories,
        savedAt:
          r.savedAt instanceof Date
            ? r.savedAt
            : new Date(typeof r.savedAt === 'string' || typeof r.savedAt === 'number' ? r.savedAt : Date.now()),
      } as SavedOutfit;
    })
    .filter((o) => o.id.length > 0 && !Number.isNaN(o.savedAt.getTime()));
}

function loadSavedOutfitsForUser(userId: string | null): SavedOutfit[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(savedOutfitsUserKey(userId));
    if (!raw) return [];
    return normalizeSavedOutfits(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persistSavedOutfitsForUser(userId: string | null, outfits: SavedOutfit[]): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      savedOutfitsUserKey(userId),
      JSON.stringify(outfits.map((o) => ({ ...o, savedAt: o.savedAt.toISOString() })))
    );
  } catch {
    // ignore quota/storage issues
  }
}

function mergeRemoteAndLocalSavedOutfits(remote: SavedOutfit[], local: SavedOutfit[]): SavedOutfit[] {
  if (local.length === 0) return remote;
  const merged = [...remote];
  const knownIds = new Set(remote.map((o) => o.id));
  for (const item of local) {
    if (knownIds.has(item.id)) continue;
    // Keep local unsynced entries so user never "loses" a saved outfit due transient cloud issues.
    if (!isPersistedOutfitId(item.id)) merged.push(item);
  }
  return merged.sort((a, b) => b.savedAt.getTime() - a.savedAt.getTime());
}

function loadSyncQueue(): SyncQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SyncQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeWardrobeCategory(raw: string): WardrobeCategory {
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'tops' || normalized === 'top' || normalized === 'upper' || normalized === 'upper_body') {
    return 'tops';
  }
  if (normalized === 'bottoms' || normalized === 'bottom' || normalized === 'lower' || normalized === 'lower_body') {
    return 'bottoms';
  }
  return 'accessories';
}

function isPersistedOutfitId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function wardrobeItemLabel(item: WardrobeItem | undefined): string {
  if (!item) return '';
  const t = item.title?.trim();
  return t || item.code;
}

function findTryOnImageForOutfit(outfit: SavedOutfit, history: TryOnHistoryEntry[]): string | null {
  const codes = new Set(
    [outfit.tops?.code, outfit.bottoms?.code, outfit.accessories?.code].filter(Boolean)
  );
  if (codes.size === 0) return null;
  const match = history.find((e) => e.garmentCode && codes.has(e.garmentCode));
  return match?.imageUrl ?? null;
}

/** Merge saved snapshot with current wardrobe so thumbnails/titles stay up to date. */
function hydrateSavedOutfitFromWardrobe(outfit: SavedOutfit, wardrobe: WardrobeItem[]): SavedOutfit {
  const byCode = new Map(wardrobe.map((i) => [i.code, i]));
  return {
    ...outfit,
    tops: outfit.tops ? byCode.get(outfit.tops.code) ?? outfit.tops : undefined,
    bottoms: outfit.bottoms ? byCode.get(outfit.bottoms.code) ?? outfit.bottoms : undefined,
    accessories: outfit.accessories ? byCode.get(outfit.accessories.code) ?? outfit.accessories : undefined,
  };
}

function trackAuthHydration(event: string, data: Record<string, unknown> = {}): void {
  if (!AUTH_HYDRATION_TELEMETRY) return;
  console.info('[telemetry/auth-hydration]', event, data);
}

export default function App() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(!SUPABASE_ON);
  const [isPro, setIsPro] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<WardrobeCategory>('tops');
  const [selectedOutfit, setSelectedOutfit] = useState<{
    tops?: WardrobeItem;
    bottoms?: WardrobeItem;
    accessories?: WardrobeItem;
  }>({});
  const [showChat, setShowChat] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showSelfieUpload, setShowSelfieUpload] = useState(false);
  const [userSelfie, setUserSelfie] = useState<string | null>(null);
  const [location, setLocation] = useState('Berlin');
  const [hasManualLocation, setHasManualLocation] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locationDraft, setLocationDraft] = useState('Berlin');
  const [weather, setWeather] = useState({ temp: 12, condition: 'Cloudy' });
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>(() =>
    SUPABASE_ON ? [] : loadLocalSavedOutfits()
  );
  const [savedOutfitsLoading, setSavedOutfitsLoading] = useState(false);
  const [deletingOutfitId, setDeletingOutfitId] = useState<string | null>(null);
  const [lightboxImageUrl, setLightboxImageUrl] = useState<string | null>(null);
  const [deletingItemCode, setDeletingItemCode] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'wardrobe' | 'outfits'>('wardrobe');
  const [currentPage, setCurrentPage] = useState(0);
  const [isGeneratingTryOn, setIsGeneratingTryOn] = useState(false);
  const [tryOnImageUrl, setTryOnImageUrl] = useState<string | null>(null);
  const [vtoStage, setVtoStage] = useState<VtoStage>('upload');
  const [vtoProgress, setVtoProgress] = useState(0);
  const [vtoStatusMessage, setVtoStatusMessage] = useState('Upload your photo to begin');
  const [vtoJobId, setVtoJobId] = useState<string | null>(null);
  const [vtoError, setVtoError] = useState<{ code?: VtoErrorCode; message: string } | null>(null);
  const [tryOnHistory, setTryOnHistory] = useState<TryOnHistoryEntry[]>(loadTryOnHistory);
  const [visibleTryOnCount, setVisibleTryOnCount] = useState(TRYON_HISTORY_PAGE_SIZE);
  const [syncQueue, setSyncQueue] = useState<SyncQueueItem[]>(loadSyncQueue);
  const [isSyncProcessing, setIsSyncProcessing] = useState(false);
  const [tryOnPreviewUrl, setTryOnPreviewUrl] = useState<string | null>(null);
  const baseModelImg = 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80';
  const itemsPerPage = 8;
  const [userName, setUserName] = useState('Alex');
  const [supabaseReady, setSupabaseReady] = useState(!SUPABASE_ON);
  const [langMode, setLangMode] = useState<'slang' | 'english'>(() => {
    if (typeof window === 'undefined') return 'slang';
    return (localStorage.getItem('clueless_lang_mode') as 'slang' | 'english') ?? 'slang';
  });

  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const estimatedHoursSaved = Math.max(
    1,
    Math.round(((savedOutfits.length * 12 + tryOnHistory.length * 4) / 60) * 10) / 10
  );
  const stylePanicMomentsPrevented = savedOutfits.length * 2 + tryOnHistory.length;
  const outfitRepeatsAvoided = Math.max(0, savedOutfits.length - 1);
  const mirrorMinutesSaved = savedOutfits.length * 7 + tryOnHistory.length * 3;
  const weatherFaceoffsWon = Math.max(1, Math.round(tryOnHistory.length * 0.7));

  const copy = getVtoCopy(langMode === 'slang' ? 'playful' : 'minimal');
  const t = (slang: string, english: string) => langMode === 'slang' ? slang : english;

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') sonnerToast.error(message);
    else sonnerToast.success(message);
  };

  const mountedRef = useRef(true);
  /** Set whenever Supabase session is verified; used for synchronous localStorage writes (no async getSession race). */
  const wardrobeUserIdRef = useRef<string | null>(null);
  /** Last user id we loaded saved outfits for — clear list when switching accounts. */
  const savedOutfitsUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(LOCAL_SYNC_QUEUE_KEY, JSON.stringify(syncQueue));
    } catch {
      // ignore storage quota issues
    }
  }, [syncQueue]);

  const enqueueSync = useCallback((item: Omit<SyncQueueItem, 'id' | 'attempts'>) => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `sync-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setSyncQueue((prev) => [...prev, { ...item, id, attempts: 0 } as SyncQueueItem]);
  }, []);

  const processSyncQueue = useCallback(async () => {
    if (!SUPABASE_ON || isSyncProcessing || syncQueue.length === 0) return;
    setIsSyncProcessing(true);
    try {
      const [current] = syncQueue;
      if (!current) return;
      let ok = false;
      let persistedId: string | null = null;
      let failureMessage = 'Sync failed';
      if (current.kind === 'wardrobe_create') {
        const res = await fetch('/api/wardrobe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(current.payload),
        });
        ok = res.ok;
        if (!ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          failureMessage = payload.error ?? failureMessage;
        }
      } else if (current.kind === 'wardrobe_delete') {
        const res = await fetch(`/api/wardrobe/${encodeURIComponent(current.payload.code)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        ok = res.ok;
        if (!ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          failureMessage = payload.error ?? failureMessage;
        }
      } else if (current.kind === 'favorite_create') {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tops: current.payload.tops,
            bottoms: current.payload.bottoms,
            accessories: current.payload.accessories,
            savedAt: current.payload.savedAt,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
        ok = res.ok && Boolean(payload.id);
        persistedId = payload.id ?? null;
        if (!ok) failureMessage = payload.error ?? failureMessage;
      } else if (current.kind === 'favorite_delete') {
        const res = await fetch(`/api/favorites/${encodeURIComponent(current.payload.id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        ok = res.ok;
        if (!ok) {
          const payload = (await res.json().catch(() => ({}))) as { error?: string };
          failureMessage = payload.error ?? failureMessage;
        }
      }

      if (ok) {
        if (current.kind === 'favorite_create' && persistedId) {
          setSavedOutfits((prev) =>
            prev.map((o) => (o.id === current.payload.localId ? { ...o, id: persistedId } : o))
          );
        }
        setSyncQueue((prev) => prev.slice(1));
      } else {
        setSyncQueue((prev) =>
          prev.map((entry, idx) =>
            idx === 0
              ? {
                  ...entry,
                  attempts: entry.attempts + 1,
                  lastError: failureMessage,
                }
              : entry
          )
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSyncQueue((prev) =>
        prev.map((entry, idx) =>
          idx === 0 ? { ...entry, attempts: entry.attempts + 1, lastError: message } : entry
        )
      );
    } finally {
      setIsSyncProcessing(false);
    }
  }, [isSyncProcessing, syncQueue]);

  useEffect(() => {
    if (!SUPABASE_ON || syncQueue.length === 0) return;
    void processSyncQueue();
    const interval = window.setInterval(() => {
      void processSyncQueue();
    }, 3500);
    const onOnline = () => {
      void processSyncQueue();
    };
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [processSyncQueue, syncQueue.length]);

  const hydrateRemoteUser = useCallback(async (userId: string): Promise<boolean> => {
    const supabase = createBrowserSupabaseClient();
    trackAuthHydration('hydrate_start', { requestedUser: Boolean(userId) });
    wardrobeUserIdRef.current = userId;

    if (savedOutfitsUserIdRef.current !== null && savedOutfitsUserIdRef.current !== userId) {
      setSavedOutfits([]);
    }
    savedOutfitsUserIdRef.current = userId;

    // Profile is small and orthogonal to wardrobe sync; load it in parallel.
    const profilePromise = fetchProfile(supabase, userId).then(async (p) => {
      if (p) return p;
      await ensureProfileRow(supabase, userId);
      return fetchProfile(supabase, userId);
    });

    // 1. Try the canonical full-sync API (one round-trip, server-bumped timestamp).
    let canonical = await fetchCanonicalSyncFromApi();
    if (!mountedRef.current) return true;

    // 2. Fall back to direct queries if the API is unreachable.
    if (!canonical) {
      trackAuthHydration('canonical_sync_fallback', {});
      const [wardrobeFallback, outfitsFallback] = await Promise.all([
        (async () => {
          const direct = await fetchWardrobe(supabase, userId);
          if (direct !== null) return direct;
          return await fetchWardrobeFromApi();
        })(),
        fetchSavedOutfits(supabase, userId),
      ]);
      if (wardrobeFallback !== null && outfitsFallback !== null) {
        canonical = {
          items: wardrobeFallback,
          outfits: outfitsFallback,
          lastFullSyncAt: new Date().toISOString(),
        };
      }
    }

    const profile = await profilePromise;
    if (!mountedRef.current) return true;
    if (profile) {
      setUserName(profile.display_name || 'Alex');
      setHasCompletedOnboarding(profile.onboarding_completed);
      setUserSelfie(profile.selfie_url ?? null);
      setIsPro(profile.is_pro ?? false);
    }

    if (canonical) {
      setWardrobeItems(canonical.items);
      const localSaved = loadSavedOutfitsForUser(userId);
      const merged = mergeRemoteAndLocalSavedOutfits(canonical.outfits, localSaved);
      setSavedOutfits(merged);
      persistSavedOutfitsForUser(userId, merged);
      trackAuthHydration('hydrate_ok', {
        wardrobe: canonical.items.length,
        outfits: canonical.outfits.length,
      });
      return true;
    }

    trackAuthHydration('hydrate_failed', {});
    showToast('Could not load your wardrobe from the cloud. Try again.', 'error');
    return false;
  }, []);

  const clearRemoteSessionState = useCallback(() => {
    wardrobeUserIdRef.current = null;
    savedOutfitsUserIdRef.current = null;
    setIsLoggedIn(false);
    setIsPro(false);
    setLocation('Berlin');
    setWeather({ temp: 12, condition: 'Cloudy' });
    setSavedOutfits([]);
    setWardrobeItems([]);
    setSelectedOutfit({});
    setUserSelfie(null);
    setUserName('Alex');
    setHasCompletedOnboarding(false);
    setShowOnboarding(false);
    setCurrentView('wardrobe');
    setCurrentPage(0);
    setShowChat(false);
    setShowUpload(false);
    setShowSelfieUpload(false);
    setIsGeneratingTryOn(false);
    setTryOnImageUrl(null);
    setSavedOutfitsLoading(false);
    setDeletingOutfitId(null);
    setDeletingItemCode(null);
    setSyncQueue([]);
    setIsSyncProcessing(false);
  }, []);

  const handleAuthDialogSignedIn = useCallback(async () => {
    // Orchestrator already received the SIGNED_IN event before this callback
    // fires. We only need to await its bootstrap so hydrate runs against a
    // verified user id without re-reading getUser() here.
    const orchestrator = getSessionOrchestrator();
    const userId = await orchestrator.waitForUserId();
    if (!userId) return;
    setIsLoggedIn(true);
    wardrobeUserIdRef.current = userId;
    try {
      const ok = await hydrateRemoteUser(userId);
      if (!ok) {
        showToast('Could not verify your account yet. Try again.', 'error');
        return;
      }
    } catch (e) {
      console.error('Post sign-in sync failed', e);
      showToast('Could not load your wardrobe from the cloud. Try again.', 'error');
    }
    router.refresh();
  }, [hydrateRemoteUser, router]);

  useEffect(() => {
    if (!SUPABASE_ON) return;
    const orchestrator = getSessionOrchestrator();
    let cancelled = false;
    let lastUserId: string | null = null;

    const handleState = (state: AuthOrchestratorState) => {
      if (cancelled) return;
      trackAuthHydration('orchestrator_state', { status: state.status });

      if (state.status === 'authenticated') {
        const newUserId = state.user.id;
        const userChanged = lastUserId !== null && lastUserId !== newUserId;
        lastUserId = newUserId;

        setIsLoggedIn(true);
        if (userChanged) {
          // Switched account in the same tab — clear UI state derived from the previous user.
          setSavedOutfits([]);
          setWardrobeItems([]);
          setSelectedOutfit({});
        }

        // Hydrate (idempotent + cheap when state already matches).
        void hydrateRemoteUser(newUserId).catch((err) => {
          console.error('orchestrator hydrate failed', err);
        });
      } else if (state.status === 'signed_out') {
        lastUserId = null;
        clearRemoteSessionState();
      } else if (state.status === 'unconfigured') {
        clearRemoteSessionState();
      }

      if (!cancelled && state.status !== 'idle' && state.status !== 'bootstrapping') {
        setSupabaseReady(true);
      }
    };

    const unsubscribe = orchestrator.subscribe(handleState);
    void orchestrator.bootstrap();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [hydrateRemoteUser, clearRemoteSessionState]);

  useEffect(() => {
    if (!SUPABASE_ON || !supabaseReady) return;
    if (typeof window === 'undefined') return;
    const { hash, search } = window.location;
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setShowPasswordRecovery(true);
    }
    if (search.includes('upgraded=1')) {
      // Clean URL immediately so a refresh doesn't re-trigger.
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
      // Poll for Pro status — webhook may arrive slightly after the redirect.
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const supabase = createBrowserSupabaseClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) { clearInterval(poll); return; }
          const { data } = await supabase
            .from('profiles')
            .select('is_pro')
            .eq('id', user.id)
            .single();
          if (data?.is_pro) {
            setIsPro(true);
            showToast('You\'re now Pro! Welcome to the main character era. ✨');
            clearInterval(poll);
          }
        } catch { /* ignore */ }
        if (attempts >= 8) clearInterval(poll); // give up after ~16s
      }, 2000);
    }
  }, [supabaseReady]);

  useEffect(() => {
    try {
      if (!SUPABASE_ON) {
        localStorage.setItem(LOCAL_SAVED_OUTFITS_KEY, JSON.stringify(savedOutfits));
        return;
      }
      const uid = savedOutfitsUserIdRef.current ?? wardrobeUserIdRef.current;
      persistSavedOutfitsForUser(uid, savedOutfits);
    } catch (e) {
      console.error('Could not persist saved outfits locally', e);
    }
  }, [savedOutfits]);

  // (Removed: wardrobeItems → localStorage auto-save. Wardrobe is cloud-only.)

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const out = {
      tops: selectedOutfit.tops?.code,
      bottoms: selectedOutfit.bottoms?.code,
      accessories: selectedOutfit.accessories?.code,
    };
    localStorage.setItem(LOCAL_SELECTED_OUTFIT_KEY, JSON.stringify(out));
  }, [selectedOutfit]);

  useEffect(() => {
    if (typeof window === 'undefined' || wardrobeItems.length === 0) return;
    try {
      const raw = localStorage.getItem(LOCAL_SELECTED_OUTFIT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        tops?: string;
        bottoms?: string;
        accessories?: string;
      };
      const byCode = new Map(wardrobeItems.map((i) => [i.code, i]));
      setSelectedOutfit((prev) => ({
        tops: parsed.tops ? byCode.get(parsed.tops) : prev.tops,
        bottoms: parsed.bottoms ? byCode.get(parsed.bottoms) : prev.bottoms,
        accessories: parsed.accessories ? byCode.get(parsed.accessories) : prev.accessories,
      }));
    } catch {
      // ignore corrupt local storage
    }
    // only re-hydrate when wardrobe list changes fundamentally
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wardrobeItems.length]);

  const refreshSavedOutfits = async () => {
    if (!SUPABASE_ON || !isLoggedIn) return;
    setSavedOutfitsLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        const uid = savedOutfitsUserIdRef.current;
        if (uid) {
          const cached = loadSavedOutfitsForUser(uid);
          if (cached.length > 0) setSavedOutfits(cached);
        }
        return;
      }
      savedOutfitsUserIdRef.current = user.id;
      const cached = loadSavedOutfitsForUser(user.id);
      if (cached.length > 0) setSavedOutfits(cached);
      const response = await fetch('/api/favorites', { cache: 'no-store', credentials: 'include' });
      const payload = (await response.json().catch(() => ({}))) as {
        favorites?: SavedOutfit[];
        error?: string;
      };
      if (!response.ok || !Array.isArray(payload.favorites)) {
        showToast(payload.error || 'Could not load saved outfits. Check your connection and try again.', 'error');
        if (cached.length > 0) setSavedOutfits(cached);
        return;
      }
      const list = normalizeSavedOutfits(payload.favorites);
      const merged = mergeRemoteAndLocalSavedOutfits(list, cached);
      setSavedOutfits(merged);
      persistSavedOutfitsForUser(user.id, merged);
    } catch (e) {
      console.error('refreshSavedOutfits', e);
      showToast('Could not refresh saved outfits', 'error');
    } finally {
      setSavedOutfitsLoading(false);
    }
  };

  useEffect(() => {
    if (!SUPABASE_ON || !isLoggedIn || currentView !== 'outfits') return;
    void refreshSavedOutfits();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when tab opens
  }, [currentView, SUPABASE_ON, isLoggedIn]);

  const openAuth = useCallback((mode: 'signin' | 'signup' | 'forgot') => {
    if (!SUPABASE_ON) {
      setIsLoggedIn(true);
      setSavedOutfits(loadLocalSavedOutfits());
      return;
    }
    setAuthInitialMode(mode);
    setShowAuthDialog(true);
  }, []);

  const handleLogin = () => openAuth('signin');
  const handleSignUpCTA = () => openAuth('signup');

  const handleLogout = async () => {
    if (!SUPABASE_ON) {
      setSelectedOutfit({});
      setIsLoggedIn(false);
      setLocation('Berlin');
      setHasManualLocation(false);
      setIsEditingLocation(false);
      setLocationDraft('Berlin');
      setWeather({ temp: 12, condition: 'Cloudy' });
      return;
    }

    // Optimistic teardown via the orchestrator (single source of truth) so a
    // hung server signOut never leaves the UI stuck signed in.
    clearRemoteSessionState();
    try {
      await getSessionOrchestrator().signOut();
    } catch (e) {
      console.error('orchestrator signOut threw', e);
    }
    router.refresh();
  };

  // Onboarding modal disabled — removed for all users.

  useEffect(() => {
    if (SUPABASE_ON) return;
    const storedSelfie = localStorage.getItem('userSelfie');
    if (storedSelfie) setUserSelfie(storedSelfie);
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const response = await fetch(`/api/weather?city=${encodeURIComponent(location)}`);
        if (!response.ok) return;
        const payload = await response.json();
        if (payload?.weather?.tempC && payload?.weather?.condition) {
          setWeather({
            temp: payload.weather.tempC,
            condition: payload.weather.condition,
          });
        }
      } catch {
        // Keep default weather if API is unavailable.
      }
    };
    void fetchWeather();
  }, [location]);

  /**
   * Auto-detect location server-side (IP/cdn headers) so we never trigger
   * browser geolocation permission prompts.
   */
  useEffect(() => {
    if (!isLoggedIn || hasManualLocation) return;
    let cancelled = false;
    const detectWeather = async () => {
      try {
        const response = await fetch('/api/weather?auto=1');
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        if (payload?.city && typeof payload.city === 'string') {
          setLocation(payload.city);
        }
        if (payload?.weather?.tempC != null && payload?.weather?.condition) {
          setWeather({
            temp: payload.weather.tempC,
            condition: payload.weather.condition,
          });
        }
      } catch {
        // keep prior location / weather
      }
    };
    void detectWeather();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, hasManualLocation]);

  // Prompt for selfie if not uploaded and wardrobe has items
  useEffect(() => {
    if (isLoggedIn && !userSelfie && wardrobeItems.length > 0 && hasCompletedOnboarding) {
      const timer = setTimeout(() => {
        setShowSelfieUpload(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isLoggedIn, userSelfie, wardrobeItems.length, hasCompletedOnboarding]);

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    setHasCompletedOnboarding(true);
    if (!SUPABASE_ON) localStorage.setItem('hasSeenOnboarding', 'true');
    if (SUPABASE_ON) {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await updateProfile(supabase, user.id, { onboarding_completed: true });
        }
      } catch (e) {
        console.error('Failed to persist onboarding', e);
      }
    }
  };

  const handleSelfieUpload = async (imageUrl: string) => {
    setUserSelfie(imageUrl);
    setTryOnImageUrl(null);
    localStorage.setItem('userSelfie', imageUrl);
    setShowSelfieUpload(false);
    showToast('Profile photo uploaded!');
    if (SUPABASE_ON) {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await updateProfile(supabase, user.id, { selfie_url: imageUrl });
        }
      } catch (e) {
        console.error('Failed to persist selfie', e);
      }
    }
  };

  const handleSaveOutfit = async () => {
    if (!selectedOutfit.tops && !selectedOutfit.bottoms && !selectedOutfit.accessories) {
      showToast('Select at least one piece (top, bottom, or accessory) to save.', 'error');
      return;
    }

    const savedAt = new Date();
    const tempId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `local-${crypto.randomUUID()}`
        : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimisticOutfit: SavedOutfit = {
      id: tempId,
      tops: selectedOutfit.tops,
      bottoms: selectedOutfit.bottoms,
      accessories: selectedOutfit.accessories,
      savedAt,
    };
    setSavedOutfits((prev) => [optimisticOutfit, ...prev.filter((o) => o.id !== tempId)]);

    if (!SUPABASE_ON) {
      showToast('Outfit saved successfully!');
      return;
    }

    let cloudSaveFailed = false;
    let persistedId: string | null = null;
    let userIdForCache: string | null = savedOutfitsUserIdRef.current ?? wardrobeUserIdRef.current;

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        cloudSaveFailed = true;
      } else {
        userIdForCache = user.id;
        savedOutfitsUserIdRef.current = user.id;
        const response = await fetch('/api/favorites', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tops: selectedOutfit.tops,
            bottoms: selectedOutfit.bottoms,
            accessories: selectedOutfit.accessories,
            savedAt: savedAt.toISOString(),
          }),
        });
        const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!response.ok || !payload.id) {
          console.warn('favorites POST failed; keeping local copy', payload.error ?? response.statusText);
          cloudSaveFailed = true;
        } else {
          persistedId = payload.id;
        }
      }
    } catch (e) {
      console.error('Failed to save outfit remotely; keeping local copy', e);
      cloudSaveFailed = true;
    }

    if (persistedId) {
      setSavedOutfits((prev) =>
        prev.map((o) =>
          o.id === tempId
            ? {
                ...o,
                id: persistedId,
              }
            : o
        )
      );
      showToast('Outfit saved successfully!');
      // Pull canonical server list to close any consistency gaps.
      void refreshSavedOutfits();
    } else if (cloudSaveFailed) {
      // Keep optimistic local row; user still sees immediate result.
      if (userIdForCache) {
        const current = loadSavedOutfitsForUser(userIdForCache);
        const next = [optimisticOutfit, ...current.filter((o) => o.id !== optimisticOutfit.id)];
        persistSavedOutfitsForUser(userIdForCache, next);
      }
      enqueueSync({
        kind: 'favorite_create',
        payload: {
          localId: optimisticOutfit.id,
          tops: optimisticOutfit.tops,
          bottoms: optimisticOutfit.bottoms,
          accessories: optimisticOutfit.accessories,
          savedAt: optimisticOutfit.savedAt.toISOString(),
        },
      });
      showToast('Outfit saved on this device. Cloud sync is unavailable right now.', 'error');
    } else {
      showToast('Outfit saved successfully!');
    }
  };

  const handleApplySavedOutfit = (outfit: SavedOutfit) => {
    const hydrated = hydrateSavedOutfitFromWardrobe(outfit, wardrobeItems);
    setSelectedOutfit({
      tops: hydrated.tops,
      bottoms: hydrated.bottoms,
      accessories: hydrated.accessories,
    });
    setCurrentView('wardrobe');
    showToast('Applied to your wardrobe builder');
  };

  const handleDeleteSavedOutfit = async (outfit: SavedOutfit) => {
    const label =
      wardrobeItemLabel(outfit.tops) ||
      wardrobeItemLabel(outfit.bottoms) ||
      wardrobeItemLabel(outfit.accessories) ||
      'this outfit';
    if (!window.confirm(`Remove "${label}" from saved outfits? This cannot be undone.`)) return;

    if (SUPABASE_ON && isPersistedOutfitId(outfit.id)) {
      setDeletingOutfitId(outfit.id);
      try {
        const response = await fetch(`/api/favorites/${encodeURIComponent(outfit.id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          enqueueSync({
            kind: 'favorite_delete',
            payload: { id: outfit.id },
          });
          showToast(
            payload.error
              ? `Delete queued: ${payload.error}`
              : 'Cloud delete queued. We will retry in background.',
            'error'
          );
        }
      } finally {
        setDeletingOutfitId(null);
      }
    }

    setSavedOutfits((prev) => prev.filter((o) => o.id !== outfit.id));
    showToast('Outfit removed');
  };

  const handleDeleteWardrobeItem = async (item: WardrobeItem) => {
    const label = wardrobeItemLabel(item) || item.type;
    if (!window.confirm(`Remove "${label}" from your wardrobe? This cannot be undone.`)) return;

    if (SUPABASE_ON) {
      setDeletingItemCode(item.code);
      try {
        const response = await fetch(`/api/wardrobe/${encodeURIComponent(item.code)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          enqueueSync({
            kind: 'wardrobe_delete',
            payload: { code: item.code },
          });
          showToast(
            payload.error
              ? `Delete queued: ${payload.error}`
              : 'Cloud delete queued. We will retry in background.',
            'error'
          );
        }
      } finally {
        setDeletingItemCode(null);
      }
    }

    setWardrobeItems((prev) => prev.filter((i) => i.code !== item.code));

    setSelectedOutfit((prev) => {
      if (prev[item.category]?.code !== item.code) return prev;
      const next = { ...prev };
      delete next[item.category];
      return next;
    });

    showToast(`${item.type} removed from wardrobe`);
  };

  const handleAddItem = (item: {
    type: string;
    category: string;
    imageUrl?: string;
    title?: string;
    sourceUrl?: string;
    attribution?: string;
  }) => {
    const category = normalizeWardrobeCategory(item.category);
    const prefix = category === 'tops' ? 'TP' : category === 'bottoms' ? 'BT' : 'AC';
    const suffix =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const newItem: WardrobeItem = {
      code: `${prefix}-${suffix}`,
      type: item.type,
      category,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.title ? { title: item.title } : {}),
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
      ...(item.attribution ? { attribution: item.attribution } : {}),
    };

    // Optimistic in-memory add. Cloud is the only persistence layer — if the POST
    // fails, we roll back the in-memory state so the UI never shows a non-persisted
    // item the user might believe is saved.
    let nextLength = 0;
    setWardrobeItems((prev) => {
      const next = [...prev, newItem];
      nextLength = next.length;
      return next;
    });

    if (!SUPABASE_ON) {
      showToast(`${item.type} added to wardrobe!`);
      return;
    }

    void (async () => {
      const sortOrder = Math.max(0, nextLength - 1);
      try {
        const response = await fetch('/api/wardrobe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...newItem, sortOrder }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          console.warn('wardrobe POST failed', payload.error ?? response.statusText);
          // Roll back: cloud is the only source of truth, so a failed save means
          // the item never existed.
          setWardrobeItems((prev) => prev.filter((i) => i.code !== newItem.code));
          showToast(
            payload.error
              ? `Could not save ${item.type}: ${payload.error}`
              : `Could not save ${item.type}. Try again.`,
            'error'
          );
          return;
        }
        showToast(`${item.type} added to wardrobe!`);
      } catch (e) {
        console.warn('Cloud wardrobe sync failed', e);
        setWardrobeItems((prev) => prev.filter((i) => i.code !== newItem.code));
        showToast(`Could not save ${item.type}. Check your connection and try again.`, 'error');
      }
    })();
  };


  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LOCAL_TRYON_HISTORY_KEY, JSON.stringify(tryOnHistory));
  }, [tryOnHistory]);

  useEffect(() => {
    if (tryOnHistory.length === 0) {
      setVisibleTryOnCount(TRYON_HISTORY_PAGE_SIZE);
    }
  }, [tryOnHistory.length]);

  useEffect(() => {
    if (!tryOnPreviewUrl) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTryOnPreviewUrl(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tryOnPreviewUrl]);

  useEffect(() => {
    if (isGeneratingTryOn || tryOnImageUrl) return;
    if (!userSelfie) {
      setVtoStage('upload');
      setVtoStatusMessage(copy.idleUpload);
      setVtoProgress(0);
      return;
    }
    setVtoStage('validation');
    setVtoStatusMessage(copy.idlePick);
    setVtoProgress(5);
  }, [userSelfie, tryOnImageUrl, isGeneratingTryOn]);

  const applyVtoSnapshot = useCallback(
    (snapshot: TryOnJobSnapshot) => {
      setVtoJobId(snapshot.jobId);
      setVtoProgress(snapshot.progress);
      setVtoStage(snapshot.stage);
      setVtoStatusMessage(snapshot.statusMessage);
      setIsGeneratingTryOn(snapshot.status === 'queued' || snapshot.status === 'processing');
      if (snapshot.status === 'completed' && snapshot.imageUrl) {
        setTryOnImageUrl(snapshot.imageUrl);
        setVtoError(null);
        const selectedGarment = resolvePrimaryTryOnGarment(selectedOutfit, selectedCategory);
        const garmentImageUrl = selectedGarment?.imageUrl ?? (selectedGarment ? getGarmentImage(selectedGarment.type) : '');
        const entry: TryOnHistoryEntry = {
          id: snapshot.jobId,
          createdAt: new Date().toISOString(),
          imageUrl: snapshot.imageUrl,
          personImageUrl: userSelfie ?? '',
          garmentImageUrl,
          garmentCode: selectedGarment?.code,
        };
        setTryOnHistory((prev) => [entry, ...prev.filter((i) => i.id !== entry.id)]);
        showToast('Try-on generated');
      }
      if (snapshot.status === 'failed') {
        setVtoError({
          code: snapshot.errorCode,
          message: snapshot.errorMessage || 'Try-on failed',
        });
        showToast(snapshot.errorMessage || 'Try-on failed', 'error');
      }
    },
    [selectedCategory, selectedOutfit, showToast, userSelfie]
  );

  const validateImageBeforeTryOn = useCallback(async (imageUrl: string, kind: 'person' | 'garment') => {
    if (!imageUrl) return `${kind === 'person' ? 'Selfie' : 'Garment image'} is required.`;
    const allowed = /^https?:\/\/|^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageUrl);
    if (!allowed) return 'Unsupported image format. Use JPEG, PNG, or WEBP.';

    if (typeof window === 'undefined') return null;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Image failed to load'));
      el.src = imageUrl;
    }).catch(() => null);
    // Non-blocking fallback: some valid remote URLs fail browser-side preload due CORS/hotlinking,
    // but still work for server-side generation. Let backend be the final authority in that case.
    if (!img) return null;
    if (kind === 'person') {
      if (img.width < 512 || img.height < 512) return 'Upload a clearer full-body photo (at least 512x512).';
      const ratio = img.width / img.height;
      if (ratio > 1.1 || ratio < 0.35) return 'Use a portrait-style full-body selfie (not ultra-wide or heavily cropped).';
      try {
        const canvas = document.createElement('canvas');
        const targetW = 32;
        const targetH = Math.max(32, Math.round((img.height / img.width) * targetW));
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const pixels = ctx.getImageData(0, 0, targetW, targetH).data;
          let luminance = 0;
          for (let i = 0; i < pixels.length; i += 4) {
            luminance += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
          }
          const avg = luminance / (pixels.length / 4);
          if (avg < 45) return 'Lighting looks too dark. Try a brighter photo for better results.';
        }
      } catch {
        // Ignore canvas/CORS issues for external images.
      }
    } else if (img.width < 256 || img.height < 256) {
      return 'Garment image is too small. Choose a higher resolution product photo.';
    }
    return null;
  }, []);

  const watchTryOnJob = useCallback(
    async (jobId: string) => {
      let done = false;
      let eventSource: EventSource | null = null;

      const poll = async () => {
        if (done) return;
        try {
          const res = await fetch(`/api/try-on/${jobId}`, { cache: 'no-store' });
          const snap = (await res.json()) as TryOnJobSnapshot;
          if (!res.ok) throw new Error(typeof (snap as { error?: string }).error === 'string' ? (snap as { error?: string }).error : 'Status check failed');
          applyVtoSnapshot(snap);
          if (snap.status === 'completed' || snap.status === 'failed') done = true;
        } catch {
          // ignore transient polling issues
        }
      };

      if (typeof window !== 'undefined') {
        try {
          eventSource = new EventSource(`/api/try-on/${jobId}/events`);
          eventSource.addEventListener('progress', (e) => {
            const snap = JSON.parse((e as MessageEvent).data) as TryOnJobSnapshot;
            applyVtoSnapshot(snap);
            if (snap.status === 'completed' || snap.status === 'failed') {
              done = true;
              eventSource?.close();
            }
          });
          eventSource.addEventListener('error', () => {
            eventSource?.close();
            eventSource = null;
          });
        } catch {
          eventSource = null;
        }
      }

      const started = Date.now();
      while (!done && Date.now() - started < 120000) {
        await new Promise((r) => setTimeout(r, 1500));
        await poll();
      }
      eventSource?.close();
      if (!done) {
        setIsGeneratingTryOn(false);
        setVtoError({ code: 'TIMEOUT', message: 'Try-on is taking too long. Please retry.' });
      }
    },
    [applyVtoSnapshot]
  );

  const handleTryOn = async () => {
    setVtoError(null);
    const selectedGarments = resolveTryOnGarments(selectedOutfit, selectedCategory);
    if (!userSelfie) {
      setVtoStage('upload');
      setVtoStatusMessage(copy.needPhoto);
      showToast('Upload your photo first', 'error');
      return;
    }
    if (selectedGarments.length === 0) {
      showToast('Select at least one outfit item', 'error');
      return;
    }
    if (!selectedOutfit.tops && !selectedOutfit.bottoms && selectedOutfit.accessories) {
      showToast('For realistic try-on, select a top or bottom item first.', 'error');
      return;
    }
    const garmentsForRequest = selectedGarments
      .map((item) => ({
        item,
        imageUrl: item.imageUrl ?? getGarmentImage(item.type),
      }))
      .filter((entry) => !!entry.imageUrl);

    if (garmentsForRequest.length === 0) {
      showToast('Selected items have no usable images for try-on.', 'error');
      return;
    }

    setVtoStage('validation');
    setVtoProgress(8);
    const garmentCodes = garmentsForRequest.map((entry) => entry.item.code).join(', ');
    setVtoStatusMessage(copy.validatingSelected(garmentCodes));

    const personValidation = await validateImageBeforeTryOn(userSelfie, 'person');
    if (personValidation) {
      setVtoError({ code: 'INVALID_IMAGE', message: personValidation });
      showToast(personValidation, 'error');
      return;
    }
    for (const entry of garmentsForRequest) {
      const garmentValidation = await validateImageBeforeTryOn(entry.imageUrl, 'garment');
      if (garmentValidation) {
        const message = `${entry.item.code}: ${garmentValidation}`;
        setVtoError({ code: 'INVALID_IMAGE', message });
        showToast(message, 'error');
        return;
      }
    }

    try {
      setIsGeneratingTryOn(true);
      setVtoStage('processing');
      setVtoProgress(12);
      setVtoStatusMessage(copy.submittingSelected(garmentsForRequest.length));
      const response = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personImageUrl: userSelfie,
          garments: garmentsForRequest.map(({ item, imageUrl }) => ({
            imageUrl,
            category: toVtoCategory(item),
            prompt: buildTryOnPrompt(item),
            code: item.code,
          })),
          crop: true,
          steps: 36,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as CreateTryOnJobResponse & {
        error?: string;
        details?: string;
      };
      if (!response.ok || !payload.jobId) {
        const msg = payload.details || payload.error || `Try-on failed (${response.status})`;
        setVtoError({ code: 'NETWORK', message: msg });
        showToast(msg, 'error');
        setIsGeneratingTryOn(false);
        return;
      }
      setVtoJobId(payload.jobId);
      await watchTryOnJob(payload.jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Try-on failed';
      setVtoError({ code: 'UNKNOWN', message: msg });
      showToast(msg, 'error');
      setIsGeneratingTryOn(false);
    } finally {
      setIsGeneratingTryOn(false);
    }
  };

  const getCategoryItems = (category: WardrobeCategory) => {
    return wardrobeItems.filter(item => item.category === category);
  };

  const getPaginatedItems = (category: WardrobeCategory) => {
    const items = getCategoryItems(category);
    const start = currentPage * itemsPerPage;
    const end = start + itemsPerPage;
    return {
      items: items.slice(start, end),
      totalPages: Math.ceil(items.length / itemsPerPage),
      currentPage,
      hasNext: end < items.length,
      hasPrev: currentPage > 0
    };
  };

  const activeTryOnGarments = resolveTryOnGarments(selectedOutfit, selectedCategory);
  const isBrowserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
  const syncState: 'synced' | 'syncing' | 'retrying' | 'offline_cached' =
    syncQueue.length === 0
      ? 'synced'
      : !isBrowserOnline
        ? 'offline_cached'
        : isSyncProcessing
          ? 'syncing'
          : 'retrying';

  const handleItemClick = (item: WardrobeItem) => {
    setSelectedOutfit(prev => ({
      ...prev,
      [item.category]: prev[item.category]?.code === item.code ? undefined : item
    }));
  };

  const handleCategoryChange = (category: WardrobeCategory) => {
    setSelectedCategory(category);
    setCurrentPage(0); // Reset to first page when changing category
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{
      background: 'linear-gradient(180deg, #FFB3D9 0%, #FFC9E5 50%, #FFE5F1 100%)'
    }}>
      {/* Subtle dot pattern */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.15]" style={{
        backgroundImage: 'radial-gradient(circle, #000 1px, transparent 1px)',
        backgroundSize: '24px 24px'
      }} />
      {/* Header */}
      <motion.header
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3"
        style={{
          background: 'rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(12px)',
          borderBottom: '2px solid rgba(0, 0, 0, 0.08)'
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{
            background: '#000000'
          }}>
            <Shirt className="w-4 h-4 text-white" strokeWidth={2} />
          </div>
          <span className="tracking-[0.05em] uppercase truncate" style={{ fontSize: '13px', fontWeight: 700 }}>Clueless</span>
        </div>

        <div className="flex items-center gap-3 sm:gap-6 min-w-0 flex-1 justify-end">
          {isLoggedIn && (
            <nav
              className="flex items-center gap-2 sm:gap-4 md:gap-6 shrink-0 min-w-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Main views"
            >
              <button
                type="button"
                onClick={() => setCurrentView('wardrobe')}
                aria-current={currentView === 'wardrobe' ? 'page' : undefined}
                className="hover:opacity-60 transition-opacity duration-200 ease-out rounded-sm shrink-0"
                style={{
                  fontSize: 'clamp(9px, 2.5vw, 11px)',
                  fontWeight: currentView === 'wardrobe' ? 800 : 600,
                  letterSpacing: '0.05em',
                  opacity: currentView === 'wardrobe' ? 1 : 0.6
                }}
              >
                MY WARDROBE
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('outfits')}
                aria-current={currentView === 'outfits' ? 'page' : undefined}
                className="hover:opacity-60 transition-opacity duration-200 ease-out rounded-sm flex items-center gap-1 shrink-0"
                style={{
                  fontSize: 'clamp(9px, 2.5vw, 11px)',
                  fontWeight: currentView === 'outfits' ? 800 : 600,
                  letterSpacing: '0.05em',
                  opacity: currentView === 'outfits' ? 1 : 0.6
                }}
              >
                SAVED OUTFITS
                {savedOutfits.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-black text-white flex items-center justify-center" style={{ fontSize: '9px', fontWeight: 700 }}>
                    {savedOutfits.length}
                  </span>
                )}
              </button>
            </nav>
          )}

          {isLoggedIn ? (
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {!userSelfie && (
                <button
                  type="button"
                  onClick={() => setShowSelfieUpload(true)}
                  className="hidden md:flex items-center gap-2 px-4 py-2 rounded-full hover:opacity-80 active:opacity-70 transition-all duration-200 ease-out shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #FFE5C8 0%, #FFD4B8 100%)',
                    border: '2px solid #000'
                  }}
                >
                  <Camera className="w-3.5 h-3.5" strokeWidth={2.5} />
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>ADD PHOTO</span>
                </button>
              )}
              <div
                className="flex items-center gap-1 sm:gap-2 pl-2 pr-1 sm:pr-2 py-1 rounded-full min-w-0 max-w-full relative z-[60] pointer-events-auto"
                style={{
                  background: '#FFE5F1',
                  border: '2px solid #000',
                }}
                title={`Signed in as ${userName}`}
              >
                <User className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                <span
                  className="truncate max-w-[4.5rem] sm:max-w-[10rem] md:max-w-[14rem]"
                  style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}
                >
                  {userName.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex items-center justify-center min-h-10 min-w-10 sm:min-h-9 sm:min-w-9 rounded-full hover:bg-black/8 active:bg-black/12 transition-colors shrink-0 -mr-0.5"
                  aria-label={`Log out ${userName}`}
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              className="px-6 py-2.5 sm:px-7 sm:py-3 text-white hover:opacity-90 active:opacity-80 transition-all duration-200 ease-out rounded-full shrink-0"
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                background: '#000000',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.18)'
              }}
            >
              SIGN IN
            </button>
          )}
        </div>
      </motion.header>

      {isLoggedIn && SUPABASE_ON && (
        <div className="fixed top-[74px] right-6 z-40">
          <div
            className="rounded-full px-3 py-1.5"
            style={{ background: '#FFF', border: '2px solid #000' }}
            title={syncQueue[0]?.lastError ?? undefined}
          >
            <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em' }}>
              {syncState === 'synced'
                ? 'SYNCED'
                : syncState === 'syncing'
                  ? 'SYNCING...'
                  : syncState === 'offline_cached'
                    ? 'OFFLINE CACHED'
                    : 'RETRYING...'}
            </span>
          </div>
        </div>
      )}

      {/* Hero */}
      <section
        className={`relative flex items-center px-6 md:px-12 lg:px-20 ${
          isLoggedIn
            ? 'min-h-[56vh] pt-24 pb-10'
            : 'min-h-[min(100dvh,920px)] pt-28 pb-20 md:pt-32 md:pb-28'
        }`}
      >
        <div className="max-w-[1400px] mx-auto w-full">
          {/* Weather & Location Widget */}
          {isLoggedIn && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.6 }}
              className="flex justify-center mb-8"
            >
              <div className="inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 sm:px-6 py-3 rounded-full max-w-[calc(100vw-2rem)]" style={{
                background: 'rgba(255, 255, 255, 0.8)',
                border: '2px solid #000',
                boxShadow: '4px 4px 0 #000'
              }}>
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                  {isEditingLocation ? (
                    <>
                      <input
                        value={locationDraft}
                        onChange={(e) => setLocationDraft(e.target.value)}
                        className="min-w-[7rem] rounded-md px-2 py-0.5"
                        style={{ fontSize: '11px', fontWeight: 700, border: '1px solid #000', background: '#FFF' }}
                        placeholder="City"
                        aria-label="City"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = locationDraft.trim();
                          if (!next) return;
                          setHasManualLocation(true);
                          setLocation(next);
                          setIsEditingLocation(false);
                        }}
                        className="px-2 py-0.5 rounded-full"
                        style={{ fontSize: '9px', fontWeight: 700, border: '1px solid #000', background: '#FFF' }}
                        aria-label="Save city"
                      >
                        SAVE
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLocationDraft(location);
                          setIsEditingLocation(false);
                        }}
                        className="px-2 py-0.5 rounded-full"
                        style={{ fontSize: '9px', fontWeight: 700, border: '1px solid #000', background: '#FFF' }}
                        aria-label="Cancel city edit"
                      >
                        CANCEL
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="truncate" style={{ fontSize: '12px', fontWeight: 700 }}>{location}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setLocationDraft(location);
                          setIsEditingLocation(true);
                        }}
                        className="px-2 py-0.5 rounded-full"
                        style={{ fontSize: '9px', fontWeight: 700, border: '1px solid #000', background: '#FFF' }}
                        aria-label="Edit city"
                      >
                        EDIT
                      </button>
                      {hasManualLocation && (
                        <button
                          type="button"
                          onClick={() => setHasManualLocation(false)}
                          className="px-2 py-0.5 rounded-full"
                          style={{ fontSize: '9px', fontWeight: 700, border: '1px solid #000', background: '#FFF' }}
                          aria-label="Use auto detected city"
                        >
                          AUTO
                        </button>
                      )}
                    </>
                  )}
                </div>
                <div className="hidden sm:block w-px h-4 bg-black opacity-20 shrink-0" aria-hidden />
                <div className="flex items-center gap-2 flex-wrap justify-center min-w-0">
                  <Cloud className="w-4 h-4 shrink-0" strokeWidth={2.5} />
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>{weather.temp}°C</span>
                  <span className="text-center break-words max-w-[10rem] sm:max-w-none" style={{ fontSize: '11px', fontWeight: 600, opacity: 0.7 }}>{weather.condition}</span>
                </div>
              </div>
            </motion.div>
          )}

          {isLoggedIn && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mb-10"
            >
              <div
                className="rounded-3xl p-6 md:p-8"
                style={{
                  background: 'rgba(255, 255, 255, 0.74)',
                  border: '3px solid #000',
                  boxShadow: '10px 10px 0 #000',
                }}
              >
                <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] items-start">
                  <div>
                    <p className="mb-2 tracking-[0.12em] uppercase" style={{ fontSize: '10px', fontWeight: 700, opacity: 0.55 }}>
                      Welcome back, {userName}
                    </p>
                    <h1
                      className="mb-3"
                      style={{
                        fontSize: 'clamp(30px, 5.2vw, 54px)',
                        fontWeight: 900,
                        lineHeight: 1.02,
                        letterSpacing: '-0.02em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {t('Your outfit command center', 'Your outfit dashboard')}
                    </h1>
                    <p className="mb-5 max-w-[56ch] text-pretty" style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500, opacity: 0.78 }}>
                      {t('Pick a vibe, tap a piece, and let AI do the closet overthinking. Fewer outfit spirals, more walking out the door.', 'Select items from your wardrobe and let AI style them for you. Less time deciding, more time getting dressed.')}
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
                      {[
                        { label: t('CLOSET PIECES', 'WARDROBE ITEMS'), value: wardrobeItems.length },
                        { label: t('LOOKS LOCKED', 'SAVED OUTFITS'), value: savedOutfits.length },
                        { label: t('FIT CHECKS', 'TRY-ONS'), value: tryOnHistory.length },
                        { label: t('HOURS RECLAIMED', 'HOURS SAVED'), value: `${estimatedHoursSaved}h` },
                        { label: t('PANIC MOMENTS AVOIDED', 'DECISIONS MADE'), value: stylePanicMomentsPrevented },
                        { label: t('WEATHER WINS', 'WEATHER OUTFITS'), value: weatherFaceoffsWon },
                      ].map((kpi) => (
                        <div
                          key={kpi.label}
                          className="rounded-xl px-3 py-2"
                          style={{ background: '#FFE5C8', border: '2px solid #000' }}
                        >
                          <div style={{ fontSize: '20px', fontWeight: 900, lineHeight: 1 }}>{kpi.value}</div>
                          <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>{kpi.label}</div>
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: '11px', fontWeight: 600, opacity: 0.65 }}>
                      {t(`Roughly ${mirrorMinutesSaved} mirror minutes saved and ${outfitRepeatsAvoided} outfit repeats dodged. Science-ish, but accurate enough.`, `Estimated ${mirrorMinutesSaved} minutes saved and ${outfitRepeatsAvoided} outfit repeats avoided.`)}
                    </p>

                    <div className="flex items-center flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentView('wardrobe');
                          document.getElementById('wardrobe-panel')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="px-6 py-3 rounded-full text-white inline-flex items-center gap-2"
                        style={{ background: '#000', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em' }}
                      >
                        {t('MAKE ME LOOK EXPENSIVE', 'OPEN MY WARDROBE')}
                        <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentView('outfits')}
                        className="px-6 py-3 rounded-full inline-flex items-center gap-2"
                        style={{ background: '#FFF', border: '2px solid #000', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em' }}
                      >
                        {t('OPEN MY HITS', 'VIEW SAVED OUTFITS')}
                      </button>
                    </div>
                  </div>

                  <div
                    className="rounded-2xl p-4"
                    style={{ background: '#FFF', border: '2px solid #000' }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.7 }}>
                        {t('LAST LOOK ENERGY', 'RECENT TRY-ON')}
                      </span>
                      {isGeneratingTryOn && (
                        <span style={{ fontSize: '10px', fontWeight: 700 }}>
                          {Math.round(vtoProgress)}%
                        </span>
                      )}
                    </div>
                    {tryOnHistory[0]?.imageUrl ? (
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentView('wardrobe');
                          setTryOnImageUrl(tryOnHistory[0].imageUrl);
                          document.getElementById('wardrobe-panel')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="w-full text-left"
                      >
                        <div className="relative aspect-[3/4] rounded-xl overflow-hidden border-2 border-black mb-3">
                          <Image src={tryOnHistory[0].imageUrl} alt="Most recent try-on" fill unoptimized className="object-cover" />
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700 }}>
                          {t('Re-open your latest slay', 'View your latest try-on')}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 500, opacity: 0.7 }}>
                          {new Date(tryOnHistory[0].createdAt).toLocaleString()}
                        </div>
                      </button>
                    ) : (
                      <div
                        className="rounded-xl p-4"
                        style={{ background: '#FFE5F1', border: '2px solid #000' }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: 4 }}>
                          {t('No fashion experiments yet', 'No try-ons yet')}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 500, opacity: 0.75 }}>
                          {t('Pick an item below and launch your first AI style test.', 'Select an item below to start your first AI try-on.')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {!isLoggedIn && (
          <div className="text-center mb-14 md:mb-16">
            {isLoggedIn && (
              <motion.div
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="mb-6 inline-block px-4 py-2 rounded-full"
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '2px solid #000'
                }}
              >
                <span className="tracking-[0.1em] uppercase" style={{ fontSize: '10px', fontWeight: 700 }}>
                  Welcome back, {userName}
                </span>
              </motion.div>
            )}

            {!isLoggedIn && (
              <motion.p
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.6 }}
                className="mb-5 md:mb-6 tracking-[0.22em] uppercase mx-auto max-w-xl"
                style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(0,0,0,0.55)' }}
              >
                {t('Digital wardrobe · AI stylist', 'Digital wardrobe · AI styling assistant')}
              </motion.p>
            )}

            <motion.h1
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className={isLoggedIn ? 'mb-6' : 'mb-6 md:mb-8'}
              style={{
                fontSize: isLoggedIn ? 'clamp(48px, 10vw, 96px)' : 'clamp(40px, 9vw, 88px)',
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: '-0.03em',
                textTransform: 'uppercase'
              }}
            >
              EFFORTLESS DIGITAL
              <br />
              STYLING
            </motion.h1>

            <motion.p
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.8 }}
              className={`mx-auto text-pretty ${isLoggedIn ? 'mb-8 max-w-[600px]' : 'mb-10 md:mb-12 max-w-[34rem] px-1'}`}
              style={{
                fontSize: isLoggedIn ? '16px' : 'clamp(15px, 2.5vw, 18px)',
                lineHeight: isLoggedIn ? 1.6 : 1.65,
                fontWeight: 500,
                color: isLoggedIn ? undefined : 'rgba(0,0,0,0.78)',
              }}
            >
              {isLoggedIn ? (
                <>{t('Your wardrobe, reimagined. AI-powered outfit suggestions from what you already own.', 'AI-powered outfit suggestions based on your existing wardrobe.')}</>
              ) : (
                <>
                  {t(
                    'Stop staring at the closet. Clueless remembers what you own, respects the weather, and helps you build outfits in seconds—then chats with you like a stylist who actually knows your rail.',
                    'Clueless remembers what you own, accounts for the weather, and helps you build outfits quickly — then chats with you like a personal stylist.'
                  )}
                </>
              )}
            </motion.p>

            <div className={`flex items-center justify-center flex-wrap ${isLoggedIn ? 'gap-4' : 'gap-3 sm:gap-4'}`}>
              <motion.button
                type="button"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.8 }}
                whileHover={{ scale: 1.05, y: -2 }}
                className={`text-white transition-[transform,box-shadow,opacity] duration-200 ease-out rounded-full inline-flex items-center gap-3 ${
                  isLoggedIn ? 'px-10 py-4' : 'px-10 py-4 sm:px-12 sm:py-4'
                }`}
                style={{
                  background: '#000000',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  boxShadow: '0 10px 28px rgba(0, 0, 0, 0.22)'
                }}
                onClick={() => {
                  if (!isLoggedIn) {
                    handleSignUpCTA();
                    return;
                  }
                  setCurrentView('wardrobe');
                  document.getElementById('wardrobe-panel')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <span>{isLoggedIn ? 'VIEW MY WARDROBE' : 'START FREE'}</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </motion.button>

              {!isLoggedIn && (
                <motion.button
                  type="button"
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.75, duration: 0.8 }}
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() =>
                    document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className="px-8 py-4 sm:px-10 rounded-full inline-flex items-center gap-2 transition-opacity hover:opacity-85"
                  style={{
                    background: 'rgba(255, 255, 255, 0.75)',
                    border: '2px solid #000',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    boxShadow: '4px 4px 0 #000',
                  }}
                >
                  HOW IT WORKS
                </motion.button>
              )}

              {isLoggedIn && (
                <motion.button
                  initial={false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.8 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  onClick={() => setShowChat(true)}
                  className="px-10 py-4 text-black transition-[transform,box-shadow,opacity] duration-200 ease-out rounded-full inline-flex items-center gap-3"
                  style={{
                    background: 'linear-gradient(135deg, #FFE5C8 0%, #FFD4B8 100%)',
                    border: '3px solid #000',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)'
                  }}
                >
                  <Sparkles className="w-4 h-4" strokeWidth={2.5} />
                  <span>{t('ASK AI STYLIST', 'OPEN AI STYLIST')}</span>
                </motion.button>
              )}
            </div>
          </div>
          )}

          {/* Cards Grid — guests get three clear value props; signed-in keeps a lighter pair */}
          {!isLoggedIn && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="grid mx-auto md:grid-cols-3 gap-5 md:gap-6 max-w-[1100px]"
          >
              <>
                {[
                  {
                    kicker: '01',
                    title: t('Own less chaos', 'Organise your wardrobe'),
                    body: t(`Add pieces from search or upload. One closet, always sorted by category — no more "where did I put that?"`, 'Add items from search or upload. Everything sorted by category in one place.'),
                  },
                  {
                    kicker: '02',
                    title: t('Dress for the day', 'Dress for the occasion'),
                    body: t("When you're signed in, we fold in your location and forecast so suggestions feel sensible, not random.", 'When signed in, we factor in your location and forecast so suggestions are appropriate, not generic.'),
                  },
                  {
                    kicker: '03',
                    title: t('Chat with your rail', 'Chat with your stylist'),
                    body: t('The stylist reasons over what you actually own — mix, match, and save outfits without leaving the app.', 'The AI works from your actual wardrobe — mix, match, and save outfits without leaving the app.'),
                  },
                ].map((card, idx) => (
                  <motion.div
                    key={card.kicker}
                    whileHover={{ y: -4 }}
                    className="p-7 md:p-8 rounded-3xl text-left"
                    style={{
                      background: idx === 1 ? 'rgba(255, 255, 255, 0.82)' : '#FFE5C8',
                      border: '3px solid #000',
                      boxShadow: '8px 8px 0 #000',
                    }}
                  >
                    <span
                      className="inline-block mb-4 px-2.5 py-1 rounded-md"
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.12em',
                        background: '#000',
                        color: '#fff',
                      }}
                    >
                      {card.kicker}
                    </span>
                    <h3 className="mb-3" style={{ fontSize: 'clamp(18px, 2.2vw, 22px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
                      {card.title}
                    </h3>
                    <p style={{ fontSize: '14px', lineHeight: 1.65, fontWeight: 500, color: 'rgba(0,0,0,0.78)' }}>
                      {card.body}
                    </p>
                  </motion.div>
                ))}
              </>
          </motion.div>
          )}
        </div>
      </section>

      {/* AI Recommendations Section */}
      {!isLoggedIn && (
      <section
        id="how-it-works"
        className={`px-6 md:px-12 lg:px-20 scroll-mt-28 ${isLoggedIn ? 'py-24' : 'py-20 md:py-28'}`}
      >
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className={`text-center ${isLoggedIn ? 'mb-12' : 'mb-14 md:mb-16'}`}
          >
            <h2 className={`${isLoggedIn ? 'mb-4' : 'mb-5 md:mb-6'}`} style={{
              fontSize: 'clamp(32px, 6vw, 56px)',
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}>
              {isLoggedIn ? t('AI-POWERED OUTFIT RECOMMENDATIONS', 'AI-POWERED OUTFIT RECOMMENDATIONS') : t('OUTFITS THAT FIT YOUR REAL LIFE', 'OUTFITS BUILT FOR YOUR LIFESTYLE')}
            </h2>
            <p className={`max-w-[640px] mx-auto text-pretty ${isLoggedIn ? 'mb-8' : 'mb-2'}`} style={{ fontSize: '15px', lineHeight: 1.75, fontWeight: 500, color: isLoggedIn ? undefined : 'rgba(0,0,0,0.78)' }}>
              {isLoggedIn ? (
                <>{t("Just tell us what you're doing today. Our AI considers your location, weather, personal style, and occasion to suggest the perfect outfit.", "Describe your day and our AI will factor in your location, weather, and personal style to recommend the right outfit.")}</>
              ) : (
                <>{t('Sign in and the app learns your closet, the weather where you are, and how you like to dress—so recommendations feel specific, not generic.', 'Sign in and the app learns your wardrobe, your location, and your style preferences — so recommendations feel relevant, not random.')}</>
              )}
            </p>
          </motion.div>

          {/* AI Feature Cards */}
          <div className={`grid md:grid-cols-3 ${isLoggedIn ? 'gap-6 mb-16' : 'gap-5 md:gap-7 mb-12 md:mb-16'}`}>
            {[
              {
                icon: <MapPin className="w-6 h-6" strokeWidth={2.5} />,
                title: isLoggedIn ? 'LOCATION AWARE' : t('WHERE YOU ARE', 'LOCATION-BASED'),
                description: isLoggedIn
                  ? t('Weather-appropriate suggestions based on your current location and forecast', 'Weather-appropriate suggestions based on your current location and forecast')
                  : t("After sign-in, forecasts and plans stay in sync so you're not caught in the wrong layer.", 'After sign-in, your location and forecast inform every suggestion.'),
              },
              {
                icon: <Sparkles className="w-6 h-6" strokeWidth={2.5} />,
                title: isLoggedIn ? 'SMART STYLING' : t('YOUR PIECES, FIRST', 'YOUR WARDROBE FIRST'),
                description: isLoggedIn
                  ? t("AI learns your style from saved outfits and suggests looks you'll love", "AI learns your style from saved outfits and suggests outfits you'll enjoy")
                  : t("Suggestions pull from what you've added — no fantasy closet full of things you don't own.", "Suggestions are based on what you've added — nothing you don't own."),
              },
              {
                icon: <MessageCircle className="w-6 h-6" strokeWidth={2.5} />,
                title: isLoggedIn ? 'CONVERSATIONAL' : t('NATURAL CHAT', 'PLAIN LANGUAGE CHAT'),
                description: isLoggedIn
                  ? t('Chat naturally about your day and get instant outfit recommendations', 'Describe your day and receive instant outfit recommendations')
                  : t('Describe your day in plain language; the stylist answers with combinations you can actually wear.', 'Describe your plans in plain language; the AI responds with combinations from your wardrobe.'),
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
                whileHover={{ y: -4 }}
                className="p-6 rounded-2xl text-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%)',
                  border: '3px solid #000',
                  boxShadow: '6px 6px 0 #000'
                }}
              >
                <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff'
                }}>
                  {feature.icon}
                </div>
                <h3 className="mb-2" style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.05em' }}>
                  {feature.title}
                </h3>
                <p style={{ fontSize: '13px', lineHeight: 1.6, fontWeight: 500 }}>
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>

          {/* Example prompts + CTA — logged-in only */}
          {isLoggedIn && (
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="p-8 rounded-3xl text-center"
            style={{
              background: 'rgba(255, 255, 255, 0.7)',
              border: '3px solid #000',
              boxShadow: '8px 8px 0 #000'
            }}
          >
            <div className="inline-block px-4 py-2 rounded-full mb-6" style={{
              background: '#FFE5C8',
              border: '2px solid #000'
            }}>
              <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em' }}>
                {t('TRY ASKING', 'EXAMPLE PROMPTS')}
              </span>
            </div>

            <div className="max-w-[800px] mx-auto space-y-3">
              {[
                '"I have a work presentation then drinks after in Berlin"',
                '"Casual brunch with friends, it\'s raining outside"',
                '"Date night at a nice restaurant, want to look elegant"',
                '"Gym in the morning then running errands"'
              ].map((prompt, idx) => (
                <motion.div
                  key={idx}
                  initial={false}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className="p-4 rounded-2xl text-left"
                  style={{
                    background: '#FFE5F1',
                    border: '2px solid #000'
                  }}
                >
                  <p style={{ fontSize: '14px', fontWeight: 600, fontStyle: 'italic' }}>
                    {prompt}
                  </p>
                </motion.div>
              ))}
            </div>

            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowChat(true)}
              className="mt-8 px-10 py-4 text-white transition-[transform,box-shadow,opacity] duration-200 ease-out rounded-full inline-flex items-center gap-3"
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)'
              }}
            >
              <Sparkles className="w-5 h-5" strokeWidth={2.5} />
              <span>{t('TALK TO AI STYLIST', 'OPEN AI STYLIST')}</span>
            </motion.button>
          </motion.div>
          )}
        </div>
      </section>
      )}

      {/* Value Proposition */}
      <section className={`px-6 md:px-12 lg:px-20 ${isLoggedIn ? 'py-10' : 'py-20 md:py-28'}`}>
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className={`text-center ${isLoggedIn ? 'mb-16' : 'mb-12 md:mb-16'}`}
          >
            <h2 className={`${isLoggedIn ? 'mb-4' : 'mb-5'}`} style={{
              fontSize: 'clamp(32px, 6vw, 56px)',
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}>
              {isLoggedIn ? t('YOUR TRY-ON WORKSPACE', 'YOUR TRY-ON WORKSPACE') : t('BUILD YOUR DIGITAL WARDROBE', 'BUILD YOUR DIGITAL WARDROBE')}
            </h2>
            <p className="max-w-[640px] mx-auto text-pretty" style={{ fontSize: '15px', lineHeight: 1.75, fontWeight: 500, color: isLoggedIn ? undefined : 'rgba(0,0,0,0.78)' }}>
              {isLoggedIn ? (
                <>{t('Your wardrobe takes priority here: select items, preview instantly, and run try-ons without distractions.', 'Select items from your wardrobe, preview them instantly, and run try-ons without distractions.')}</>
              ) : (
                <>{t("One place for everything you wear. See it, combine it, save looks you love — then come back when you're rushing out the door.", 'One place for everything you wear. View it, combine it, save outfits you like — and revisit them anytime.')}</>
              )}
            </p>
          </motion.div>

          {/* Wardrobe Builder ↔ Saved Outfits — smooth crossfade between the two views. */}
          <AnimatePresence mode="wait" initial={false}>
          {currentView === 'wardrobe' && (
            <motion.div
              key="view-wardrobe"
              id="wardrobe-panel"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mb-16"
            >
              <div
                className={`grid gap-8 min-w-0 ${isLoggedIn ? 'xl:grid-cols-[minmax(0,1.75fr)_minmax(340px,0.95fr)] lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.9fr)]' : 'grid-cols-1'}`}
              >
                {/* Wardrobe Grid Section */}
                <div className="p-8 md:p-12 rounded-3xl min-w-0"
                  style={{
                    background: 'rgba(255, 255, 255, 0.7)',
                    border: '3px solid #000',
                    boxShadow: '12px 12px 0 #000'
                  }}
                >
                  {wardrobeItems.length === 0 ? (
                    isLoggedIn ? (
                      <EmptyState onAddItem={() => setShowUpload(true)} />
                    ) : (
                      <div className="text-center py-14 md:py-20 px-6 sm:px-10 max-w-lg mx-auto">
                        <p className="mb-2 tracking-[0.14em] uppercase" style={{ fontSize: '10px', fontWeight: 700, color: 'rgba(0,0,0,0.45)' }}>
                          {t('Members only', 'Sign in required')}
                        </p>
                        <h3 className="mb-4" style={{ fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
                          {t('Unlock your closet', 'Create a free account')}
                        </h3>
                        <p className="mb-8" style={{ fontSize: '15px', lineHeight: 1.65, fontWeight: 500, color: 'rgba(0,0,0,0.72)' }}>
                          {t('Create a free account to add pieces, run try-ons, save outfits, and chat with the stylist using your real wardrobe.', 'Create a free account to add items, run try-ons, save outfits, and get AI styling advice based on your actual wardrobe.')}
                        </p>
                        <button
                          type="button"
                          onClick={handleSignUpCTA}
                          className="px-10 py-3.5 rounded-full text-white transition-opacity hover:opacity-90"
                          style={{
                            background: '#000',
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            border: '2px solid #000',
                            boxShadow: '6px 6px 0 #000',
                          }}
                        >
                          CREATE FREE ACCOUNT
                        </button>
                      </div>
                    )
                  ) : (
                    <>
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                        <div
                          className="relative flex items-center gap-1 flex-wrap"
                          role="tablist"
                          aria-label="Wardrobe categories"
                        >
                          {(['tops', 'bottoms', 'accessories'] as WardrobeCategory[]).map((category) => {
                            const active = selectedCategory === category;
                            return (
                              <button
                                key={category}
                                role="tab"
                                aria-selected={active}
                                onClick={() => handleCategoryChange(category)}
                                className="relative px-3 py-2 rounded-sm transition-[color,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  letterSpacing: '0.12em',
                                  textTransform: 'uppercase',
                                  color: active ? '#000' : 'rgba(0,0,0,0.45)'
                                }}
                              >
                                {category}
                                <motion.span
                                  className="absolute left-3 right-3 -bottom-0.5 h-[2px] bg-black"
                                  initial={false}
                                  animate={{ scaleX: active ? 1 : 0, opacity: active ? 1 : 0 }}
                                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                  style={{ transformOrigin: 'left center' }}
                                />
                              </button>
                            );
                          })}
                        </div>

                        <div className="flex items-center gap-3">
                          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', opacity: 0.6 }}>
                            {getCategoryItems(selectedCategory).length} ITEMS
                          </span>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowUpload(true)}
                            className="px-4 py-2 rounded-full text-white flex items-center gap-2"
                            style={{
                              background: '#000',
                              fontSize: '11px',
                              fontWeight: 700,
                              letterSpacing: '0.05em'
                            }}
                          >
                            <Plus className="w-4 h-4" strokeWidth={2.5} />
                            <span className="hidden sm:inline">ADD ITEM</span>
                          </motion.button>
                        </div>
                      </div>

                      {/* Paginated Grid with Navigation — yeezy.com-inspired: borderless tiles,
                          image floats on the panel surface, code in monospace, image-only zoom on hover. */}
                      <div className="relative">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-7 md:gap-x-4 md:gap-y-9 mb-8 min-h-[420px]">
                  {getPaginatedItems(selectedCategory).items.map((item, idx) => {
                    const isSelected = selectedOutfit[item.category]?.code === item.code;
                    const titleText = item.title?.trim();
                    const isDeleting = deletingItemCode === item.code;
                    return (
                      <motion.div
                        key={item.code}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay: idx * 0.04 }}
                        className="group relative"
                      >
                        <button
                          type="button"
                          className="flex flex-col items-center text-center cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-4 w-full disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => handleItemClick(item)}
                          disabled={isDeleting}
                          aria-pressed={isSelected}
                          aria-label={`${titleText ?? item.type} — ${isSelected ? 'selected' : 'tap to add to outfit'}`}
                        >
                          <div
                            className={`tile-frame relative aspect-square w-full mb-3 flex items-center justify-center overflow-hidden transition-[background-color,opacity] duration-[var(--duration-base)] ease-[var(--ease-out)] ${item.imageUrl ? 'p-0' : 'p-4'}`}
                          >
                            {item.imageUrl ? (
                              <Image
                                src={item.imageUrl}
                                alt={titleText ?? item.type}
                                fill
                                className="object-contain transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] group-hover:scale-[1.06] group-active:scale-[1.02]"
                                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw"
                                unoptimized
                              />
                            ) : (
                              <div className="transition-transform duration-[var(--duration-slow)] ease-[var(--ease-out)] group-hover:scale-[1.06] group-active:scale-[1.02]">
                                <ClothingIcon type={item.type} />
                              </div>
                            )}

                            {/* Selected: subtle filled dot in the top-right (no heavy ring/border). */}
                            {isSelected && (
                              <span
                                className="absolute top-2 right-2 w-2 h-2 rounded-full bg-black"
                                aria-hidden
                              />
                            )}

                            {/* Hover quick-action: tiny "+" / "✓" badge that fades in under the cursor — yeezy-style. */}
                            <span
                              className={`pointer-events-none absolute bottom-2 right-2 inline-flex items-center justify-center w-6 h-6 rounded-full text-white opacity-0 translate-y-1 transition-[opacity,transform] duration-[var(--duration-base)] ease-[var(--ease-out)] group-hover:opacity-100 group-hover:translate-y-0 ${isSelected ? 'bg-black' : 'bg-black/85'}`}
                              aria-hidden
                            >
                              {isSelected ? (
                                <Check className="w-3.5 h-3.5" strokeWidth={3} />
                              ) : (
                                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                              )}
                            </span>
                          </div>

                          <div className="px-1 min-w-0 w-full">
                            {/* Monospace product code — always visible, yeezy signature. Underlines when selected. */}
                            <div
                              className={`font-mono leading-none tracking-[0.04em] transition-[color,text-decoration-color] duration-[var(--duration-base)] ${isSelected ? 'underline decoration-2 underline-offset-[6px]' : 'no-underline'}`}
                              style={{ fontSize: '11px', fontWeight: 700, color: '#000' }}
                            >
                              {item.code.toUpperCase()}
                            </div>
                            {titleText && (
                              <div
                                className="mt-1.5 line-clamp-1 text-black/55 group-hover:text-black/80 transition-colors duration-[var(--duration-base)]"
                                style={{ fontSize: '10px', fontWeight: 500, letterSpacing: '0.04em' }}
                              >
                                {titleText.length > 28 ? `${titleText.slice(0, 28)}…` : titleText}
                              </div>
                            )}
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => void handleDeleteWardrobeItem(item)}
                          disabled={isDeleting}
                          className="absolute top-1.5 left-1.5 inline-flex items-center justify-center w-7 h-7 rounded-full bg-white text-black border-2 border-black opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-red-100 transition-opacity duration-200 ease-out disabled:opacity-100 disabled:cursor-wait shadow-[2px_2px_0_#000]"
                          aria-label={`Remove ${titleText ?? item.type} from wardrobe`}
                          title="Remove from wardrobe"
                        >
                          {isDeleting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} aria-hidden />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
                          )}
                        </button>
                      </motion.div>
                    );
                  })}
                        </div>

                        {/* Pagination Controls */}
                        {getPaginatedItems(selectedCategory).totalPages > 1 && (
                          <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-between">
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                              disabled={!getPaginatedItems(selectedCategory).hasPrev}
                              className="px-6 py-3 rounded-full flex items-center gap-2 disabled:opacity-30 disabled:grayscale transition-opacity duration-200 ease-out order-1 sm:order-none"
                              style={{
                                background: '#FFE5C8',
                                border: '2px solid #000',
                                fontSize: '12px',
                                fontWeight: 700,
                                letterSpacing: '0.05em'
                              }}
                            >
                              <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                              PREV
                            </motion.button>

                            <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-full py-1 basis-full sm:basis-auto order-3 sm:order-none">
                              {Array.from({ length: getPaginatedItems(selectedCategory).totalPages }).map((_, idx) => {
                                const active = idx === currentPage;
                                return (
                                  <button
                                    key={idx}
                                    onClick={() => setCurrentPage(idx)}
                                    className="h-[3px] rounded-full transition-[width,background-color,opacity] duration-[var(--duration-slow)] ease-[var(--ease-out)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-black focus-visible:outline-offset-2"
                                    style={{
                                      width: active ? '22px' : '10px',
                                      background: active ? '#000' : 'rgba(0, 0, 0, 0.25)'
                                    }}
                                    aria-label={`Page ${idx + 1}`}
                                    aria-current={active ? 'page' : undefined}
                                    type="button"
                                  />
                                );
                              })}
                            </div>

                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setCurrentPage(p => p + 1)}
                              disabled={!getPaginatedItems(selectedCategory).hasNext}
                              className="px-6 py-3 rounded-full flex items-center gap-2 disabled:opacity-30 disabled:grayscale transition-opacity duration-200 ease-out order-2 sm:order-none"
                              style={{
                                background: '#FFE5C8',
                                border: '2px solid #000',
                                fontSize: '12px',
                                fontWeight: 700,
                                letterSpacing: '0.05em'
                              }}
                            >
                              NEXT
                              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                            </motion.button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

              {/* Model preview / try-on — logged-in only */}
              {isLoggedIn && (
              <div className="lg:sticky lg:top-24 lg:self-start min-w-0 w-full">
                <motion.div
                  initial={false}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  className="p-6 rounded-3xl"
                  style={{
                    background: 'rgba(255, 255, 255, 0.7)',
                    border: '3px solid #000',
                    boxShadow: '12px 12px 0 #000'
                  }}
                >
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 min-w-0">
                    <div className="inline-block px-4 py-2 rounded-full shrink-0" style={{
                      background: '#FFE5C8',
                      border: '2px solid #000'
                    }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em' }}>
                        LIVE PREVIEW · {VTO_STAGE_LABELS[vtoStage]}
                      </span>
                    </div>
                    {userSelfie && (
                      <button
                        onClick={() => setShowSelfieUpload(true)}
                        className="p-2 rounded-full hover:opacity-60 active:opacity-50 transition-opacity duration-200 ease-out"
                        style={{
                          background: 'rgba(0, 0, 0, 0.05)'
                        }}
                        title="Change photo"
                        type="button"
                      >
                        <Camera className="w-4 h-4" strokeWidth={2} />
                      </button>
                    )}
                  </div>

                  <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-gradient-to-b from-gray-200 to-gray-300 mb-4">
                    {!userSelfie ? (
                      /* Prompt to upload selfie */
                      <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="text-center px-6">
                          <Camera className="w-16 h-16 mx-auto mb-4 opacity-30" strokeWidth={1.5} />
                          <p className="mb-4" style={{ fontSize: '14px', fontWeight: 600 }}>
                            Upload your photo to see how clothes look on you
                          </p>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            onClick={() => setShowSelfieUpload(true)}
                            className="px-6 py-3 rounded-full text-white"
                            style={{
                              background: '#000',
                              fontSize: '12px',
                              fontWeight: 700,
                              letterSpacing: '0.05em'
                            }}
                          >
                            UPLOAD PHOTO
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                      /* Show user's selfie */
                      <Image
                        src={tryOnImageUrl || userSelfie}
                        alt="Your photo"
                        fill
                        unoptimized
                        className="w-full h-full object-cover object-center"
                      />
                    )}

                    {isGeneratingTryOn && (
                      <div className="absolute inset-x-3 bottom-3 z-30 rounded-xl border-2 border-black bg-white/90 p-3 backdrop-blur-sm">
                        <div className="mb-2 flex items-center justify-end">
                          <span style={{ fontSize: '10px', fontWeight: 700 }}>
                            {Math.round(vtoProgress)}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-black/15">
                          <div
                            className="h-2 rounded-full bg-black transition-all duration-500"
                            style={{ width: `${Math.max(8, Math.min(100, vtoProgress))}%` }}
                          />
                        </div>
                        <div
                          className="mt-2 text-center"
                          style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em', opacity: 0.75 }}
                        >
                          {vtoStatusMessage}
                        </div>
                      </div>
                    )}

                    {/* Multiple Clothing Sticker Overlays */}
                    {!tryOnImageUrl && selectedOutfit.bottoms && (
                      <motion.div
                        key={selectedOutfit.bottoms.code}
                        initial={false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="absolute inset-0 pointer-events-none"
                      >
                        <ClothingSticker
                          type={selectedOutfit.bottoms.type}
                          code={selectedOutfit.bottoms.code}
                          imageUrl={selectedOutfit.bottoms.imageUrl}
                        />
                      </motion.div>
                    )}

                    {!tryOnImageUrl && selectedOutfit.tops && (
                      <motion.div
                        key={selectedOutfit.tops.code}
                        initial={false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="absolute inset-0 pointer-events-none"
                      >
                        <ClothingSticker
                          type={selectedOutfit.tops.type}
                          code={selectedOutfit.tops.code}
                          imageUrl={selectedOutfit.tops.imageUrl}
                        />
                      </motion.div>
                    )}

                    {!tryOnImageUrl && selectedOutfit.accessories && (
                      <motion.div
                        key={selectedOutfit.accessories.code}
                        initial={false}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                        className="absolute inset-0 pointer-events-none"
                      >
                        <ClothingSticker
                          type={selectedOutfit.accessories.type}
                          code={selectedOutfit.accessories.code}
                          imageUrl={selectedOutfit.accessories.imageUrl}
                        />
                      </motion.div>
                    )}

                    {/* Empty state */}
                    {userSelfie && !tryOnImageUrl && !selectedOutfit.tops && !selectedOutfit.bottoms && !selectedOutfit.accessories && (
                      <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="text-center px-8">
                          <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" strokeWidth={1.5} />
                          <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.6 }}>
                            Click items to preview
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {vtoError && (
                    <div
                      className="mb-4 rounded-xl border-2 border-black p-3"
                      style={{ background: '#FDE8E8' }}
                      role="alert"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={2.5} />
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>Try-on failed</span>
                      </div>
                      <p style={{ fontSize: '12px', fontWeight: 500 }}>{vtoError.message}</p>
                      <p style={{ fontSize: '11px', fontWeight: 500, opacity: 0.75 }}>
                        {inferTryOnErrorHint(vtoError.code)}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <motion.button
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleTryOn}
                      disabled={isGeneratingTryOn || !userSelfie || activeTryOnGarments.length === 0}
                      className="w-full py-3 px-4 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: '#000',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.1em'
                      }}
                    >
                      {isGeneratingTryOn
                        ? `${Math.round(vtoProgress)}%`
                        : t('COOK A TRY-ON', 'RUN TRY-ON')}
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleTryOn}
                      disabled={isGeneratingTryOn || !userSelfie || activeTryOnGarments.length === 0}
                      className="w-full py-3 px-4 rounded-full disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{
                        background: '#FFF',
                        border: '2px solid #000',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em'
                      }}
                    >
                      <RotateCcw className="w-4 h-4" strokeWidth={2.5} />
                      {t('ONE MORE FOR SCIENCE', 'TRY AGAIN')}
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleSaveOutfit}
                      disabled={
                        !selectedOutfit.tops &&
                        !selectedOutfit.bottoms &&
                        !selectedOutfit.accessories
                      }
                      className="w-full py-3 px-4 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        boxShadow: '0 4px 12px rgba(102, 126, 234, 0.3)'
                      }}
                    >
                      <Heart className="w-4 h-4" strokeWidth={2.5} />
                      {t('LOCK THIS LOOK', 'SAVE OUTFIT')}
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowSelfieUpload(true)}
                      className="w-full py-3 px-4 rounded-full flex items-center justify-center gap-2"
                      style={{
                        background: '#FFF',
                        border: '2px solid #000',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.08em'
                      }}
                      type="button"
                    >
                      <Camera className="w-4 h-4" strokeWidth={2.5} />
                      {t('NEW FACE CARD', 'CHANGE PHOTO')}
                    </motion.button>

                    {tryOnImageUrl && (
                      <a
                        href={tryOnImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-3 px-4 rounded-full flex items-center justify-center gap-2"
                        style={{
                          background: '#FFF',
                          border: '2px solid #000',
                          fontSize: '11px',
                          fontWeight: 700,
                          letterSpacing: '0.08em'
                        }}
                      >
                        <Download className="w-4 h-4" strokeWidth={2.5} />
                        {t('EXPORT RECEIPTS', 'SAVE IMAGE')}
                      </a>
                    )}

                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedOutfit({})}
                      className="w-full py-3 px-4 rounded-full"
                      style={{
                        background: '#FFE5C8',
                        border: '2px solid #000',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.1em'
                      }}
                    >
                      {t('RESET THE CHAOS', 'CLEAR SELECTION')}
                    </motion.button>
                  </div>

                  {tryOnHistory.length > 0 && (
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between">
                        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em' }}>
                          {t('RECENT LOOKS', 'RECENT TRY-ONS')}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.65 }}>
                          {tryOnHistory.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {tryOnHistory.slice(0, visibleTryOnCount).map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() => {
                              setTryOnImageUrl(entry.imageUrl);
                              setTryOnPreviewUrl(entry.imageUrl);
                            }}
                            className="relative aspect-[3/4] overflow-hidden rounded-lg border-2 border-black hover:opacity-90 active:opacity-80"
                            title={`Open try-on ${new Date(entry.createdAt).toLocaleString()}`}
                          >
                            <Image src={entry.imageUrl} alt="Past try-on result" fill unoptimized className="object-cover" />
                          </button>
                        ))}
                      </div>
                      {tryOnHistory.length > TRYON_HISTORY_PAGE_SIZE && (
                        <div className="mt-3 flex justify-center">
                          {visibleTryOnCount < tryOnHistory.length ? (
                            <button
                              type="button"
                              onClick={() =>
                                setVisibleTryOnCount((prev) =>
                                  Math.min(prev + TRYON_HISTORY_PAGE_SIZE, tryOnHistory.length)
                                )
                              }
                              className="px-4 py-2 rounded-full"
                              style={{
                                background: '#FFF',
                                border: '2px solid #000',
                                fontSize: '10px',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                              }}
                            >
                              {t('MORE DRIP', 'LOAD MORE')}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setVisibleTryOnCount(TRYON_HISTORY_PAGE_SIZE)}
                              className="px-4 py-2 rounded-full"
                              style={{
                                background: '#FFF',
                                border: '2px solid #000',
                                fontSize: '10px',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                              }}
                            >
                              {t('LESS DRIP', 'SHOW LESS')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </div>
              )}
            </div>
          </motion.div>
          )}

          {/* Saved Outfits View */}
          {currentView === 'outfits' && (
            <motion.div
              key="view-outfits"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="mb-16"
            >
              <div className="max-w-[1200px] mx-auto p-8 md:p-12 rounded-3xl" style={{
                background: 'rgba(255, 255, 255, 0.7)',
                border: '3px solid #000',
                boxShadow: '12px 12px 0 #000'
              }}>
                <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="mb-2" style={{
                      fontSize: 'clamp(32px, 5vw, 48px)',
                      fontWeight: 900,
                      letterSpacing: '-0.02em'
                    }}>
                      {t('SAVED LOOKS', 'SAVED OUTFITS')}
                    </h2>
                    <p style={{ fontSize: '15px', fontWeight: 500, opacity: 0.7 }}>
                      {savedOutfits.length} saved {savedOutfits.length === 1 ? 'outfit' : 'outfits'}
                      {SUPABASE_ON && (
                        <span className="block sm:inline sm:before:content-['\00a0\2014\00a0'] sm:before:font-normal mt-1 sm:mt-0 text-[13px]">
                          {t('Safely stashed in your account', 'Stored in your account')}
                        </span>
                      )}
                    </p>
                  </div>
                  {SUPABASE_ON && isLoggedIn && (
                    <button
                      type="button"
                      onClick={() => void refreshSavedOutfits()}
                      disabled={savedOutfitsLoading}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 border-black bg-white hover:opacity-85 active:opacity-70 disabled:opacity-50 transition-opacity shrink-0 self-start"
                      style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em' }}
                      aria-busy={savedOutfitsLoading}
                      aria-label="Refresh saved outfits from server"
                    >
                      {savedOutfitsLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.5} aria-hidden />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" strokeWidth={2.5} aria-hidden />
                      )}
                      REFRESH
                    </button>
                  )}
                </div>

                {savedOutfits.length === 0 ? (
                  <div className="text-center py-20">
                    <Heart className="w-16 h-16 mx-auto mb-4 opacity-20" strokeWidth={1.5} />
                    <h3 className="mb-3" style={{ fontSize: '24px', fontWeight: 700 }}>
                      {t('Your saved looks are empty', 'No saved outfits yet')}
                    </h3>
                    <p className="mb-6" style={{ fontSize: '14px', opacity: 0.7 }}>
                      {t('Build one great fit, hit save, and start your hall-of-fame.', 'Build an outfit, save it, and come back to it anytime.')}
                    </p>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      onClick={() => setCurrentView('wardrobe')}
                      className="px-8 py-3 rounded-full text-white"
                      style={{
                        background: '#000',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.05em'
                      }}
                    >
                      GO TO WARDROBE
                    </motion.button>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {savedOutfits.map((outfit) => {
                      const tryOnUrl = findTryOnImageForOutfit(outfit, tryOnHistory);
                      return (
                      <motion.div
                        key={outfit.id}
                        initial={false}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ y: -4 }}
                        className="p-6 rounded-2xl"
                        style={{
                          background: '#fff',
                          border: '3px solid #000',
                          boxShadow: '6px 6px 0 #000'
                        }}
                      >
                        <div
                          className="aspect-square bg-gradient-to-b from-gray-100 to-gray-200 rounded-xl mb-4 relative overflow-hidden"
                          style={{ cursor: tryOnUrl ? 'pointer' : 'default' }}
                          onClick={() => tryOnUrl && setLightboxImageUrl(tryOnUrl)}
                          role={tryOnUrl ? 'button' : undefined}
                          aria-label={tryOnUrl ? 'View try-on image' : undefined}
                        >
                          <Image
                            src={userSelfie || baseModelImg}
                            alt="Model"
                            fill
                            unoptimized
                            className="w-full h-full object-cover object-center"
                          />
                          {outfit.bottoms && (
                            <div className="absolute inset-0">
                              <ClothingSticker
                                type={outfit.bottoms.type}
                                code={outfit.bottoms.code}
                                imageUrl={outfit.bottoms.imageUrl}
                              />
                            </div>
                          )}
                          {outfit.tops && (
                            <div className="absolute inset-0">
                              <ClothingSticker
                                type={outfit.tops.type}
                                code={outfit.tops.code}
                                imageUrl={outfit.tops.imageUrl}
                              />
                            </div>
                          )}
                          {outfit.accessories && (
                            <div className="absolute inset-0">
                              <ClothingSticker
                                type={outfit.accessories.type}
                                code={outfit.accessories.code}
                                imageUrl={outfit.accessories.imageUrl}
                              />
                            </div>
                          )}
                          {tryOnUrl && (
                            <div
                              className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full"
                              style={{ background: '#000', color: '#fff', fontSize: '9px', fontWeight: 800, letterSpacing: '0.06em', pointerEvents: 'none' }}
                            >
                              <Sparkles className="w-2.5 h-2.5" strokeWidth={2.5} />
                              TRY-ON
                            </div>
                          )}
                        </div>

                        <div className="space-y-2 min-w-0">
                          {outfit.tops && (
                            <div className="text-xs font-semibold break-words">
                              Top: {wardrobeItemLabel(outfit.tops)}
                            </div>
                          )}
                          {outfit.bottoms && (
                            <div className="text-xs font-semibold break-words">
                              Bottom: {wardrobeItemLabel(outfit.bottoms)}
                            </div>
                          )}
                          {outfit.accessories && (
                            <div className="text-xs font-semibold break-words">
                              Accessory: {wardrobeItemLabel(outfit.accessories)}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t-2 border-black/10 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                          <span className="break-words" style={{ fontSize: '10px', opacity: 0.6, fontWeight: 600 }}>
                            Saved {new Date(outfit.savedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                          </span>
                          <div className="flex flex-wrap gap-2 justify-end sm:justify-end">
                            <motion.button
                              type="button"
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => handleApplySavedOutfit(outfit)}
                              className="px-4 py-2 rounded-full text-white"
                              style={{
                                background: '#000',
                                fontSize: '10px',
                                fontWeight: 800,
                                letterSpacing: '0.08em',
                              }}
                              aria-label={`Apply saved outfit to wardrobe builder: ${wardrobeItemLabel(outfit.tops) || 'outfit'}`}
                            >
                              USE IN BUILDER
                            </motion.button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteSavedOutfit(outfit)}
                              disabled={deletingOutfitId === outfit.id}
                              className="px-3 py-2 rounded-full border-2 border-black/30 text-xs font-bold hover:opacity-60 active:opacity-50 transition-opacity duration-200 ease-out disabled:opacity-40"
                              aria-label={`Delete saved outfit: ${wardrobeItemLabel(outfit.tops) || 'outfit'}`}
                            >
                              {deletingOutfitId === outfit.id ? '…' : 'DELETE'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );})}
                  </div>
                )}
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Sparkles className="w-6 h-6" strokeWidth={2.5} />,
                title: 'WARDROBE',
                description: 'Upload and catalog every piece with smart tagging'
              },
              {
                icon: <Calendar className="w-6 h-6" strokeWidth={2.5} />,
                title: 'MATCHES',
                description: 'AI generates outfits based on weather and events'
              },
              {
                icon: <TrendingUp className="w-6 h-6" strokeWidth={2.5} />,
                title: 'RECOMMEND',
                description: 'Smart suggestions for missing pieces in your style'
              }
            ].map((feature, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-12%' }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: idx * 0.08 }}
                whileHover={{ y: -4 }}
                className="p-6 rounded-2xl"
                style={{
                  background: '#FFE5C8',
                  border: '3px solid #000',
                  boxShadow: '6px 6px 0 #000'
                }}
              >
                <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <h3 className="mb-2" style={{ fontSize: '18px', fontWeight: 900, letterSpacing: '0.05em' }}>
                  {feature.title}
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Demo Section */}
      {!isLoggedIn && (
      <section className={`px-6 md:px-12 lg:px-20 ${isLoggedIn ? 'py-24' : 'py-20 md:py-28'}`}>
        <div className="max-w-[1400px] mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left Column */}
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-12%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="space-y-6"
            >
              <div className="p-8 rounded-3xl" style={{
                background: '#FFE5C8',
                border: '3px solid #000',
                boxShadow: '8px 8px 0 #000'
              }}>
                <h3 className="mb-4" style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                  VIRTUAL TRY-ON
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
                  Visualize outfits before you put them on. See how pieces work together instantly.
                </p>
              </div>

              <div className="p-8 rounded-3xl aspect-square relative overflow-hidden" style={{
                background: 'rgba(255, 255, 255, 0.7)',
                border: '3px solid #000',
                boxShadow: '8px 8px 0 #000'
              }}>
                <Image
                  src="https://images.unsplash.com/photo-1567113463300-102a7eb3cb26?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwd2FyZHJvYmUlMjBjbG9zZXQlMjBmYXNoaW9ufGVufDF8fHx8MTc3NjA3OTMyN3ww&ixlib=rb-4.1.0&q=80&w=1080"
                  alt="Wardrobe visualization"
                  fill
                  unoptimized
                  className="w-full h-full object-cover rounded-2xl"
                />
              </div>
            </motion.div>

            {/* Right Column */}
            <motion.div
              initial={{ opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-12%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
              className="space-y-6"
            >
              <div className="p-8 rounded-3xl" style={{
                background: '#FFE5C8',
                border: '3px solid #000',
                boxShadow: '8px 8px 0 #000'
              }}>
                <h3 className="mb-4" style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                  OUT THE DOOR FASTER
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.65, fontWeight: 500 }}>
                  Fewer tabs, fewer maybes. Lock in a look, save it, and move on with your morning.
                </p>
              </div>

              <div className="p-8 rounded-3xl" style={{
                background: '#FFE5C8',
                border: '3px solid #000',
                boxShadow: '8px 8px 0 #000'
              }}>
                <h3 className="mb-4" style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                  YOUR CLOSET, ORGANIZED
                </h3>
                <p className="mb-4" style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
                  Add what you own, preview outfits on your photo, save looks you love, and chat with the stylist using your real wardrobe—no more guessing in the morning.
                </p>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    if (isLoggedIn) {
                      document.getElementById('wardrobe-panel')?.scrollIntoView({ behavior: 'smooth' });
                    } else {
                      handleSignUpCTA();
                    }
                  }}
                  className="w-full py-3 px-6 rounded-full text-white"
                  style={{
                    background: '#000',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.1em'
                  }}
                >
                  {isLoggedIn ? 'OPEN WARDROBE' : 'GET STARTED'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
      )}

      {/* Personalized Section (for logged in users) */}
      {isLoggedIn && (
        <section className="px-6 md:px-12 lg:px-20 py-24">
          <div className="max-w-[1400px] mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-12%' }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="p-10 md:p-16 rounded-3xl text-center"
              style={{
                background: 'rgba(255, 255, 255, 0.7)',
                border: '3px solid #000',
                boxShadow: '12px 12px 0 #000'
              }}
            >
              <span className="inline-block px-4 py-2 rounded-full mb-6" style={{
                background: '#FFE5C8',
                border: '2px solid #000',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.1em'
              }}>
                YOUR STATS
              </span>

              <h2 className="mb-4" style={{
                fontSize: 'clamp(48px, 8vw, 80px)',
                fontWeight: 900,
                lineHeight: 0.95,
                letterSpacing: '-0.02em'
              }}>
                {wardrobeItems.length} ITEM{wardrobeItems.length === 1 ? '' : 'S'}
              </h2>
              <p className="mb-12" style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700 }}>
                {savedOutfits.length} SAVED OUTFIT{savedOutfits.length === 1 ? '' : 'S'}
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: 'TOPS', count: wardrobeItems.filter((i) => i.category === 'tops').length },
                  { label: 'BOTTOMS', count: wardrobeItems.filter((i) => i.category === 'bottoms').length },
                  { label: 'ACCESSORIES', count: wardrobeItems.filter((i) => i.category === 'accessories').length },
                  { label: 'SAVED LOOKS', count: savedOutfits.length },
                ].map((stat, idx) => (
                  <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, scale: 0.92 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true, margin: '-10%' }}
                    transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1], delay: idx * 0.06 }}
                    className="p-6 rounded-2xl"
                    style={{
                      background: '#FFE5C8',
                      border: '3px solid #000',
                      boxShadow: '4px 4px 0 #000'
                    }}
                  >
                    <div style={{ fontSize: '40px', fontWeight: 900, lineHeight: 1 }} className="mb-2">
                      {stat.count}
                    </div>
                    <div className="tracking-[0.05em]" style={{ fontSize: '12px', fontWeight: 700 }}>
                      {stat.label}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
      )}

      {/* Testimonial */}
      {!isLoggedIn && (
      <section className={`px-6 md:px-12 lg:px-20 ${isLoggedIn ? 'py-24' : 'py-20 md:py-28'}`}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={`max-w-[1000px] mx-auto text-center rounded-3xl ${isLoggedIn ? 'p-12 md:p-16' : 'p-10 md:p-14'}`}
          style={{
            background: '#000',
            color: '#fff',
            border: '3px solid #000',
            boxShadow: '12px 12px 0 rgba(0, 0, 0, 0.3)'
          }}
        >
          <h2 className="mb-6 break-words hyphens-auto px-1 text-balance" style={{
            fontSize: isLoggedIn ? 'clamp(36px, 6vw, 64px)' : 'clamp(28px, 5vw, 48px)',
            fontWeight: 900,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase'
          }}>
            {isLoggedIn ? (
              <>
                CLUELESS TRANSFORMED MY WARDROBE MANAGEMENT EXPERIENCE.
                <br />
                THE AI SUGGESTIONS ARE SPOT ON!
              </>
            ) : (
              <>
                FINALLY AN APP THAT REMEMBERS WHAT I OWN.
                <br />
                <span className="text-white/85" style={{ fontSize: '0.72em', fontWeight: 800 }}>
                  The chat actually uses my closet—not a random moodboard.
                </span>
              </>
            )}
          </h2>
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-300 to-pink-500 border-2 border-white shrink-0" />
            <div className="text-left min-w-0">
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Jordan M.</div>
              <div style={{ fontSize: '12px', fontWeight: 500, opacity: 0.7 }}>Early user, product design</div>
            </div>
          </div>
        </motion.div>
      </section>
      )}

      {/* Final CTA */}
      {!isLoggedIn && (
      <section className={`px-6 md:px-12 lg:px-20 ${isLoggedIn ? 'py-32' : 'py-24 md:py-36'}`}>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-12%' }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[900px] mx-auto text-center"
        >
          <h2 className={`text-balance ${isLoggedIn ? 'mb-8' : 'mb-6 md:mb-8'}`} style={{
            fontSize: 'clamp(48px, 8vw, 96px)',
            fontWeight: 900,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            textTransform: 'uppercase'
          }}>
            NEVER BE
            <br />
            CLUELESS AGAIN
          </h2>
          <p className={`max-w-[32rem] mx-auto text-pretty ${isLoggedIn ? 'mb-12' : 'mb-6 md:mb-8'}`} style={{ fontSize: '16px', lineHeight: 1.75, fontWeight: 500, color: isLoggedIn ? undefined : 'rgba(0,0,0,0.76)' }}>
            {isLoggedIn ? (
              <>Join thousands making the most of what they already own. Start building your digital wardrobe today.</>
            ) : (
              <>Wear what you already own—with a stylist in your pocket. Free to start; your closet stays private to your account.</>
            )}
          </p>
          {!isLoggedIn && (
            <p className="max-w-[36rem] mx-auto text-pretty mb-10 md:mb-12 px-2" style={{ fontSize: '12px', lineHeight: 1.6, fontWeight: 600, color: 'rgba(0,0,0,0.5)' }}>
              Accounts and core wardrobe features are free. Optional AI try-on uses paid cloud GPU when you run it—see your provider's billing (e.g. Replicate).
            </p>
          )}
          <motion.button
            type="button"
            whileHover={{ scale: 1.05, y: -4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() =>
              isLoggedIn
                ? document.getElementById('wardrobe-panel')?.scrollIntoView({ behavior: 'smooth' })
                : handleSignUpCTA()
            }
            className="px-12 py-5 text-white transition-[transform,box-shadow,opacity] duration-200 ease-out rounded-full inline-flex items-center gap-3"
            style={{
              background: '#000',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.3)'
            }}
          >
            <span>{isLoggedIn ? 'MY WARDROBE' : 'CREATE FREE ACCOUNT'}</span>
            <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
          </motion.button>
        </motion.div>
      </section>
      )}

      {/* Floating Action Buttons */}
      {isLoggedIn && !showChat && currentView === 'wardrobe' && (
        <>
          <motion.button
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.9, type: 'spring', damping: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowChat(true)}
            className="fixed bottom-8 right-8 z-[60] w-16 h-16 rounded-full flex items-center justify-center shadow-[0_10px_40px_rgba(0,0,0,0.2)] transition-shadow duration-200 ease-out"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff',
              border: '3px solid #000'
            }}
            type="button"
            aria-label="Open AI stylist chat"
          >
            <MessageCircle className="w-7 h-7" strokeWidth={2.5} />
          </motion.button>

          <motion.button
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1.1, type: 'spring', damping: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setShowUpload(true)}
            className="fixed bottom-28 right-8 z-[60] w-14 h-14 rounded-full flex items-center justify-center shadow-[0_10px_40px_rgba(0,0,0,0.2)] transition-shadow duration-200 ease-out"
            style={{
              background: '#000',
              color: '#fff',
              border: '3px solid #000'
            }}
            type="button"
            aria-label="Add wardrobe item"
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} />
          </motion.button>
        </>
      )}

      {SUPABASE_ON && (
        <AuthDialog
          open={showAuthDialog}
          onOpenChange={setShowAuthDialog}
          initialMode={authInitialMode}
          onSignedIn={handleAuthDialogSignedIn}
        />
      )}

      {SUPABASE_ON && (
        <ResetPasswordDialog
          open={showPasswordRecovery}
          onOpenChange={setShowPasswordRecovery}
          onPasswordUpdated={() => {
            showToast('Password updated. You are signed in.');
            router.refresh();
          }}
        />
      )}

      {/* Onboarding Flow */}
      <AnimatePresence>
        {false && null /* onboarding removed */}
      </AnimatePresence>

      {/* Upload Flow */}
      <AnimatePresence>
        {showUpload && (
          <UploadFlow
            onClose={() => setShowUpload(false)}
            onUpload={handleAddItem}
          />
        )}
      </AnimatePresence>

      {/* Selfie Upload */}
      <AnimatePresence>
        {showSelfieUpload && (
          <SelfieUpload
            onClose={() => setShowSelfieUpload(false)}
            onUpload={handleSelfieUpload}
          />
        )}
      </AnimatePresence>

      {/* Chat Interface */}
      <AnimatePresence>
        {showChat && (
          <ChatInterface
            onClose={() => setShowChat(false)}
            location={location}
            weather={weather}
            wardrobeItems={wardrobeItems}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tryOnPreviewUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-[90] bg-black/70 p-4 md:p-8"
            onClick={() => setTryOnPreviewUrl(null)}
          >
            <div className="mx-auto flex h-full w-full max-w-[980px] items-center justify-center">
              <motion.div
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.98, opacity: 0 }}
                transition={{ duration: 0.16 }}
                className="relative h-full max-h-[92vh] w-full overflow-hidden rounded-2xl border-[3px] border-black bg-white shadow-[10px_10px_0_#000]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setTryOnPreviewUrl(null)}
                  className="absolute right-3 top-3 z-10 h-9 w-9 rounded-full border-2 border-black bg-white text-xl font-bold leading-none hover:opacity-80"
                  aria-label="Close try-on preview"
                >
                  ×
                </button>
                <div className="relative h-full w-full">
                  <Image
                    src={tryOnPreviewUrl}
                    alt="Try-on preview"
                    fill
                    unoptimized
                    className="object-contain"
                  />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plans Section — logged-in users only */}
      {isLoggedIn && (
        <section className="px-6 md:px-12 lg:px-20 py-20 border-t-4 border-black">
          <div className="max-w-[1400px] mx-auto">
            <div className="text-center mb-14">
              <h2 className="mb-3" style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
                {t('Pick Your Vibe', 'Choose Your Plan')}
              </h2>
              <p style={{ fontSize: '15px', fontWeight: 500, opacity: 0.6 }}>
                {t('Glow up for free or go full main character — no hidden fees, ever.', 'Start for free, upgrade when you need more. No hidden fees.')}
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              {/* Free Plan */}
              <div className="rounded-2xl border-4 border-black bg-white p-8 flex flex-col" style={{ boxShadow: '6px 6px 0 #000' }}>
                <div className="mb-6">
                  <p className="uppercase mb-2" style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', opacity: 0.4 }}>{t('On the House', 'Free Tier')}</p>
                  <h3 style={{ fontSize: '28px', fontWeight: 900 }}>Free</h3>
                  <p className="mt-1" style={{ fontSize: '13px', fontWeight: 500, opacity: 0.55 }}>{t('For curious babes just getting started', 'For personal use and exploration')}</p>
                </div>
                <div className="mb-8">
                  <span style={{ fontSize: '48px', fontWeight: 900 }}>{'€'}0</span>
                  <span className="ml-1" style={{ fontSize: '14px', fontWeight: 600, opacity: 0.5 }}>/month</span>
                </div>
                <ul className="space-y-3 mb-10 flex-1">
                  {[
                    t('20 looks total, on us', '20 try-ons included'),
                    t('4 looks a day — make them count', '4 try-ons per day'),
                    t('Full wardrobe builder', 'Full wardrobe builder'),
                    t('Basic style suggestions', 'Basic style suggestions'),
                    t('Community support', 'Community support'),
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full border-2 border-black bg-white flex items-center justify-center shrink-0" style={{ fontSize: '11px', fontWeight: 900 }}>✓</span>
                      <span style={{ fontSize: '14px', fontWeight: 500 }}>{feat}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled
                  className="w-full py-4 rounded-xl border-2 border-black font-bold cursor-default"
                  style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.05em', background: 'rgba(0,0,0,0.06)' }}
                >
                  CURRENT PLAN
                </button>
              </div>

              {/* Pro Plan */}
              <div className="rounded-2xl border-4 border-black p-8 flex flex-col relative overflow-hidden" style={{ background: '#000', color: '#fff', boxShadow: '6px 6px 0 #FF69B4' }}>
                <div className="absolute top-5 right-5 flex flex-col items-end gap-2">
                  <span className="px-3 py-1 rounded-full border-2 border-white" style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.08em' }}>
                    {t('🔥 MOST SLAY', 'MOST POPULAR')}
                  </span>
                  <span className="px-3 py-1 rounded-full" style={{ fontSize: '10px', fontWeight: 900, letterSpacing: '0.08em', background: '#FF69B4', color: '#000' }}>
                    {t('50% OFF RN', '50% OFF')}
                  </span>
                </div>
                <div className="mb-6">
                  <p className="uppercase mb-2" style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '0.08em', opacity: 0.45 }}>{t('Go Off, Queen', 'Premium')}</p>
                  <h3 style={{ fontSize: '28px', fontWeight: 900 }}>Pro</h3>
                  <p className="mt-1" style={{ fontSize: '13px', fontWeight: 500, opacity: 0.55 }}>{t('For the ones that never run out of drip', 'For power users and style enthusiasts')}</p>
                </div>
                <div className="mb-8">
                  <div className="flex items-baseline gap-3">
                    <span style={{ fontSize: '48px', fontWeight: 900 }}>{'€'}3</span>
                    <span style={{ fontSize: '14px', fontWeight: 600, opacity: 0.5 }}>/month</span>
                  </div>
                  <p style={{ fontSize: '13px', fontWeight: 600, opacity: 0.55, marginTop: '4px' }}>
                    <span style={{ textDecoration: 'line-through' }}>{'€'}6</span>
                    {' '}{t('for a limited time only', 'limited time offer')}
                  </p>
                </div>
                <ul className="space-y-3 mb-10 flex-1">
                  {[
                    t('Unlimited looks, no cap', 'Unlimited try-ons'),
                    t('Unlimited looks per day', 'Unlimited per day'),
                    t('Priority glam lab — faster renders', 'Priority rendering'),
                    t('AI style coach built in', 'AI style assistant'),
                    t('Full wardrobe builder + smart suggestions', 'Full wardrobe builder + smart suggestions'),
                    t('Early access to new drops', 'Early access to new features'),
                    t('Priority support (we got you)', 'Priority support'),
                  ].map((feat) => (
                    <li key={feat} className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full border-2 border-white flex items-center justify-center shrink-0" style={{ fontSize: '11px', fontWeight: 900 }}>✓</span>
                      <span style={{ fontSize: '14px', fontWeight: 500 }}>{feat}</span>
                    </li>
                  ))}
                </ul>
                {isPro ? (
                  <>
                    <button
                      type="button"
                      disabled
                      className="w-full py-4 rounded-xl border-2 border-white font-bold cursor-default mb-3"
                      style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.05em', opacity: 0.5 }}
                    >
                      {t('ALREADY SLAYING ✓', 'CURRENT PLAN')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const res = await fetch('/api/billing/portal');
                        const json = await res.json() as { url?: string };
                        if (json.url) window.open(json.url, '_blank');
                      }}
                      className="w-full py-2 rounded-xl border border-white/40 font-bold hover:border-white/80 transition-all duration-200"
                      style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', opacity: 0.6 }}
                    >
                      {t('MANAGE SUBSCRIPTION', 'Manage subscription')}
                    </button>
                  </>
                ) : (
                  <a
                    href={process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL
                      ? `${process.env.NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL}?checkout[custom][user_id]=${encodeURIComponent(wardrobeUserIdRef.current ?? '')}&checkout[redirect_url]=${encodeURIComponent(typeof window !== 'undefined' ? `${window.location.origin}/billing/success` : '/billing/success')}`
                      : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 rounded-xl border-2 border-white font-bold hover:bg-white hover:text-black active:opacity-90 transition-all duration-200 text-center block"
                    style={{ fontSize: '14px', fontWeight: 800, letterSpacing: '0.05em' }}
                  >
                    {t("LET'S COOK — UPGRADE NOW", 'UPGRADE TO PRO')}
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="px-6 md:px-12 lg:px-20 py-16 border-t-4 border-black">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center">
                  <Shirt className="w-4 h-4 text-white" strokeWidth={2} />
                </div>
                <span className="tracking-[0.05em] uppercase" style={{ fontSize: '14px', fontWeight: 900 }}>Clueless</span>
              </div>
              <p style={{ fontSize: '13px', lineHeight: 1.6, fontWeight: 500 }}>
                Your wardrobe, reimagined with AI.
              </p>
            </div>

            <div>
              <h4 className="mb-4" style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.05em' }}>PRODUCT</h4>
              <ul className="space-y-2">
                {['Features', 'Pricing', 'Demo', 'Download'].map(item => (
                  <li key={item}>
                    <a href="#" className="hover:opacity-60 active:opacity-50 transition-opacity duration-200 ease-out rounded-sm inline-block" style={{ fontSize: '13px', fontWeight: 500 }}>
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4" style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.05em' }}>COMPANY</h4>
              <ul className="space-y-2">
                {['About', 'Blog', 'Careers', 'Contact'].map(item => (
                  <li key={item}>
                    <a href="#" className="hover:opacity-60 active:opacity-50 transition-opacity duration-200 ease-out rounded-sm inline-block" style={{ fontSize: '13px', fontWeight: 500 }}>
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="mb-4" style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.05em' }}>LEGAL</h4>
              <ul className="space-y-2">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map(item => (
                  <li key={item}>
                    <a href="#" className="hover:opacity-60 active:opacity-50 transition-opacity duration-200 ease-out rounded-sm inline-block" style={{ fontSize: '13px', fontWeight: 500 }}>
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t-2 border-black flex flex-col md:flex-row justify-between items-center gap-4">
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em' }}>
              © 2026 CLUELESS. ALL RIGHTS RESERVED.
            </div>
            <button
              type="button"
              onClick={() => {
                const next = langMode === 'slang' ? 'english' : 'slang';
                setLangMode(next);
                localStorage.setItem('clueless_lang_mode', next);
              }}
              className="flex items-center gap-1.5 rounded-full border-2 border-black px-3 py-1 hover:bg-black hover:text-white transition-all duration-200"
              style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}
              aria-label="Toggle language style"
            >
              <span style={{ opacity: langMode === 'slang' ? 1 : 0.35 }}>SLANG</span>
              <span style={{ opacity: 0.4 }}>/</span>
              <span style={{ opacity: langMode === 'english' ? 1 : 0.35 }}>EN</span>
            </button>
            <div style={{ fontSize: '11px', fontWeight: 500 }}>
              YOUR STYLE, SIMPLIFIED
            </div>
          </div>
        </div>
      </footer>

      {/* Try-on image lightbox */}
      <AnimatePresence>
        {lightboxImageUrl && (
          <motion.div
            key="tryon-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.88)' }}
            onClick={() => setLightboxImageUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={lightboxImageUrl}
                alt="Try-on result"
                className="w-full rounded-2xl"
                style={{ border: '3px solid #fff', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
              <button
                type="button"
                onClick={() => setLightboxImageUrl(null)}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: '#fff', border: '2px solid #000', fontSize: '14px', fontWeight: 900, lineHeight: 1 }}
                aria-label="Close"
              >
                ×
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
