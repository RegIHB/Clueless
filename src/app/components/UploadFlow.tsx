import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion } from 'motion/react';
import { Camera, Search, Upload, X, Check, ScanBarcode } from 'lucide-react';
import { Skeleton } from './ui/skeleton';
import { BarcodeScanner } from './BarcodeScanner';
import { preloadBackgroundRemoval, removeBackground } from '@/lib/removeBackground';

type PickedProduct = {
  id: string;
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  attribution?: string;
};

type PickedLocalImage = {
  imageUrl: string;
  title: string;
};

const MAX_LOCAL_IMAGE_CHARS = 8000;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const COMPRESSION_ATTEMPTS = [
  { maxEdge: 320, quality: 0.7 },
  { maxEdge: 256, quality: 0.66 },
  { maxEdge: 224, quality: 0.6 },
  { maxEdge: 192, quality: 0.56 },
  { maxEdge: 160, quality: 0.5 },
];

function fileTitle(file: File): string {
  return file.name.replace(/\.[^.]+$/, '').trim() || 'Uploaded wardrobe photo';
}

function validateUploadImage(file: Blob): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Image is too large. Choose a photo under 10 MB.');
  }
}

function loadImageFromFile(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image could not be loaded'));
    };
    image.src = objectUrl;
  });
}

