'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { toast as sonnerToast } from 'sonner';
import { Shirt, User, LogOut, ChevronRight, ChevronLeft, Sparkles, Calendar, TrendingUp, MessageCircle, MapPin, Cloud, Plus, Check, Heart, Camera, Loader2, RefreshCw, Bug, Trash2 } from 'lucide-react';
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
import { WARDROBE_TEST_ITEMS, wardrobeSeedToItem } from '@/lib/wardrobe-test-data';
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';
import {
  fetchProfile,
  fetchSavedOutfits,
  fetchWardrobe,
  insertSavedOutfit,
  deleteSavedOutfit,
  insertWardrobeItem,
  deleteWardrobeItem,
  bulkInsertWardrobeItems,
  ensureProfileRow,
  updateProfile,
} from '@/lib/supabase/sync';
import type { Session } from '@supabase/supabase-js';
import type { SavedOutfit, WardrobeCategory, WardrobeItem } from '@/types/wardrobe';

const SUPABASE_ON = isSupabaseConfigured();
const AUTH_HYDRATION_TELEMETRY =
  process.env.NODE_ENV !== 'production' ||
  process.env.NEXT_PUBLIC_AUTH_HYDRATION_TELEMETRY === '1';

const LOCAL_SAVED_OUTFITS_KEY = 'clueless_saved_outfits_v1';

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

