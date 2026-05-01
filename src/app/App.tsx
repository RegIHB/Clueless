'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shirt, User, LogOut, ChevronRight, ChevronLeft, Sparkles, Calendar, TrendingUp, MessageCircle, MapPin, Cloud, Plus, Check, Heart, Camera } from 'lucide-react';
import Image from 'next/image';
import { ClothingIcon } from './components/ClothingIcon';
import { ClothingSticker } from './components/ClothingSticker';
import { ChatInterface } from './components/ChatInterface';
import { OnboardingFlow } from './components/OnboardingFlow';
import { UploadFlow } from './components/UploadFlow';
import { EmptyState } from './components/EmptyState';
import { SelfieUpload } from './components/SelfieUpload';
import { getGarmentImage } from '@/lib/garment-images';
import { WARDROBE_TEST_ITEMS } from '@/lib/wardrobe-test-data';
import {
  createBrowserSupabaseClient,
  isSupabaseConfigured,
} from '@/lib/supabase/client';
import {
  countWardrobeItems,
  ensureAnonymousSession,
  fetchProfile,
  fetchSavedOutfits,
  fetchWardrobe,
  insertSavedOutfit,
  insertWardrobeItem,
  seedWardrobeFromDemo,
  ensureProfileRow,
  updateProfile,
} from '@/lib/supabase/sync';
import type { SavedOutfit, WardrobeCategory, WardrobeItem } from '@/types/wardrobe';