async function compressFileToDataUrl(file: Blob): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }

  const image = await loadImageFromFile(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is not available in this browser.');

  for (const attempt of COMPRESSION_ATTEMPTS) {
    const scale = Math.min(1, attempt.maxEdge / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/webp', attempt.quality);
    if (dataUrl.length <= MAX_LOCAL_IMAGE_CHARS) return dataUrl;
  }

  throw new Error('Could not compress this image enough. Try a simpler or smaller photo.');
}

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
  const [step, setStep] = useState<'method' | 'picker' | 'scan' | 'barcode' | 'details' | 'success'>('method');
  const [detailsBackStep, setDetailsBackStep] = useState<'method' | 'picker' | 'scan' | 'barcode'>('method');
  const [selectedCategory, setSelectedCategory] = useState<'tops' | 'bottoms' | 'outerwear' | 'footwear' | 'accessories'>('tops');
  const [selectedType, setSelectedType] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerResults, setPickerResults] = useState<PickedProduct[]>([]);
  const [pickerSource, setPickerSource] = useState<string | null>(null);
  const [photoResults, setPhotoResults] = useState<PickedProduct[]>([]);
  const [photoSource, setPhotoSource] = useState<string | null>(null);
  const [barcodeResults, setBarcodeResults] = useState<PickedProduct[]>([]);
  const [barcodeSource, setBarcodeSource] = useState<string | null>(null);
  const [pickedProduct, setPickedProduct] = useState<PickedProduct | null>(null);
  const [pickedLocalImage, setPickedLocalImage] = useState<PickedLocalImage | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoSuggestedQuery, setPhotoSuggestedQuery] = useState<string | null>(null);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [barcodeScanned, setBarcodeScanned] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const photoSearchRequestIdRef = useRef(0);

  const categories = {
    tops: ['Top', 'Dress', 'Turtleneck', 'Sweater', 'Bodysuit'],
    bottoms: ['Pants', 'Shorts', 'Skirt'],
    outerwear: ['Jacket', 'Coat', 'Blazer', 'Vest', 'Hoodie'],
    footwear: ['Sneakers', 'Boots', 'Heels', 'Sandals', 'Flats', 'Loafers'],
    accessories: ['Hat', 'Scarf', 'Belt', 'Bag', 'Sunglasses', 'Jewellery']
  };

  useEffect(() => {
    void preloadBackgroundRemoval().catch(() => undefined);
  }, []);

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

  useEffect(() => {
    if (step !== 'scan' || !pickedLocalImage?.imageUrl) return;

    const requestId = ++photoSearchRequestIdRef.current;
    setPhotoLoading(true);
    setPhotoError(null);
    setPhotoResults([]);
    setPhotoSource(null);
    setPickedProduct(null);
    setPhotoSuggestedQuery(null);

    (async () => {
      try {
        const res = await fetch('/api/products/visual-search', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageDataUrl: pickedLocalImage.imageUrl }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          products?: PickedProduct[];
          source?: string | null;
          suggestedQuery?: string | null;
          suggestedCategory?: 'tops' | 'bottoms' | 'outerwear' | 'footwear' | 'accessories' | null;
          suggestedType?: string | null;
          error?: { message?: string };
        };
        if (requestId !== photoSearchRequestIdRef.current) return;

        if (!res.ok) {
          setPhotoError(data.error?.message ?? 'Could not search by photo.');
          return;
        }

        setPhotoResults(data.products ?? []);
        setPhotoSource(data.source ?? null);
        setPhotoSuggestedQuery(data.suggestedQuery ?? null);
        if (data.suggestedCategory) setSelectedCategory(data.suggestedCategory);
        if (data.suggestedType) setSelectedType(data.suggestedType);
      } catch {
        if (requestId !== photoSearchRequestIdRef.current) return;
        setPhotoError('Could not search by photo. Check your connection and try again.');
      } finally {
        if (requestId === photoSearchRequestIdRef.current) setPhotoLoading(false);
      }
    })();
  }, [step, pickedLocalImage?.imageUrl]);

  const goToDetailsFromMethod = () => {
    setPickedProduct(null);
    setPickedLocalImage(null);
    setDetailsBackStep('method');
    setStep('details');
  };

  const goToDetailsFromPicker = () => {
    if (!pickedProduct) return;
    setPickedLocalImage(null);
    setDetailsBackStep('picker');
    setStep('details');
  };

  const goToDetailsFromScan = (useProduct: boolean) => {
    if (useProduct && pickedProduct) {
      setPickedLocalImage(null);
    } else {
      setPickedProduct(null);
    }
    setDetailsBackStep('scan');
    setStep('details');
  };

  const goToDetailsFromBarcode = () => {
    if (!pickedProduct) return;
    setPickedLocalImage(null);
    setDetailsBackStep('barcode');
    setStep('details');
  };

  const goToDetailsFromBarcodeWithProduct = (product: PickedProduct) => {
    setPickedProduct(product);
    setPickedLocalImage(null);
    setDetailsBackStep('barcode');
    setStep('details');
  };

  const lookupBarcode = async (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8) {
      setBarcodeError('Enter at least 8 digits from the tag barcode.');
      return;
    }

    setBarcodeLoading(true);
    setBarcodeError(null);
    setBarcodeResults([]);
    setBarcodeSource(null);
    setPickedProduct(null);
    setPickedLocalImage(null);
    setBarcodeScanned(digits);

    try {
      const res = await fetch(`/api/products/barcode?upc=${encodeURIComponent(digits)}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        products?: PickedProduct[];
        source?: string | null;
        error?: { message?: string };
      };

      if (!res.ok) {
        setBarcodeError(data.error?.message ?? 'Barcode lookup failed.');
        return;
      }

      const products = data.products ?? [];
      setBarcodeResults(products);
      setBarcodeSource(data.source ?? null);

      if (products.length === 0) {
        setBarcodeError(
          'No product in the database for this barcode. Check the digits on the tag, or use Take Photo to search by how the item looks.'
        );
        return;
      }

      if (products.length === 1) {
        goToDetailsFromBarcodeWithProduct(products[0]);
      }
    } catch {
      setBarcodeError('Could not look up this barcode. Check your connection and try again.');
    } finally {
      setBarcodeLoading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setFileLoading(true);
    setFileError(null);
    try {
      validateUploadImage(file);
      setFileLoading(false);

      setRemovingBg(true);
      const cleanedImage = await removeBackground(file);
      setRemovingBg(false);

      setFileLoading(true);
      const imageUrl = await compressFileToDataUrl(cleanedImage);
      setFileLoading(false);

      setPickedProduct(null);
      setBarcodeResults([]);
      setBarcodeSource(null);
      setPickedLocalImage({ imageUrl, title: fileTitle(file) });
      setSelectedType('');
      setStep('scan');
    } catch (error) {
      setFileLoading(false);
      setRemovingBg(false);
      setFileError(error instanceof Error ? error.message : 'Could not read that image.');
    }
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
        : pickedLocalImage
          ? {
              imageUrl: pickedLocalImage.imageUrl,
              title: pickedLocalImage.title,
            }
          : {})
    });
    setStep('success');
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const modalWide =
    step === 'picker' || step === 'scan' || (step === 'barcode' && barcodeResults.length > 0);

  const sourceLabel = (source: string | null) => {
    if (!source) return null;
    if (source === 'upcitemdb') return 'UPC product database';
    if (source === 'serpapi') return 'Google Shopping (SerpApi)';
    if (source === 'google_lens') return 'Google Lens (SerpApi)';
    if (source === 'google') return 'Google Programmable Search';
    if (source === 'vision') return 'AI image analysis + shopping search';
    return 'Openverse';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6 overflow-y-auto overscroll-contain"
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
        className={`w-full rounded-3xl overflow-hidden flex flex-col my-auto max-h-[min(90vh,100dvh-1rem)] ${modalWide ? 'max-w-[min(920px,calc(100vw-2rem))]' : 'max-w-[600px]'}`}
        style={{
          background: 'var(--clue-surface)',
          border: '4px solid var(--clue-border)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="p-4 sm:p-6 border-b-4 border-[var(--clue-border)] flex items-center justify-between gap-3 shrink-0 min-w-0"
          style={{
            background: 'linear-gradient(135deg, #FFE5C8 0%, #FFD4B8 100%)'
          }}
        >
          <h2 className="min-w-0 break-words pr-2" style={{ fontSize: '20px', fontWeight: 900, letterSpacing: '-0.01em' }}>
            ADD TO WARDROBE
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-transform duration-200 ease-out hover:scale-110 active:scale-95"
            style={{ background: 'var(--clue-inverse)', color: 'var(--clue-inverse-text)' }}
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 sm:p-8"
        >
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={uploadInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
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
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={fileLoading || removingBg}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] active:scale-[0.99] transition-transform duration-200 ease-out"
                style={{
                  background: '#FFE5F1',
                  border: '3px solid var(--clue-border)',
                  boxShadow: 'var(--clue-shadow-sm)'
                }}
              >
                <Camera className="w-8 h-8 mb-3" strokeWidth={2} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  Take Photo
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Visual search — find similar items by how it looks
                </div>
              </button>

              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                disabled={fileLoading || removingBg}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] active:scale-[0.99] transition-transform duration-200 ease-out"
                style={{
                  background: 'var(--clue-surface-warm)',
                  border: '3px solid var(--clue-border)',
                  boxShadow: 'var(--clue-shadow-sm)'
                }}
              >
                <Upload className="w-8 h-8 mb-3" strokeWidth={2} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  Upload Image
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Visual search — same as Take Photo, from your gallery
                </div>
              </button>

              {fileLoading && (
                <p role="status" style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7 }}>
                  Preparing your image…
                </p>
              )}
              {removingBg && (
                <p role="status" style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7 }}>
                  Cleaning up image...
                </p>
              )}
              {fileError && (
                <p role="alert" style={{ fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>
                  {fileError}
                </p>
              )}

              <button
                type="button"
                onClick={() => {
                  setStep('barcode');
                  setBarcodeInput('');
                  setBarcodeError(null);
                  setBarcodeScanned(null);
                  setBarcodeResults([]);
                  setBarcodeSource(null);
                  setPickedProduct(null);
                  setPickedLocalImage(null);
                  setPhotoResults([]);
                  setPhotoSource(null);
                }}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] active:scale-[0.99] transition-transform duration-200 ease-out"
                style={{
                  background: '#EDE9FE',
                  border: '3px solid var(--clue-border)',
                  boxShadow: 'var(--clue-shadow-sm)',
                }}
              >
                <ScanBarcode className="w-8 h-8 mb-3" strokeWidth={2} />
                <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                  Scan barcode
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, opacity: 0.7 }}>
                  Product lookup — exact item from the UPC on the tag
                </div>
              </button>

              <button
                onClick={() => {
                  setStep('picker');
                  setPickedProduct(null);
                  setPickedLocalImage(null);
                  setSearchInput('');
                  setDebouncedQ('');
                  setPickerResults([]);
                }}
                className="w-full p-6 rounded-2xl text-left hover:scale-[1.02] active:scale-[0.99] transition-transform duration-200 ease-out"
                style={{
                  background: '#E0F2FE',
                  border: '3px solid var(--clue-border)',
                  boxShadow: 'var(--clue-shadow-sm)'
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
                Search for clothing and wearable accessories (tops, bottoms, shoes, bags, etc.).
                Results are filtered to fashion and apparel. Tap a result, then categorize it.
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
                  placeholder="e.g. navy wool peacoat, white cotton tee, running sneakers"
                  className="w-full px-4 py-3 rounded-xl outline-none transition-[box-shadow,border-color] duration-200 ease-out"
                  style={{
                    border: '3px solid var(--clue-border)',
                    fontSize: '15px',
                    fontWeight: 500,
                    boxShadow: 'var(--clue-shadow-sm)'
                  }}
                  autoComplete="off"
                />
              </div>

              {pickerSource && (
                <p style={{ fontSize: '11px', fontWeight: 600, opacity: 0.55 }}>
                  Results via{' '}
                  {pickerSource === 'serpapi'
                    ? 'Google Shopping (SerpApi)'
                    : pickerSource === 'google'
                      ? 'Google Programmable Search'
                      : 'Openverse'}{' '}
                  {pickerSource === 'serpapi'
                    ? '— product listings; check retailer for accuracy.'
                    : '(openly licensed / web images). Respect licenses when using results.'}
                </p>
              )}

              <div className="min-h-[200px]" aria-live="polite" aria-busy={pickerLoading}>
                {pickerLoading && (
                  <>
                    <span className="sr-only">Searching…</span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-2xl overflow-hidden"
                          style={{ border: '3px solid var(--clue-border)', boxShadow: 'var(--clue-shadow-sm)', background: 'var(--clue-surface-muted)' }}
                        >
                          <Skeleton className="aspect-square w-full rounded-none" />
                          <div className="p-2 space-y-1.5">
                            <Skeleton className="h-3 w-[90%]" />
                            <Skeleton className="h-3 w-[60%]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {!pickerLoading && pickerError && (
                  <p className="text-center py-12" role="alert" style={{ fontSize: '14px', fontWeight: 600, color: '#b91c1c' }}>
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
                    No clothing results for that query. Try naming the garment (e.g. &ldquo;denim
                    jacket&rdquo;, &ldquo;pleated skirt&rdquo;).
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
                          className="rounded-2xl text-left overflow-hidden transition-[transform,box-shadow] duration-200 ease-out hover:scale-[1.02] active:scale-[0.99]"
                          style={{
                            border: selected ? '3px solid #0284c7' : '3px solid var(--clue-border)',
                            boxShadow: selected ? '4px 4px 0 #0284c7' : 'var(--clue-shadow-sm)',
                            background: 'var(--clue-surface-muted)'
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
                    background: 'var(--clue-surface-muted)',
                    border: '2px solid var(--clue-border)',
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
                  className="flex-1 px-6 py-3 rounded-full text-[var(--clue-inverse-text)] disabled:opacity-45"
                  style={{
                    background: 'var(--clue-inverse)',
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

          {step === 'barcode' && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <p style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.6 }}>
                Scan the UPC or EAN on the tag. This looks up the registered product only — not a
                photo search.
              </p>

              <BarcodeScanner
                active={step === 'barcode' && !barcodeLoading && barcodeResults.length === 0}
                onDetected={(code) => {
                  setBarcodeInput(code);
                  void lookupBarcode(code);
                }}
                onError={(msg) => setBarcodeError(msg)}
              />

              <div>
                <label
                  htmlFor="barcode-manual"
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    display: 'block',
                    marginBottom: '12px',
                  }}
                >
                  OR ENTER BARCODE
                </label>
                <div className="flex gap-2">
                  <input
                    id="barcode-manual"
                    type="text"
                    inputMode="numeric"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="8–14 digit UPC / EAN"
                    className="flex-1 px-4 py-3 rounded-xl outline-none"
                    style={{
                      border: '3px solid var(--clue-border)',
                      fontSize: '15px',
                      fontWeight: 500,
                      boxShadow: 'var(--clue-shadow-sm)',
                    }}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    disabled={barcodeLoading || barcodeInput.replace(/\D/g, '').length < 8}
                    onClick={() => void lookupBarcode(barcodeInput)}
                    className="px-5 py-3 rounded-xl text-[var(--clue-inverse-text)] disabled:opacity-45 shrink-0"
                    style={{
                      background: 'var(--clue-inverse)',
                      fontSize: '13px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                    }}
                  >
                    LOOK UP
                  </button>
                </div>
              </div>

              {barcodeScanned && (
                <p style={{ fontSize: '12px', fontWeight: 600, opacity: 0.65 }}>
                  Barcode: {barcodeScanned}
                </p>
              )}

              {barcodeLoading && (
                <p role="status" style={{ fontSize: '13px', fontWeight: 600, opacity: 0.7 }}>
                  Looking up product…
                </p>
              )}

              {barcodeError && (
                <p role="alert" style={{ fontSize: '13px', fontWeight: 700, color: '#b91c1c' }}>
                  {barcodeError}
                </p>
              )}

              {barcodeSource && barcodeResults.length > 1 && (
                <p style={{ fontSize: '11px', fontWeight: 600, opacity: 0.55 }}>
                  Results via {sourceLabel(barcodeSource)}
                </p>
              )}

              {barcodeResults.length > 1 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {barcodeResults.map((p) => {
                    const selected = pickedProduct?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPickedProduct(p)}
                        className="rounded-2xl text-left overflow-hidden transition-[transform,box-shadow] duration-200 ease-out hover:scale-[1.02] active:scale-[0.99]"
                        style={{
                          border: selected ? '3px solid #0284c7' : '3px solid var(--clue-border)',
                          boxShadow: selected ? '4px 4px 0 #0284c7' : 'var(--clue-shadow-sm)',
                          background: 'var(--clue-surface-muted)',
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
                              overflow: 'hidden',
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

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('method');
                    setBarcodeInput('');
                    setBarcodeError(null);
                    setBarcodeResults([]);
                    setBarcodeSource(null);
                  }}
                  className="flex-1 px-6 py-3 rounded-full"
                  style={{
                    background: 'var(--clue-surface-muted)',
                    border: '2px solid var(--clue-border)',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}
                >
                  BACK
                </button>
                {barcodeResults.length > 1 && (
                  <button
                    type="button"
                    onClick={goToDetailsFromBarcode}
                    disabled={!pickedProduct}
                    className="flex-1 px-6 py-3 rounded-full text-[var(--clue-inverse-text)] disabled:opacity-45"
                    style={{
                      background: 'var(--clue-inverse)',
                      fontSize: '14px',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                    }}
                  >
                    CONTINUE
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {step === 'scan' && pickedLocalImage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-5"
            >
              <p style={{ fontSize: '15px', fontWeight: 500, lineHeight: 1.6 }}>
                Searching by photo (visual match). Pick a similar product online, or keep your
                picture as-is.
              </p>

              <motion.div className="flex gap-4 items-start">
                <div
                  className="relative w-28 h-28 rounded-xl overflow-hidden shrink-0"
                  style={{ border: '3px solid var(--clue-border)', boxShadow: 'var(--clue-shadow-sm)' }}
                >
                  <Image
                    src={pickedLocalImage.imageUrl}
                    alt="Your scan"
                    fill
                    className="object-cover"
                    sizes="112px"
                    unoptimized
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>
                    YOUR SCAN
                  </p>
                  {photoSuggestedQuery && (
                    <p style={{ fontSize: '13px', fontWeight: 500, opacity: 0.75, lineHeight: 1.5 }}>
                      Detected: &ldquo;{photoSuggestedQuery}&rdquo;
                    </p>
                  )}
                </div>
              </motion.div>

              {photoSource && (
                <p style={{ fontSize: '11px', fontWeight: 600, opacity: 0.55 }}>
                  Results via {sourceLabel(photoSource)}
                  {photoSource === 'serpapi' || photoSource === 'google_lens'
                    ? ' — check retailer listings for accuracy.'
                    : '.'}
                </p>
              )}

              <motion.div className="min-h-[200px]" aria-live="polite" aria-busy={photoLoading}>
                {photoLoading && (
                  <>
                    <span className="sr-only">Searching by photo…</span>
                    <motion.div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="rounded-2xl overflow-hidden"
                          style={{ border: '3px solid var(--clue-border)', boxShadow: 'var(--clue-shadow-sm)', background: 'var(--clue-surface-muted)' }}
                        >
                          <Skeleton className="aspect-square w-full rounded-none" />
                          <div className="p-2 space-y-1.5">
                            <Skeleton className="h-3 w-[90%]" />
                            <Skeleton className="h-3 w-[60%]" />
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  </>
                )}
                {!photoLoading && photoError && (
                  <p className="text-center py-8" role="alert" style={{ fontSize: '14px', fontWeight: 600, color: '#b91c1c' }}>
                    {photoError}
                  </p>
                )}
                {!photoLoading && !photoError && photoResults.length === 0 && (
                  <p className="text-center py-8" style={{ fontSize: '14px', fontWeight: 500, opacity: 0.55 }}>
                    No close matches found. You can still add your photo to the wardrobe.
                  </p>
                )}
                {!photoLoading && photoResults.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photoResults.map((p) => {
                      const selected = pickedProduct?.id === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPickedProduct(p)}
                          className="rounded-2xl text-left overflow-hidden transition-[transform,box-shadow] duration-200 ease-out hover:scale-[1.02] active:scale-[0.99]"
                          style={{
                            border: selected ? '3px solid #0284c7' : '3px solid var(--clue-border)',
                            boxShadow: selected ? '4px 4px 0 #0284c7' : 'var(--clue-shadow-sm)',
                            background: 'var(--clue-surface-muted)',
                          }}
                        >
                          <motion.div className="relative aspect-square w-full bg-neutral-100">
                            <Image
                              src={p.thumbnailUrl || p.imageUrl}
                              alt={p.title}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 45vw, 200px"
                              unoptimized
                            />
                          </motion.div>
                          <div className="p-2">
                            <div
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                lineHeight: 1.3,
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
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
              </motion.div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('method');
                    setPickedLocalImage(null);
                    setPickedProduct(null);
                  }}
                  className="flex-1 px-6 py-3 rounded-full"
                  style={{
                    background: 'var(--clue-surface-muted)',
                    border: '2px solid var(--clue-border)',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}
                >
                  BACK
                </button>
                <button
                  type="button"
                  onClick={() => goToDetailsFromScan(false)}
                  className="flex-1 px-6 py-3 rounded-full"
                  style={{
                    background: 'var(--clue-surface)',
                    border: '2px solid var(--clue-border)',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}
                >
                  USE MY PHOTO
                </button>
                <button
                  type="button"
                  onClick={() => goToDetailsFromScan(true)}
                  disabled={!pickedProduct}
                  className="flex-1 px-6 py-3 rounded-full text-[var(--clue-inverse-text)] disabled:opacity-45"
                  style={{
                    background: 'var(--clue-inverse)',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                  }}
                >
                  USE SELECTED
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
              {(pickedProduct || pickedLocalImage) && (
                <div className="flex gap-4 items-start">
                  <div
                    className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0"
                    style={{ border: '2px solid var(--clue-border)' }}
                  >
                    <Image
                      src={pickedProduct?.thumbnailUrl || pickedProduct?.imageUrl || pickedLocalImage?.imageUrl || ''}
                      alt={pickedProduct?.title || pickedLocalImage?.title || 'Selected wardrobe image'}
                      fill
                      className="object-cover"
                      sizes="96px"
                      unoptimized
                    />
                  </div>
                  <div className="min-w-0">
                    <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 6 }}>
                      {pickedProduct ? 'SELECTED PRODUCT' : 'SELECTED PHOTO'}
                    </p>
                    <p style={{ fontSize: '14px', fontWeight: 600, lineHeight: 1.4 }}>
                      {pickedProduct?.title || pickedLocalImage?.title}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', display: 'block', marginBottom: '12px' }}>
                  CATEGORY
                </label>
                <div className="flex gap-2">
                  {(['tops', 'bottoms', 'outerwear', 'footwear', 'accessories'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setSelectedType('');
                      }}
                      className="flex-1 px-4 py-3 rounded-full transition-colors duration-200 ease-out"
                      style={{
                        background: selectedCategory === cat ? 'var(--clue-inverse)' : 'var(--clue-surface-muted)',
                        color: selectedCategory === cat ? 'var(--clue-inverse-text)' : 'var(--clue-text)',
                        border: '2px solid var(--clue-border)',
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
                      className="px-4 py-3 rounded-xl text-left transition-colors duration-200 ease-out"
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
                    } else if (detailsBackStep === 'scan') {
                      setStep('scan');
                    } else if (detailsBackStep === 'barcode') {
                      setStep('barcode');
                    } else {
                      setStep('method');
                      setPickedProduct(null);
                      setPickedLocalImage(null);
                    }
                  }}
                  className="flex-1 px-6 py-3 rounded-full"
                  style={{
                    background: 'var(--clue-surface-muted)',
                    border: '2px solid var(--clue-border)',
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
                  className="flex-1 px-6 py-3 rounded-full text-[var(--clue-inverse-text)] disabled:opacity-50"
                  style={{
                    background: 'var(--clue-inverse)',
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
                  color: 'var(--clue-inverse-text)'
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
