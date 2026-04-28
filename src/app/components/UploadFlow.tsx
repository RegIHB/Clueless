import { useState, useEffect } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Camera, Search, Upload, X, Check, Loader2 } from 'lucide-react';

type PickedProduct = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  attribution?: string;
};

interface UploadFlowProps {
  onClose: () => void;
  onUpload: (item: {
    type: string;
    category: string;
    imageUrl?: string;
    title?: string;
    sourceUrl?: string;
    attribution?: string;
  }) => void;
}

export function UploadFlow({ onClose, onUpload }: UploadFlowProps) {
  const [step, setStep] = useState<'method' | 'picker' | 'details' | 'success'>('method');
  const [detailsBackStep, setDetailsBackStep] = useState<'method' | 'picker'>('method');
  const [selectedCategory, setSelectedCategory] = useState<'tops' | 'bottoms' | 'accessories'>('tops');
  const [selectedType, setSelectedType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerResults, setPickerResults] = useState<PickedProduct[]>([]);
  const [pickerSource, setPickerSource] = useState<string | null>(null);
  const [pickedProduct, setPickedProduct] = useState<PickedProduct | null>(null);

  const categories = {
    tops: ['Top', 'Dress', 'Turtleneck', 'Sweater', 'Jacket', 'Coat', 'Bodysuit'],
    bottoms: ['Pants', 'Shorts', 'Skirt'],
    accessories: ['Hat', 'Scarf', 'Belt', 'Bag']
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 420);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (step !== 'picker') return;
    if (!debouncedQ) {
      setPickerResults([]);
      setPickerSource(null);
      setPickerError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setPickerLoading(true);
      setPickerError(null);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(debouncedQ)}`);
        if (!res.ok) throw new Error('Search failed');
        const data = (await res.json()) as {
          products?: PickedProduct[];
          source?: string | null;
        };
        if (cancelled) return;
        setPickerResults(data.products ?? []);
        setPickerSource(data.source ?? null);
      } catch {
        if (!cancelled) {
          setPickerError('Could not load results. Try again in a moment.');
          setPickerResults([]);
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQ, step]);

  const goToDetailsFromMethod = () => {
    setPickedProduct(null);
    setDetailsBackStep('method');
    setStep('details');
  };

  const goToDetailsFromPicker = () => {
    if (!pickedProduct) return;
    setDetailsBackStep('picker');
    setStep('details');
  };

  const handleUpload = () => {
    if (!selectedType) return;
    onUpload({
      type: selectedType,
      category: selectedCategory,
      ...(pickedProduct
        ? {
            imageUrl: pickedProduct.imageUrl,
            title: pickedProduct.title,
            sourceUrl: pickedProduct.sourceUrl || undefined,
            attribution: pickedProduct.attribution
          }
        : {})
    });
    setStep('success');
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const modalWide = step === 'picker';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      style={{
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)'
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className={`w-full rounded-3xl overflow-hidden ${modalWide ? 'max-w-[min(920px,calc(100vw-2rem))]' : 'max-w-[600px]'}`}
        style={{
          background: '#fff',
          border: '4px solid #000',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
          maxHeight: 'min(90vh, 880px)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="p-6 border-b-3 border-black flex items-center justify-between shrink-0"
          style={{
            background: 'linear-gradient(135deg, #FFE5C8 0%, #FFD4B8 100%)'
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
            ADD TO WARDROBE
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-110"
            style={{ background: '#000', color: '#fff' }}
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>

        <div
          className={`p-8 overflow-y-auto ${step === 'picker' ? 'max-h-[calc(90vh-120px)]' : ''}`}
        >
          {step === 'method' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <p style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.6, marginBottom: '24px' }}>
                Choose how you&apos;d like to add your clothing item:
              </p>

              <button
                onClick={goToDetailsFromMethod}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] transition-transform"
                style={{
                  background: '#FFE5F1',
                  border: '3px solid #000',
                  boxShadow: '4px 4px 0 #000'
                }}
              >
                <Camera className="w-8 h-8 mb-3" strokeWidth={2} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  Take Photo
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Use your camera to capture the item
                </div>
              </button>

              <button
                onClick={goToDetailsFromMethod}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] transition-transform"
                style={{
                  background: '#FFE5C8',
                  border: '3px solid #000',
                  boxShadow: '4px 4px 0 #000'
                }}
              >
                <Upload className="w-8 h-8 mb-3" strokeWidth={2} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  Upload Image
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Select a photo from your device
                </div>
              </button>

              <button
                onClick={() => {
                  setStep('picker');
                  setPickedProduct(null);
                  setSearchInput('');
                  setDebouncedQ('');
                  setPickerResults([]);
                }}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] transition-transform"
                style={{
                  background: '#E0F2FE',
                  border: '3px solid #000',
                  boxShadow: '4px 4px 0 #000'
                }}
              >
                <Search className="w-8 h-8 mb-3" strokeWidth={2} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  Find a product
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Search real photos and add one without leaving the app
                </div>
              </button>
            </motion.div>
          )}

          {step === 'picker' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <p style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.6 }}>
                Search by product name or style. Tap a result to select it, then continue to
                categorize it for your wardrobe.
              </p>

              <div>
                <label
                  htmlFor="product-picker-search"
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    display: 'block',
                    marginBottom: '12px'
                  }}
                >
                  SEARCH
                </label>
                <input
                  id="product-picker-search"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="e.g. navy wool peacoat, leather tote bag"
                  className="w-full px-4 py-3 rounded-xl outline-none"
                  style={{
                    border: '3px solid #000',
                    fontSize: '15px',
                    fontWeight: 500,
                    boxShadow: '4px 4px 0 #000'
                  }}
                  autoComplete="off"
                />
              </div>

              {pickerSource && (
                <p style={{ fontSize: '11px', fontWeight: 600, opacity: 0.55 }}>
                  Results via {pickerSource === 'google' ? 'Google Programmable Search' : 'Openverse'}{' '}
                  (openly licensed and web images). Respect image licenses when using results.
                </p>
              )}

              <div className="min-h-[200px]">
                {pickerLoading && (
                  <div className="flex items-center justify-center gap-2 py-16 text-gray-600">
                    <Loader2 className="w-6 h-6 animate-spin" strokeWidth={2} />
                    <span style={{ fontSize: '14px', fontWeight: 600 }}>Searching…</span>
                  </div>
                )}
                {!pickerLoading && pickerError && (
                  <p className="text-center py-12" style={{ fontSize: '14px', fontWeight: 600, color: '#b91c1c' }}>
                    {pickerError}
                  </p>
                )}
                {!pickerLoading && !pickerError && !debouncedQ && (
                  <p className="text-center py-12" style={{ fontSize: '14px', fontWeight: 500, opacity: 0.55 }}>
                    Type a search to see products and photos.
                  </p>
                )}
                {!pickerLoading && !pickerError && debouncedQ && pickerResults.length === 0 && (
                  <p className="text-center py-12" style={{ fontSize: '14px', fontWeight: 500, opacity: 0.55 }}>
                    No results for that query. Try different keywords.
                  </p>
                )}
                {!pickerLoading && pickerResults.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {pickerResults.map((p) => {
                      const selected = pickedProduct?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPickedProduct(p)}
                          className="rounded-2xl text-left overflow-hidden transition-transform hover:scale-[1.02]"
                          style={{
                            border: selected ? '3px solid #0284c7' : '3px solid #000',
                            boxShadow: selected ? '4px 4px 0 #0284c7' : '4px 4px 0 #000',
                            background: '#fafafa'
                          }}
                        >
                          <div className="relative aspect-square w-full bg-neutral-100">
                            <Image
                              src={p.thumbnailUrl || p.imageUrl}
                              alt={p.title}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 45vw, 200px"
                              unoptimized
                            />
                          </div>
                          <div className="p-2">
                            <div
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                lineHeight: 1.3,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                              }}
                            >
                              {p.title}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('method');
                    setPickedProduct(null);
                  }}
                  className="flex-1 px-6 py-3 rounded-full"
                  style={{
                    background: '#f5f5f5',
                    border: '2px solid #000',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}
                >
                  BACK
                </button>
                <button
                  type="button"
                  onClick={goToDetailsFromPicker}
                  disabled={!pickedProduct}
                  className="flex-1 px-6 py-3 rounded-full text-white disabled:opacity-45"
                  style={{
                    background: '#000',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}
                >
                  CONTINUE
                </button>
              </div>
            </motion.div>
          )}

          {step === 'details' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              {pickedProduct && (
                <div className="flex gap-4 items-start">
                  <div
                    className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0"
                    style={{ border: '2px solid #000' }}
                  >
                    <Image
                      src={pickedProduct.thumbnailUrl || pickedProduct.imageUrl}
                      alt={pickedProduct.title}
                      fill
                      className="object-cover"
                      sizes="96px"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0">
                    <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>
                      SELECTED PRODUCT
                    </p>
                    <p style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.4 }}>{pickedProduct.title}</p>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                  CATEGORY
                </label>
                <div className="flex gap-2">
                  {(['tops', 'bottoms', 'accessories'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setSelectedType('');
                      }}
                      className="flex-1 px-4 py-3 rounded-full transition-all"
                      style={{
                        background: selectedCategory === cat ? '#000' : '#f5f5f5',
                        color: selectedCategory === cat ? '#fff' : '#000',
                        border: '2px solid #000',
                        fontSize: '12px',
                        fontWeight: 700,
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase'
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                  TYPE
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {categories[selectedCategory].map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className="px-4 py-3 rounded-xl text-left transition-all"
                      style={{
                        background: selectedType === type ? '#FFE5F1' : '#fff',
                        border: selectedType === type ? '3px solid #000' : '2px solid rgba(0, 0, 0, 0.1)',
                        fontSize: '14px',
                        fontWeight: 600
                      }}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    if (detailsBackStep === 'picker') {
                      setStep('picker');
                    } else {
                      setStep('method');
                      setPickedProduct(null);
                    }
                  }}
                  className="flex-1 px-6 py-3 rounded-full"
                  style={{
                    background: '#f5f5f5',
                    border: '2px solid #000',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}
                >
                  BACK
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!selectedType}
                  className="flex-1 px-6 py-3 rounded-full text-white disabled:opacity-50"
                  style={{
                    background: '#000',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em'
                  }}
                >
                  ADD ITEM
                </button>
              </div>
            </motion.div>
          )}

          {step === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 15 }}
                className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#fff'
                }}
              >
                <Check className="w-10 h-10" strokeWidth={3} />
              </motion.div>
              <h3 style={{ fontSize: '24px', fontWeight: 900, marginBottom: '8px' }}>
                Item Added!
              </h3>
              <p style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                {selectedType} added to your wardrobe
              </p>
            </motion.div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