const SUPABASE_ON = isSupabaseConfigured();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(true);
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
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [savedOutfits, setSavedOutfits] = useState<SavedOutfit[]>([]);
  const [currentView, setCurrentView] = useState<'wardrobe' | 'outfits'>('wardrobe');
  const [currentPage, setCurrentPage] = useState(0);
  const [isGeneratingTryOn, setIsGeneratingTryOn] = useState(false);
  const [tryOnImageUrl, setTryOnImageUrl] = useState<string | null>(null);
  const baseModelImg = 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=1200&q=80';
  const itemsPerPage = 6;
  const [userName, setUserName] = useState('Alex');
  const [supabaseReady, setSupabaseReady] = useState(!SUPABASE_ON);

  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>(() =>
    SUPABASE_ON ? [] : [...WARDROBE_TEST_ITEMS]
  );

  useEffect(() => {
    if (!SUPABASE_ON) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const session = await ensureAnonymousSession(supabase);
        const userId = session.user.id;

        let profile = await fetchProfile(supabase, userId);
        if (!profile) {
          await ensureProfileRow(supabase, userId);
          profile = await fetchProfile(supabase, userId);
        }
        if (cancelled) return;

        if (profile) {
          setUserName(profile.display_name || 'Alex');
          setHasCompletedOnboarding(profile.onboarding_completed);
          if (profile.selfie_url) setUserSelfie(profile.selfie_url);
        }

        const n = await countWardrobeItems(supabase, userId);
        if (n === 0) {
          await seedWardrobeFromDemo(supabase, userId, WARDROBE_TEST_ITEMS);
        }
        const items = await fetchWardrobe(supabase, userId);
        if (!cancelled) setWardrobeItems(items);

        const outfits = await fetchSavedOutfits(supabase, userId);
        if (!cancelled) setSavedOutfits(outfits);
      } catch (e) {
        console.error('Supabase bootstrap failed', e);
        if (!cancelled) {
          setWardrobeItems([...WARDROBE_TEST_ITEMS]);
          setSupabaseReady(true);
          return;
        }
      } finally {
        if (!cancelled) setSupabaseReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = async () => {
    setIsLoggedIn(true);
    if (!SUPABASE_ON) return;
    try {
      const supabase = createBrowserSupabaseClient();
      await ensureAnonymousSession(supabase);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let profile = await fetchProfile(supabase, user.id);
      if (!profile) {
        await ensureProfileRow(supabase, user.id);
        profile = await fetchProfile(supabase, user.id);
      }
      if (profile) {
        setUserName(profile.display_name || 'Alex');
        setHasCompletedOnboarding(profile.onboarding_completed);
        if (profile.selfie_url) setUserSelfie(profile.selfie_url);
      }

      const n = await countWardrobeItems(supabase, user.id);
      if (n === 0) {
        await seedWardrobeFromDemo(supabase, user.id, WARDROBE_TEST_ITEMS);
      }
      setWardrobeItems(await fetchWardrobe(supabase, user.id));
      setSavedOutfits(await fetchSavedOutfits(supabase, user.id));
    } catch (e) {
      console.error('Supabase login sync failed', e);
    }
  };

  const handleLogout = async () => {
    setIsLoggedIn(false);
    setSelectedOutfit({});
    if (SUPABASE_ON) {
      try {
        const supabase = createBrowserSupabaseClient();
        await supabase.auth.signOut();
      } catch (e) {
        console.error('Supabase signOut failed', e);
      }
    }
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

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSaveOutfit = async () => {
    if (!selectedOutfit.tops && !selectedOutfit.bottoms) return;

    let id = `${Date.now()}`;
    if (SUPABASE_ON) {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const inserted = await insertSavedOutfit(supabase, user.id, {
            tops: selectedOutfit.tops,
            bottoms: selectedOutfit.bottoms,
            accessories: selectedOutfit.accessories,
            savedAt: new Date(),
          });
          if (inserted) id = inserted;
        }
      } catch (e) {
        console.error('Failed to save outfit remotely', e);
      }
    }

    const newOutfit: SavedOutfit = {
      id,
      ...selectedOutfit,
      savedAt: new Date(),
    };
    setSavedOutfits((prev) => [newOutfit, ...prev]);
    showToast('Outfit saved successfully!');
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
    const newItem: WardrobeItem = {
      code: `${prefix}-${Date.now().toString().slice(-4)}`,
      type: item.type,
      category: item.category as WardrobeCategory,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
      ...(item.title ? { title: item.title } : {}),
      ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
      ...(item.attribution ? { attribution: item.attribution } : {}),
    };

    setWardrobeItems((prev) => {
      const next = [...prev, newItem];
      if (SUPABASE_ON) {
        void (async () => {
          try {
            const supabase = createBrowserSupabaseClient();
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user) {
              await insertWardrobeItem(supabase, user.id, newItem, next.length - 1);
            }
          } catch (e) {
            console.error('Failed to persist wardrobe item', e);
          }
        })();
      }
      return next;
    });
    showToast(`${item.type} added to wardrobe!`);
  };

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

      if (!response.ok) {
        throw new Error('Try-on request failed');
      }
      const payload = await response.json();
      const output = payload?.output;
      const generated = Array.isArray(output) ? output[0] : output;
      if (typeof generated === 'string' && generated.length > 0) {
        setTryOnImageUrl(generated);
        showToast('Try-on generated');
      } else {
        showToast('Try-on completed but no image was returned', 'error');
      }
    } catch {
      showToast('Try-on failed. Confirm REPLICATE_API_TOKEN is configured.', 'error');
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
            <nav className="hidden md:flex items-center gap-6 shrink-0">
              <button
                type="button"
                onClick={() => setCurrentView('wardrobe')}
                className="hover:opacity-60 transition-opacity duration-200 ease-out rounded-sm"
                style={{
                  fontSize: '11px',
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
                className="hover:opacity-60 transition-opacity duration-200 ease-out rounded-sm flex items-center gap-1"
                style={{
                  fontSize: '11px',
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
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 sm:gap-2 pl-2 pr-2 sm:px-4 py-2 rounded-full hover:opacity-80 active:opacity-70 transition-all duration-200 ease-out min-w-0 max-w-full"
                style={{
                  background: '#FFE5F1',
                  border: '2px solid #000'
                }}
                title={`Signed in as ${userName}`}
              >
                <User className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
                <span className="truncate max-w-[4.5rem] sm:max-w-[10rem] md:max-w-[14rem]" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>{userName.toUpperCase()}</span>
                <LogOut className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLogin}
              className="px-5 py-2.5 text-white hover:opacity-90 active:opacity-80 transition-all duration-200 ease-out rounded-full shrink-0"
              style={{
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                background: '#000000',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
              }}
            >
              LOGIN
            </button>
          )}
        </div>
      </motion.header>

      {/* Hero */}
      <section className="relative min-h-screen flex items-center pt-24 pb-16 px-6 md:px-12 lg:px-20">
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

          <div className="text-center mb-12">
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

            <motion.h1
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mb-6"
              style={{
                fontSize: 'clamp(48px, 10vw, 96px)',
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
              className="mb-8 max-w-[600px] mx-auto"
              style={{ fontSize: '16px', lineHeight: 1.6, fontWeight: 500 }}
            >
              Your wardrobe, reimagined. AI-powered outfit suggestions from what you already own.
            </motion.p>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              <motion.button
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.8 }}
                whileHover={{ scale: 1.05, y: -2 }}
                className="px-10 py-4 text-white transition-[transform,box-shadow,opacity] duration-200 ease-out rounded-full inline-flex items-center gap-3"
                style={{
                  background: '#000000',
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)'
                }}
              >
                <span>{isLoggedIn ? 'VIEW MY WARDROBE' : 'GET STARTED'}</span>
                <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
              </motion.button>

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

          {/* Cards Grid */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="grid md:grid-cols-2 gap-6 max-w-[900px] mx-auto"
          >
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
          </motion.div>
        </div>
      </section>

      {/* AI Recommendations Section */}
      <section className="px-6 md:px-12 lg:px-20 py-24">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-12"
          >
            <h2 className="mb-4" style={{
              fontSize: 'clamp(32px, 6vw, 56px)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}>
              AI-POWERED OUTFIT RECOMMENDATIONS
            </h2>
            <p className="max-w-[700px] mx-auto mb-8" style={{ fontSize: '15px', lineHeight: 1.7, fontWeight: 500 }}>
              Just tell us what you&apos;re doing today. Our AI considers your location, weather, personal style, and occasion to suggest the perfect outfit.
            </p>
          </motion.div>

          {/* AI Feature Cards */}
          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              {
                icon: <MapPin className="w-6 h-6" strokeWidth={2.5} />,
                title: 'LOCATION AWARE',
                description: 'Weather-appropriate suggestions based on your current location and forecast'
              },
              {
                icon: <Sparkles className="w-6 h-6" strokeWidth={2.5} />,
                title: 'SMART STYLING',
                description: "AI learns your style from saved outfits and suggests looks you&apos;ll love"
              },
              {
                icon: <MessageCircle className="w-6 h-6" strokeWidth={2.5} />,
                title: 'CONVERSATIONAL',
                description: 'Chat naturally about your day and get instant outfit recommendations'
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

          {/* Example Prompts */}
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
        </div>
      </section>

      {/* Value Proposition */}
      <section className="px-6 md:px-12 lg:px-20 py-24">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial={false}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="mb-4" style={{
              fontSize: 'clamp(32px, 6vw, 56px)',
              fontWeight: 900,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase'
            }}>
              BUILD YOUR DIGITAL WARDROBE
            </h2>
            <p className="max-w-[700px] mx-auto" style={{ fontSize: '15px', lineHeight: 1.7, fontWeight: 500 }}>
              Catalog your entire wardrobe. Mix and match pieces to create unlimited outfit combinations.
            </p>
          </motion.div>

          {/* Wardrobe Builder */}
          {currentView === 'wardrobe' && (
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="mb-16"
            >
              <div className="grid lg:grid-cols-[1fr,minmax(280px,400px)] gap-8 min-w-0">
                {/* Wardrobe Grid Section */}
                <div className="p-8 md:p-12 rounded-3xl min-w-0"
                  style={{
                    background: 'rgba(255, 255, 255, 0.7)',
                    border: '3px solid #000',
                    boxShadow: '12px 12px 0 #000'
                  }}
                >
                  {wardrobeItems.length === 0 ? (
                    <EmptyState onAddItem={() => setShowUpload(true)} />
                  ) : (
                    <>
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          {(['tops', 'bottoms', 'accessories'] as WardrobeCategory[]).map((category) => (
                            <button
                              key={category}
                              onClick={() => handleCategoryChange(category)}
                              className="px-4 py-2 rounded-full transition-colors duration-200 ease-out"
                              style={{
                                background: selectedCategory === category ? '#000' : '#FFE5C8',
                                color: selectedCategory === category ? '#fff' : '#000',
                                border: '2px solid #000',
                                fontSize: '11px',
                                fontWeight: 700,
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase'
                              }}
                            >
                              {category}
                            </button>
                          ))}
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

                      {/* Paginated Grid with Navigation */}
                      <div className="relative">
                        <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-3 gap-4 md:gap-6 mb-6 min-h-[400px]">
                  {getPaginatedItems(selectedCategory).items.map((item, idx) => {
                    const isSelected = selectedOutfit[item.category]?.code === item.code;
                    return (
                      <motion.div
                        key={item.code}
                        initial={false}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.4, delay: idx * 0.05 }}
                        whileHover={{ scale: 1.05, y: -4 }}
                        className="text-center cursor-pointer relative"
                        onClick={() => handleItemClick(item)}
                      >
                        <div
                          className={`aspect-square bg-white rounded-2xl mb-2 flex items-center justify-center relative overflow-hidden transition-[border-color,box-shadow] duration-200 ease-out ${item.imageUrl ? 'p-0' : 'p-3'}`}
                          style={{
                            border: isSelected ? '3px solid #667eea' : '2px solid rgba(0, 0, 0, 0.12)',
                            boxShadow: isSelected ? '0 4px 16px rgba(102, 126, 234, 0.35)' : '0 1px 0 rgba(0, 0, 0, 0.06)'
                          }}
                        >
                          {item.imageUrl ? (
                            <Image
                              src={item.imageUrl}
                              alt={item.title ?? item.type}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 33vw, 200px"
                              unoptimized
                            />
                          ) : (
                            <ClothingIcon type={item.type} />
                          )}
                          {isSelected && (
                            <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="break-words line-clamp-3 text-center px-0.5" style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', lineHeight: 1.3 }}>
                          {item.title
                            ? `${item.title.length > 28 ? `${item.title.slice(0, 28)}…` : item.title}`
                            : item.code}
                        </div>
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

                            <div className="flex flex-wrap items-center justify-center gap-2 max-w-full py-1 basis-full sm:basis-auto order-3 sm:order-none">
                              {Array.from({ length: getPaginatedItems(selectedCategory).totalPages }).map((_, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => setCurrentPage(idx)}
                                  className="w-3 h-3 rounded-full transition-[background-color,transform] duration-200 ease-out hover:scale-125"
                                  style={{
                                    background: idx === currentPage ? '#000' : 'rgba(0, 0, 0, 0.2)'
                                  }}
                                  aria-label={`Page ${idx + 1}`}
                                  type="button"
                                />
                              ))}
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

              {/* Model Preview - Always Visible */}
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
                      disabled={!selectedOutfit.tops && !selectedOutfit.bottoms}
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
            </div>
          </motion.div>
          )}

          {/* Saved Outfits View */}
          {currentView === 'outfits' && (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mb-16"
            >
              <div className="max-w-[1200px] mx-auto p-8 md:p-12 rounded-3xl" style={{
                background: 'rgba(255, 255, 255, 0.7)',
                border: '3px solid #000',
                boxShadow: '12px 12px 0 #000'
              }}>
                <div className="mb-8">
                  <h2 className="mb-2" style={{
                    fontSize: 'clamp(32px, 5vw, 48px)',
                    fontWeight: 900,
                    letterSpacing: '-0.02em'
                  }}>
                    SAVED OUTFITS
                  </h2>
                  <p style={{ fontSize: '15px', fontWeight: 500, opacity: 0.7 }}>
                    {savedOutfits.length} saved {savedOutfits.length === 1 ? 'outfit' : 'outfits'}
                  </p>
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
                            <div className="text-xs font-semibold break-words">Top: {outfit.tops.code}</div>
                          )}
                          {outfit.bottoms && (
                            <div className="text-xs font-semibold break-words">Bottom: {outfit.bottoms.code}</div>
                          )}
                          {outfit.accessories && (
                            <div className="text-xs font-semibold break-words">Accessory: {outfit.accessories.code}</div>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t-2 border-black/10 flex flex-wrap items-center justify-between gap-2">
                          <span className="break-words" style={{ fontSize: '10px', opacity: 0.6, fontWeight: 600 }}>
                            {new Date(outfit.savedAt).toLocaleDateString()}
                          </span>
                          <button
                            onClick={() => {
                              setSavedOutfits(prev => prev.filter(o => o.id !== outfit.id));
                              showToast('Outfit removed');
                            }}
                            className="text-xs font-bold hover:opacity-60 active:opacity-50 transition-opacity duration-200 ease-out rounded-sm px-1 -mx-1"
                            type="button"
                          >
                            DELETE
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

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
                initial={false}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: idx * 0.1 }}
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
      <section className="px-6 md:px-12 lg:px-20 py-24">
        <div className="max-w-[1400px] mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Left Column */}
            <motion.div
              initial={false}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
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
              initial={false}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="space-y-6"
            >
              <div className="p-8 rounded-3xl" style={{
                background: '#FFE5C8',
                border: '3px solid #000',
                boxShadow: '8px 8px 0 #000'
              }}>
                <h3 className="mb-4" style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                  DEAD READY
                </h3>
                <p style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
                  Quick outfit picks for every occasion. Morning routine solved.
                </p>
              </div>

              <div className="p-8 rounded-3xl" style={{
                background: '#FFE5C8',
                border: '3px solid #000',
                boxShadow: '8px 8px 0 #000'
              }}>
                <h3 className="mb-4" style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
                  DEMO
                </h3>
                <p className="mb-4" style={{ fontSize: '14px', lineHeight: 1.6, fontWeight: 500 }}>
                  Watch how Clueless transforms your wardrobe management experience.
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  className="w-full py-3 px-6 rounded-full text-white"
                  style={{
                    background: '#000',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.1em'
                  }}
                >
                  WATCH DEMO
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
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
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
                142 ITEMS
              </h2>
              <p className="mb-12" style={{ fontSize: '24px', fontWeight: 700 }}>
                23 CURATED OUTFITS
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: 'TOPS', count: '48' },
                  { label: 'BOTTOMS', count: '32' },
                  { label: 'SHOES', count: '24' },
                  { label: 'ACCESSORIES', count: '38' }
                ].map((stat, idx) => (
                  <motion.div
                    key={idx}
                    initial={false}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
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
      <section className="px-6 md:px-12 lg:px-20 py-24">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-[1000px] mx-auto text-center p-12 md:p-16 rounded-3xl"
          style={{
            background: '#000',
            color: '#fff',
            border: '3px solid #000',
            boxShadow: '12px 12px 0 rgba(0, 0, 0, 0.3)'
          }}
        >
          <h2 className="mb-6 break-words hyphens-auto px-1" style={{
            fontSize: 'clamp(36px, 6vw, 64px)',
            fontWeight: 900,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase'
          }}>
            CLUELESS TRANSFORMED MY WARDROBE MANAGEMENT EXPERIENCE.
            <br />
            THE AI SUGGESTIONS ARE SPOT ON!
          </h2>
          <div className="flex items-center justify-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-pink-300 to-pink-500 border-2 border-white" />
            <div className="text-left">
              <div style={{ fontSize: '14px', fontWeight: 700 }}>Jordan Martinez</div>
              <div style={{ fontSize: '12px', fontWeight: 500, opacity: 0.7 }}>Fashion Enthusiast</div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Final CTA */}
      <section className="px-6 md:px-12 lg:px-20 py-32">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-[900px] mx-auto text-center"
        >
          <h2 className="mb-8" style={{
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
          <p className="mb-12 max-w-[600px] mx-auto" style={{ fontSize: '16px', lineHeight: 1.7, fontWeight: 500 }}>
            Join thousands making the most of what they already own. Start building your digital wardrobe today.
          </p>
          <motion.button
            whileHover={{ scale: 1.05, y: -4 }}
            whileTap={{ scale: 0.98 }}
            className="px-12 py-5 text-white transition-[transform,box-shadow,opacity] duration-200 ease-out rounded-full inline-flex items-center gap-3"
            style={{
              background: '#000',
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '0.1em',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.3)'
            }}
          >
            <span>START NOW</span>
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
          />
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed left-1/2 -translate-x-1/2 z-[220] px-4 sm:px-6 py-3 sm:py-4 rounded-full flex items-center justify-center gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.22)] transition-[opacity,transform] duration-300 ease-out max-w-[min(calc(100vw-2rem),24rem)] bottom-24 sm:bottom-8"
            style={{
              background: toast.type === 'success' ? '#000' : '#dc2626',
              color: '#fff',
              border: '2px solid #000',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)'
            }}
            role="status"
          >
            {toast.type === 'success' && <Check className="w-5 h-5 shrink-0" strokeWidth={2.5} />}
            <span className="text-center break-words text-balance" style={{ fontSize: '14px', fontWeight: 700 }}>
              {toast.message}
            </span>
          </motion.div>
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