function isPersistedOutfitId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function wardrobeItemLabel(item: WardrobeItem | undefined): string {
  if (!item) return '';
  const t = item.title?.trim();
  return t || item.code;
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
  const [weather, setWeather] = useState({ temp: 12, condition: 'Cloudy' });
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>(() =>
    SUPABASE_ON ? [] : loadLocalSavedOutfits()
  );
  const [savedOutfitsLoading, setSavedOutfitsLoading] = useState(false);
  const [deletingOutfitId, setDeletingOutfitId] = useState<string | null>(null);
  const [deletingItemCode, setDeletingItemCode] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'wardrobe' | 'outfits'>('wardrobe');
  const [currentPage, setCurrentPage] = useState(0);
  const [isGeneratingTryOn, setIsGeneratingTryOn] = useState(false);
  const [tryOnImageUrl, setTryOnImageUrl] = useState<string | null>(null);
  const baseModelImg = 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80';
  const itemsPerPage = 8;
  const [userName, setUserName] = useState('Alex');
  const [supabaseReady, setSupabaseReady] = useState(!SUPABASE_ON);

  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [debugFillLoading, setDebugFillLoading] = useState(false);

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

  /**
   * `getSession()` can be briefly stale during refresh/navigation; use `getUser()` as the
   * authoritative source for "who is signed in" before deciding to clear wardrobe state.
   */
  const resolveAuthenticatedUserId = useCallback(async (): Promise<string | null> => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error) {
      console.error('resolveAuthenticatedUserId:getUser', error);
      trackAuthHydration('resolve_user_error', {
        hasError: true,
        message: error.message,
      });
      return null;
    }
    trackAuthHydration('resolve_user_ok', { hasUser: Boolean(user) });
    return user?.id ?? null;
  }, []);

  const hydrateRemoteUser = useCallback(async (userId: string): Promise<boolean> => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.refreshSession().catch(() => {});
    trackAuthHydration('hydrate_start', {
      requestedUser: Boolean(userId),
      hasLocalUserRef: Boolean(wardrobeUserIdRef.current),
    });
    const uid = await resolveAuthenticatedUserId();
    if (!uid || uid !== userId) {
      console.error('hydrateRemoteUser: no valid session after refresh', {
        expected: userId,
        got: uid,
      });
      trackAuthHydration('hydrate_rejected', {
        resolvedUser: Boolean(uid),
        matchesRequestedUser: uid === userId,
      });
      return false;
    }
    trackAuthHydration('hydrate_verified', { matchesRequestedUser: true });
    wardrobeUserIdRef.current = uid;

    if (savedOutfitsUserIdRef.current !== null && savedOutfitsUserIdRef.current !== uid) {
      setSavedOutfits([]);
    }
    savedOutfitsUserIdRef.current = uid;

    let profile = await fetchProfile(supabase, uid);
    if (!profile) {
      await ensureProfileRow(supabase, uid);
      profile = await fetchProfile(supabase, uid);
    }
    if (!mountedRef.current) return true;

    if (profile) {
      setUserName(profile.display_name || 'Alex');
      setHasCompletedOnboarding(profile.onboarding_completed);
      if (profile.selfie_url) setUserSelfie(profile.selfie_url);
      else setUserSelfie(null);
    }

    // Local-first wardrobe (same idea as Clueless). Distinguish "never saved" vs "user cleared closet".
    const localState = getWardrobeStorageState(uid);
    if (localState.kind === 'items') {
      setWardrobeItems(localState.items);
      trackAuthHydration('wardrobe_local_items', { count: localState.items.length });
    } else if (localState.kind === 'empty') {
      setWardrobeItems([]);
      trackAuthHydration('wardrobe_local_empty', {});
      // Recovery path: if local storage was accidentally wiped but cloud has items, restore from cloud.
      const cloudItems = await fetchWardrobe(supabase, uid);
      if (!mountedRef.current) return true;
      if (cloudItems && cloudItems.length > 0) {
        setWardrobeItems(cloudItems);
        storage.setWardrobe(uid, cloudItems);
        trackAuthHydration('wardrobe_cloud_recovered', { count: cloudItems.length });
      }
    } else {
      const items = await fetchWardrobe(supabase, uid);
      if (!mountedRef.current) return true;
      if (items === null) {
        console.error('fetchWardrobe failed — wardrobe not updated');
        trackAuthHydration('wardrobe_cloud_fetch_failed', {});
      } else {
        setWardrobeItems(items);
        storage.setWardrobe(uid, items);
        trackAuthHydration('wardrobe_cloud_loaded', { count: items.length });
      }
    }

    const outfits = await fetchSavedOutfits(supabase, uid);
    if (!mountedRef.current) return true;
    if (outfits === null) {
      console.error('fetchSavedOutfits failed — saved outfits not updated');
    } else {
      setSavedOutfits(outfits);
    }
    return true;
  }, [resolveAuthenticatedUserId]);

  const clearRemoteSessionState = useCallback(() => {
    wardrobeUserIdRef.current = null;
    savedOutfitsUserIdRef.current = null;
    setIsLoggedIn(false);
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
    setDebugFillLoading(false);
  }, []);

  const handleAuthDialogSignedIn = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setIsLoggedIn(true);
    wardrobeUserIdRef.current = user.id;
    const wState = getWardrobeStorageState(user.id);
    if (wState.kind === 'items') {
      setWardrobeItems(wState.items);
    } else if (wState.kind === 'empty') {
      setWardrobeItems([]);
    }
    try {
      const ok = await hydrateRemoteUser(user.id);
      if (!ok) {
        showToast('Could not verify your account yet. Keeping local wardrobe.', 'error');
        return;
      }
    } catch (e) {
      console.error('Post sign-in sync failed', e);
      showToast('Could not sync your wardrobe right now. Keeping local data.', 'error');
    }
    router.refresh();
  }, [hydrateRemoteUser, router, clearRemoteSessionState]);

  useEffect(() => {
    if (!SUPABASE_ON) return;
    let cancelled = false;
    const supabase = createBrowserSupabaseClient();

    async function readSessionWithRetry(): Promise<Session | null> {
      await supabase.auth.refreshSession().catch(() => {});
      const readOnce = async () => (await supabase.auth.getSession()).data.session;
      let session = await readOnce();
      if (session?.user) return session;
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
        session = await readOnce();
        if (session?.user) return session;
      }
      return session;
    }

    async function bootstrapFromStorage() {
      const session = await readSessionWithRetry();
      trackAuthHydration('bootstrap_session_read', {
        hasSessionUser: Boolean(session?.user),
      });
      if (cancelled) return;
      if (session?.user) {
        setIsLoggedIn(true);
        wardrobeUserIdRef.current = session.user.id;
        const wState = getWardrobeStorageState(session.user.id);
        if (wState.kind === 'items') {
          setWardrobeItems(wState.items);
        } else if (wState.kind === 'empty') {
          setWardrobeItems([]);
        }
        try {
          const ok = await hydrateRemoteUser(session.user.id);
          if (!ok && !cancelled) {
            // Do not wipe state on ambiguous auth reads. SIGNED_OUT will clear state when definitive.
            console.warn('bootstrapFromStorage: hydrateRemoteUser could not verify user');
            trackAuthHydration('bootstrap_hydrate_not_verified', {});
          }
        } catch (e) {
          console.error('Supabase bootstrap failed', e);
          // Keep any already-hydrated local data; avoid wiping wardrobe on transient network/auth failures.
          trackAuthHydration('bootstrap_hydrate_error', {
            message: e instanceof Error ? e.message : 'unknown',
          });
        }
      } else {
        trackAuthHydration('bootstrap_signed_out', {});
        clearRemoteSessionState();
      }
      if (!cancelled) setSupabaseReady(true);
    }

    void bootstrapFromStorage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      trackAuthHydration('auth_state_change', {
        event,
        hasSessionUser: Boolean(session?.user),
      });

      // Storage is loaded via getSession() + retry above. INITIAL_SESSION often races before
      // cookie storage is readable and would hydrate with no user, wiping data after refresh.
      if (event === 'INITIAL_SESSION') {
        return;
      }

      if (event === 'PASSWORD_RECOVERY') {
        setShowPasswordRecovery(true);
        return;
      }

      if (event === 'SIGNED_IN') {
        setIsLoggedIn(true);
        if (session?.user) {
          try {
            const ok = await hydrateRemoteUser(session.user.id);
            if (!ok) {
              console.warn('SIGNED_IN hydrate could not verify user; preserving local state');
            }
          } catch (e) {
            console.error('SIGNED_IN hydrate failed', e);
          }
        }
        router.refresh();
        return;
      }

      if (event === 'SIGNED_OUT') {
        clearRemoteSessionState();
        router.refresh();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [hydrateRemoteUser, router, clearRemoteSessionState]);

  useEffect(() => {
    if (!SUPABASE_ON || !supabaseReady) return;
    if (typeof window === 'undefined') return;
    const { hash, search } = window.location;
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setShowPasswordRecovery(true);
    }
  }, [supabaseReady]);

  useEffect(() => {
    if (SUPABASE_ON) return;
    try {
      localStorage.setItem(LOCAL_SAVED_OUTFITS_KEY, JSON.stringify(savedOutfits));
    } catch (e) {
      console.error('Could not persist saved outfits locally', e);
    }
  }, [savedOutfits]);

  useEffect(() => {
    if (!SUPABASE_ON || !isLoggedIn || !supabaseReady) return;
    const uid = wardrobeUserIdRef.current;
    if (!uid) return;
    storage.setWardrobe(uid, wardrobeItems);
  }, [wardrobeItems, isLoggedIn, supabaseReady]);

  const refreshSavedOutfits = async () => {
    if (!SUPABASE_ON || !isLoggedIn) return;
    setSavedOutfitsLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const list = await fetchSavedOutfits(supabase, user.id);
      if (list === null) {
        showToast('Could not load saved outfits. Check your connection and try again.', 'error');
        return;
      }
      setSavedOutfits(list);
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
      setWeather({ temp: 12, condition: 'Cloudy' });
      return;
    }

    // Optimistic teardown — honor the user's intent immediately. If we waited
    // for signOut(), a hung network call (default 'global' scope hits the
    // server) would leave the UI stuck logged in with no feedback. Local state
    // first, network call second.
    clearRemoteSessionState();

    try {
      const supabase = createBrowserSupabaseClient();
      // 'local' scope clears cookies/storage with no server round-trip — fast,
      // deterministic, can't hang. The refresh token expires server-side on its
      // own TTL.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.error('Supabase signOut error (local already cleared)', error);
      }
    } catch (e) {
      console.error('Supabase signOut threw (local already cleared)', e);
    }

    router.refresh();
  };

  useEffect(() => {
    if (!isLoggedIn || hasCompletedOnboarding) return;
    if (SUPABASE_ON && !supabaseReady) return;
    const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, [isLoggedIn, hasCompletedOnboarding, supabaseReady]);

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

  const geoRequestedRef = useRef(false);

  /** When logged in, resolve city + weather from the browser geolocation (HTTPS / localhost). */
  useEffect(() => {
    if (!isLoggedIn) {
      geoRequestedRef.current = false;
      return;
    }
    if (typeof window === 'undefined' || !('geolocation' in navigator)) return;
    if (geoRequestedRef.current) return;
    geoRequestedRef.current = true;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        try {
          const response = await fetch(
            `/api/weather?lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}`
          );
          if (!response.ok) return;
          const payload = await response.json();
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
      },
      () => {
        // Permission denied or timeout — keep default location (e.g. Berlin).
      },
      { enableHighAccuracy: false, maximumAge: 300_000, timeout: 20_000 }
    );
  }, [isLoggedIn]);

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
    localStorage.setItem('hasSeenOnboarding', 'true');
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
    let id: string;

    if (SUPABASE_ON) {
      try {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.refreshSession();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user) {
          showToast('Sign in to save outfits', 'error');
          return;
        }
        const inserted = await insertSavedOutfit(supabase, session.user.id, {
          tops: selectedOutfit.tops,
          bottoms: selectedOutfit.bottoms,
          accessories: selectedOutfit.accessories,
          savedAt,
        });
        if ('error' in inserted) {
          showToast(`Could not save outfit: ${inserted.error}`, 'error');
          return;
        }
        id = inserted.id;
      } catch (e) {
        console.error('Failed to save outfit remotely', e);
        showToast('Could not save outfit — try again', 'error');
        return;
      }
    } else {
      id = `${Date.now()}`;
    }

    const newOutfit: SavedOutfit = {
      id,
      tops: selectedOutfit.tops,
      bottoms: selectedOutfit.bottoms,
      accessories: selectedOutfit.accessories,
      savedAt,
    };
    setSavedOutfits((prev) => [newOutfit, ...prev]);
    showToast('Outfit saved successfully!');
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
    if (!window.confirm(`Remove “${label}” from saved outfits? This cannot be undone.`)) return;

    if (SUPABASE_ON && isPersistedOutfitId(outfit.id)) {
      setDeletingOutfitId(outfit.id);
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          showToast('Sign in to manage saved outfits', 'error');
          return;
        }
        const ok = await deleteSavedOutfit(supabase, user.id, outfit.id);
        if (!ok) {
          showToast('Could not delete outfit — try again', 'error');
          return;
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
    if (!window.confirm(`Remove “${label}” from your wardrobe? This cannot be undone.`)) return;

    if (SUPABASE_ON) {
      setDeletingItemCode(item.code);
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          showToast('Sign in to manage your wardrobe', 'error');
          return;
        }
        const ok = await deleteWardrobeItem(supabase, user.id, item.code);
        if (!ok) {
          showToast('Could not delete item — try again', 'error');
          return;
        }
      } finally {
        setDeletingItemCode(null);
      }
    }

    setWardrobeItems((prev) => {
      const next = prev.filter((i) => i.code !== item.code);
      const uid = wardrobeUserIdRef.current;
      if (uid) storage.setWardrobe(uid, next);
      return next;
    });

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
    const prefix = item.category === 'tops' ? 'TP' : item.category === 'bottoms' ? 'BT' : 'AC';
    const suffix =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const newItem: WardrobeItem = {
      code: `${prefix}-${suffix}`,
      type: item.type,
      category: item.category as WardrobeCategory,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.title ? { title: item.title } : {}),
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
      ...(item.attribution ? { attribution: item.attribution } : {}),
    };

    setWardrobeItems((prev) => {
      const next = [...prev, newItem];
      const sortOrder = next.length - 1;
      const uidSync = wardrobeUserIdRef.current;
      if (SUPABASE_ON) {
        if (uidSync) {
          storage.setWardrobe(uidSync, next);
        } else {
          void createBrowserSupabaseClient()
            .auth.getSession()
            .then(({ data: { session } }) => {
              const u = session?.user?.id;
              if (u) storage.setWardrobe(u, next);
            });
        }
        void (async () => {
          try {
            const supabase = createBrowserSupabaseClient();
            await supabase.auth.refreshSession();
            const {
              data: { session },
            } = await supabase.auth.getSession();
            if (!session?.user) {
              showToast('Sign in to save items to your wardrobe.', 'error');
              setWardrobeItems((p) => p.filter((i) => i.code !== newItem.code));
              if (wardrobeUserIdRef.current) {
                storage.setWardrobe(
                  wardrobeUserIdRef.current,
                  next.filter((i) => i.code !== newItem.code)
                );
              }
              return;
            }
            const result = await insertWardrobeItem(
              supabase,
              session.user.id,
              newItem,
              sortOrder
            );
            if ('error' in result) {
              console.warn('insertWardrobeItem (device copy kept)', result.error);
              showToast(`${item.type} saved on this device. Cloud sync failed.`, 'error');
              return;
            }
            showToast(`${item.type} added to wardrobe!`);
          } catch (e) {
            console.warn('Cloud wardrobe sync failed (device copy kept)', e);
            showToast(`${item.type} saved on this device. Cloud sync failed.`, 'error');
          }
        })();
      }
      return next;
    });
    if (!SUPABASE_ON) {
      showToast(`${item.type} added to wardrobe!`);
    }
  };

  const handleDebugFillWardrobe = useCallback(async () => {
    const prev = wardrobeItems;
    const existingLocal = new Set(prev.map((i) => i.code));
    const additionsLocal = WARDROBE_TEST_ITEMS.filter((s) => !existingLocal.has(s.code)).map(
      wardrobeSeedToItem
    );

    if (!SUPABASE_ON) {
      if (additionsLocal.length === 0) {
        showToast('All debug seed items are already in your wardrobe');
        return;
      }
      const next = [...prev, ...additionsLocal];
      setWardrobeItems(next);
      const uid = wardrobeUserIdRef.current;
      if (uid) storage.setWardrobe(uid, next);
      showToast(`Added ${additionsLocal.length} debug wardrobe items`);
      return;
    }

    setDebugFillLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.refreshSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        showToast('Sign in to save debug items to your wardrobe', 'error');
        return;
      }

      const cloud = await fetchWardrobe(supabase, user.id);
      if (cloud === null) {
        showToast('Could not load wardrobe from the cloud. Check your connection and try again.', 'error');
        return;
      }

      const cloudCodes = new Set(cloud.map((i) => i.code));
      const toInsert = WARDROBE_TEST_ITEMS.filter((s) => !cloudCodes.has(s.code)).map(wardrobeSeedToItem);
      const startSortOrder = cloud.length;

      if (toInsert.length === 0) {
        setWardrobeItems(cloud);
        storage.setWardrobe(user.id, cloud);
        showToast('Your cloud wardrobe already includes all seed items.');
        return;
      }

      const result = await bulkInsertWardrobeItems(supabase, user.id, toInsert, startSortOrder);
      if ('error' in result) {
        showToast(`Cloud sync failed: ${result.error}`, 'error');
        return;
      }

      const fresh = await fetchWardrobe(supabase, user.id);
      if (fresh) {
        setWardrobeItems(fresh);
        storage.setWardrobe(user.id, fresh);
      } else {
        const next = [...prev, ...toInsert];
        setWardrobeItems(next);
        storage.setWardrobe(user.id, next);
      }
      showToast(`Added ${toInsert.length} items to your cloud wardrobe`);
    } catch (e) {
      console.warn('Debug wardrobe fill sync failed', e);
      showToast('Cloud sync failed. Try again.', 'error');
    } finally {
      setDebugFillLoading(false);
    }
  }, [wardrobeItems]);

  const handleTryOn = async () => {
    if (!userSelfie) {
      showToast('Upload your photo first', 'error');
      return;
    }
    const selectedGarment = selectedOutfit.tops ?? selectedOutfit.bottoms ?? selectedOutfit.accessories;
    if (!selectedGarment) {
      showToast('Select at least one outfit item', 'error');
      return;
    }

    try {
      setIsGeneratingTryOn(true);
      const response = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personImageUrl: userSelfie,
          garmentImageUrl: selectedGarment.imageUrl ?? getGarmentImage(selectedGarment.type),
          prompt: `Virtual try-on with ${selectedGarment.type}`,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (
          response.status === 402 ||
          payload?.code === 'REPLICATE_PAYMENT_REQUIRED'
        ) {
          throw new Error(
            'Virtual try-on needs Replicate billing credit. Add funds at https://replicate.com/account/billing — wait a few minutes after purchase, then try again.',
          );
        }
        const msg =
          typeof payload?.details === 'string'
            ? payload.details
            : typeof payload?.error === 'string'
              ? payload.error
              : `Try-on failed (${response.status})`;
        throw new Error(msg);
      }
      const imageUrl =
        typeof payload?.imageUrl === 'string' && payload.imageUrl.startsWith('http')
          ? payload.imageUrl
          : null;
      if (imageUrl) {
        setTryOnImageUrl(imageUrl);
        showToast('Try-on generated');
      } else {
        showToast('Try-on completed but no image URL was returned', 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Try-on failed';
      const tokenHint =
        /missing\s+replicate/i.test(msg) || /REPLICATE_API_TOKEN/i.test(msg)
          ? ' Add REPLICATE_API_TOKEN to .env.local (no quotes/spaces) and restart the dev server.'
          : '';
      showToast(`${msg}${tokenHint}`, 'error');
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

      {/* Hero */}
      <section
        className={`relative flex items-center px-6 md:px-12 lg:px-20 ${
          isLoggedIn
            ? 'min-h-screen pt-24 pb-16'
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
                  <span className="truncate" style={{ fontSize: '12px', fontWeight: 700 }}>{location}</span>
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

          <div className={`text-center ${isLoggedIn ? 'mb-12' : 'mb-14 md:mb-16'}`}>
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
                Digital wardrobe · AI stylist
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
                <>Your wardrobe, reimagined. AI-powered outfit suggestions from what you already own.</>
              ) : (
                <>
                  Stop staring at the closet. Clueless remembers what you own, respects the weather, and helps you
                  build outfits in seconds—then chats with you like a stylist who actually knows your rail.
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
                  <span>ASK AI STYLIST</span>
                </motion.button>
              )}
            </div>
          </div>

          {/* Cards Grid — guests get three clear value props; signed-in keeps a lighter pair */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className={`grid mx-auto ${
              isLoggedIn
                ? 'md:grid-cols-2 gap-6 max-w-[900px]'
                : 'md:grid-cols-3 gap-5 md:gap-6 max-w-[1100px]'
            }`}
          >
            {!isLoggedIn ? (
              <>
                {[
                  {
                    kicker: '01',
                    title: 'Own less chaos',
                    body: 'Add pieces from search or upload. One closet, always sorted by category—no more “where did I put that?”',
                  },
                  {
                    kicker: '02',
                    title: 'Dress for the day',
                    body: 'When you’re signed in, we fold in your location and forecast so suggestions feel sensible, not random.',
                  },
                  {
                    kicker: '03',
                    title: 'Chat with your rail',
                    body: 'The stylist reasons over what you actually own—mix, match, and save outfits without leaving the app.',
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
            ) : (
              <>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="p-8 rounded-3xl relative overflow-hidden"
                  style={{
                    background: '#FFE5C8',
                    border: '3px solid #000',
                    boxShadow: '8px 8px 0 #000'
                  }}
                >
                  <div className="relative z-10">
                    <h3 className="mb-3" style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                      Clueless
                    </h3>
                    <p style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
                      Your personal AI wardrobe assistant
                    </p>
                  </div>
                </motion.div>

                <motion.div
                  whileHover={{ y: -4 }}
                  className="p-8 rounded-3xl relative overflow-hidden"
                  style={{
                    background: '#FFE5C8',
                    border: '3px solid #000',
                    boxShadow: '8px 8px 0 #000'
                  }}
                >
                  <div className="relative z-10">
                    <h3 className="mb-3" style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                      Clueless
                    </h3>
                    <p style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
                      Try the closet scanner beta
                    </p>
                  </div>
                </motion.div>
              </>
            )}
          </motion.div>
        </div>
      </section>

      {/* AI Recommendations Section */}
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
              {isLoggedIn ? 'AI-POWERED OUTFIT RECOMMENDATIONS' : 'OUTFITS THAT FIT YOUR REAL LIFE'}
            </h2>
            <p className={`max-w-[640px] mx-auto text-pretty ${isLoggedIn ? 'mb-8' : 'mb-2'}`} style={{ fontSize: '15px', lineHeight: 1.75, fontWeight: 500, color: isLoggedIn ? undefined : 'rgba(0,0,0,0.78)' }}>
              {isLoggedIn ? (
                <>Just tell us what you&apos;re doing today. Our AI considers your location, weather, personal style, and occasion to suggest the perfect outfit.</>
              ) : (
                <>Sign in and the app learns your closet, the weather where you are, and how you like to dress—so recommendations feel specific, not generic.</>
              )}
            </p>
          </motion.div>

          {/* AI Feature Cards */}
          <div className={`grid md:grid-cols-3 ${isLoggedIn ? 'gap-6 mb-16' : 'gap-5 md:gap-7 mb-12 md:mb-16'}`}>
            {[
              {
                icon: <MapPin className="w-6 h-6" strokeWidth={2.5} />,
                title: isLoggedIn ? 'LOCATION AWARE' : 'WHERE YOU ARE',
                description: isLoggedIn
                  ? 'Weather-appropriate suggestions based on your current location and forecast'
                  : 'After sign-in, forecasts and plans stay in sync so you’re not caught in the wrong layer.',
              },
              {
                icon: <Sparkles className="w-6 h-6" strokeWidth={2.5} />,
                title: isLoggedIn ? 'SMART STYLING' : 'YOUR PIECES, FIRST',
                description: isLoggedIn
                  ? "AI learns your style from saved outfits and suggests looks you'll love"
                  : 'Suggestions pull from what you’ve added—no fantasy closet full of things you don’t own.',
              },
              {
                icon: <MessageCircle className="w-6 h-6" strokeWidth={2.5} />,
                title: isLoggedIn ? 'CONVERSATIONAL' : 'NATURAL CHAT',
                description: isLoggedIn
                  ? 'Chat naturally about your day and get instant outfit recommendations'
                  : 'Describe your day in plain language; the stylist answers with combinations you can actually wear.',
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
                TRY ASKING
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
              <span>TALK TO AI STYLIST</span>
            </motion.button>
          </motion.div>
          )}
        </div>
      </section>

      {/* Value Proposition */}
      <section className={`px-6 md:px-12 lg:px-20 ${isLoggedIn ? 'py-24' : 'py-20 md:py-28'}`}>
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
              BUILD YOUR DIGITAL WARDROBE
            </h2>
            <p className="max-w-[640px] mx-auto text-pretty" style={{ fontSize: '15px', lineHeight: 1.75, fontWeight: 500, color: isLoggedIn ? undefined : 'rgba(0,0,0,0.78)' }}>
              {isLoggedIn ? (
                <>Catalog your entire wardrobe. Mix and match pieces to create unlimited outfit combinations.</>
              ) : (
                <>One place for everything you wear. See it, combine it, save looks you love—then come back when you’re rushing out the door.</>
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
                className={`grid gap-8 min-w-0 ${isLoggedIn ? 'lg:grid-cols-[1fr,minmax(280px,400px)]' : 'grid-cols-1'}`}
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
                          Members only
                        </p>
                        <h3 className="mb-4" style={{ fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 900, letterSpacing: '-0.02em' }}>
                          Unlock your closet
                        </h3>
                        <p className="mb-8" style={{ fontSize: '15px', lineHeight: 1.65, fontWeight: 500, color: 'rgba(0,0,0,0.72)' }}>
                          Create a free account to add pieces, run try-ons, save outfits, and chat with the stylist using your real wardrobe.
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
                        LIVE PREVIEW
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

                    {/* Multiple Clothing Sticker Overlays */}
                    {selectedOutfit.bottoms && (
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

                    {selectedOutfit.tops && (
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

                    {selectedOutfit.accessories && (
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
                    {!selectedOutfit.tops && !selectedOutfit.bottoms && !selectedOutfit.accessories && (
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

                  {/* Selected Items Info */}
                  <div className="space-y-2 mb-4">
                    <div className="p-3 rounded-xl" style={{
                      background: selectedOutfit.tops ? '#FFE5F1' : '#f5f5f5',
                      border: '2px solid #000'
                    }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '4px', opacity: 0.6 }}>
                        TOP
                      </div>
                      <div className="break-words" style={{ fontSize: '12px', fontWeight: 600 }}>
                        {selectedOutfit.tops ? selectedOutfit.tops.code : 'None selected'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl" style={{
                      background: selectedOutfit.bottoms ? '#FFE5F1' : '#f5f5f5',
                      border: '2px solid #000'
                    }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '4px', opacity: 0.6 }}>
                        BOTTOM
                      </div>
                      <div className="break-words" style={{ fontSize: '12px', fontWeight: 600 }}>
                        {selectedOutfit.bottoms ? selectedOutfit.bottoms.code : 'None selected'}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl" style={{
                      background: selectedOutfit.accessories ? '#FFE5F1' : '#f5f5f5',
                      border: '2px solid #000'
                    }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '4px', opacity: 0.6 }}>
                        ACCESSORY
                      </div>
                      <div className="break-words" style={{ fontSize: '12px', fontWeight: 600 }}>
                        {selectedOutfit.accessories ? selectedOutfit.accessories.code : 'None selected'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <motion.button
                      whileHover={{ scale: 1.02, y: -1 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleTryOn}
                      disabled={isGeneratingTryOn || !userSelfie || (!selectedOutfit.tops && !selectedOutfit.bottoms && !selectedOutfit.accessories)}
                      className="w-full py-3 px-4 rounded-full text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: '#000',
                        fontSize: '11px',
                        fontWeight: 700,
                        letterSpacing: '0.1em'
                      }}
                    >
                      {isGeneratingTryOn ? 'GENERATING TRY-ON...' : 'RUN AI TRY-ON'}
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
                      SAVE OUTFIT
                    </motion.button>

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
                      CLEAR ALL
                    </motion.button>
                  </div>
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
                      SAVED OUTFITS
                    </h2>
                    <p style={{ fontSize: '15px', fontWeight: 500, opacity: 0.7 }}>
                      {savedOutfits.length} saved {savedOutfits.length === 1 ? 'outfit' : 'outfits'}
                      {SUPABASE_ON && (
                        <span className="block sm:inline sm:before:content-['\00a0\2014\00a0'] sm:before:font-normal mt-1 sm:mt-0 text-[13px]">
                          Synced to your account
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
                      No Saved Outfits Yet
                    </h3>
                    <p className="mb-6" style={{ fontSize: '14px', opacity: 0.7 }}>
                      Create and save your favorite outfit combinations from the wardrobe
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
                    {savedOutfits.map((outfit) => (
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
                        <div className="aspect-square bg-gradient-to-b from-gray-100 to-gray-200 rounded-xl mb-4 relative overflow-hidden">
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
                    ))}
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

      {/* Final CTA */}
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
              Accounts and core wardrobe features are free. Optional AI try-on uses paid cloud GPU when you run it—see your provider’s billing (e.g. Replicate).
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

      {/* Floating Action Buttons */}
      {isLoggedIn && !showChat && currentView === 'wardrobe' && (
        <>
          <motion.button
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.9, type: 'spring', damping: 20 }}
            whileHover={{ scale: debugFillLoading ? 1 : 1.08 }}
            whileTap={{ scale: debugFillLoading ? 1 : 0.95 }}
            onClick={() => void handleDebugFillWardrobe()}
            disabled={debugFillLoading}
            className="fixed bottom-8 left-6 z-[60] w-12 h-12 rounded-full flex items-center justify-center shadow-[0_8px_28px_rgba(0,0,0,0.18)] transition-shadow duration-200 ease-out disabled:opacity-60"
            style={{
              background: '#f59e0b',
              color: '#000',
              border: '2px solid #000',
            }}
            type="button"
            title="Testing: add sample wardrobe items (10+ per category)"
            aria-label="Fill wardrobe with sample items for testing"
          >
            {debugFillLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" strokeWidth={2.5} aria-hidden />
            ) : (
              <Bug className="w-5 h-5" strokeWidth={2.5} aria-hidden />
            )}
          </motion.button>

          <motion.button
            initial={false}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 1, type: 'spring', damping: 20 }}
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
        {showOnboarding && (
          <OnboardingFlow
            onComplete={handleOnboardingComplete}
            userName={userName}
          />
        )}
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
            <div style={{ fontSize: '11px', fontWeight: 500 }}>
              YOUR STYLE, SIMPLIFIED
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
