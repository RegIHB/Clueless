import {
  preload,
  removeBackground as imglyRemoveBackground,
  type Config,
} from '@imgly/background-removal';

const BACKGROUND_REMOVAL_TIMEOUT_MS = 8_000;
const BACKGROUND_REMOVAL_CONFIG = {
  output: { format: 'image/png' },
} satisfies Config;

let preloadPromise: Promise<void> | null = null;

export function preloadBackgroundRemoval(): Promise<void> {
  if (!preloadPromise) {
    preloadPromise = preload(BACKGROUND_REMOVAL_CONFIG).catch((error) => {
      preloadPromise = null;
      console.warn('Background removal model preload failed.', error);
      throw error;
    });
  }
  return preloadPromise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Background removal timed out.')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

export async function removeBackground(imageFile: File | Blob): Promise<Blob> {
  try {
    return await withTimeout(
      preloadBackgroundRemoval().then(() => imglyRemoveBackground(imageFile, BACKGROUND_REMOVAL_CONFIG)),
      BACKGROUND_REMOVAL_TIMEOUT_MS
    );
  } catch (error) {
    console.warn('Background removal failed; using original image.', error);
    return imageFile;
  }
}
