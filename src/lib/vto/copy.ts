export type VtoCopyTone = 'playful' | 'luxe' | 'minimal';

type VtoCopySet = {
  idleUpload: string;
  idlePick: string;
  needPhoto: string;
  queued: string;
  failed: string;
  missingConfig: string;
  analyzingPhoto: string;
  noGarments: string;
  progressValidating: string;
  progressFitting: string;
  progressRefining: string;
  progressLighting: string;
  progressFinalizing: string;
  applyingSingle: string;
  providerInvalid: string;
  completed: string;
  validatingSelected: (codes: string) => string;
  submittingSelected: (count: number) => string;
  applyingMulti: (idx: number, total: number, code?: string) => string;
};

const COPY_BY_TONE: Record<VtoCopyTone, VtoCopySet> = {
  playful: {
    idleUpload: 'Drop a photo and let the style magic begin',
    idlePick: 'Pick your pieces and let us cook',
    needPhoto: 'First things first: add your photo',
    queued: 'Queued up! Getting your style studio ready...',
    failed: 'That look glitched. Tap retry and we got you.',
    missingConfig: 'Style engine is taking a nap. Try again soon.',
    analyzingPhoto: 'Reading the vibe of your photo...',
    noGarments: 'Pick at least one piece and we will spin it up.',
    progressValidating: 'Making sure every piece is runway-ready...',
    progressFitting: 'Tailoring the fit to your pose...',
    progressRefining: 'Smoothing the details like a pro stylist...',
    progressLighting: 'Tuning color and lighting for main-character energy...',
    progressFinalizing: 'Adding the finishing sparkle...',
    applyingSingle: 'Putting your selected piece on the model...',
    providerInvalid: 'We got a weird render back. One more try should fix it.',
    completed: 'Look complete. You are serving.',
    validatingSelected: (codes) => `Quick fit check on ${codes}...`,
    submittingSelected: (count) =>
      `Sending ${count} piece${count === 1 ? '' : 's'} to the glam lab...`,
    applyingMulti: () => 'Layering your look with extra drip...',
  },
  luxe: {
    idleUpload: 'Upload your photo to begin your fitting',
    idlePick: 'Select your pieces to craft the look',
    needPhoto: 'Please upload your photo first',
    queued: 'Your private fitting room is being prepared...',
    failed: 'This render did not meet our standard. Please retry.',
    missingConfig: 'The fitting service is temporarily unavailable.',
    analyzingPhoto: 'Analyzing your photo for precision fit...',
    noGarments: 'Select at least one garment to continue.',
    progressValidating: 'Verifying garment details...',
    progressFitting: 'Draping garments to your silhouette...',
    progressRefining: 'Refining texture and contour...',
    progressLighting: 'Balancing light and tone...',
    progressFinalizing: 'Final polish in progress...',
    applyingSingle: 'Applying your selected garment...',
    providerInvalid: 'The render output was invalid. Please try again.',
    completed: 'Your look is ready.',
    validatingSelected: (codes) => `Validating selected garments: ${codes}...`,
    submittingSelected: (count) =>
      `Submitting ${count} garment${count === 1 ? '' : 's'} for rendering...`,
    applyingMulti: () => 'Composing your final look...',
  },
  minimal: {
    idleUpload: 'Upload a photo to start',
    idlePick: 'Select items to try on',
    needPhoto: 'Upload your photo first',
    queued: 'Queued...',
    failed: 'Generation failed. Retry.',
    missingConfig: 'Try-on service unavailable.',
    analyzingPhoto: 'Analyzing photo...',
    noGarments: 'Select at least one item.',
    progressValidating: 'Validating garments...',
    progressFitting: 'Fitting garments...',
    progressRefining: 'Refining output...',
    progressLighting: 'Balancing lighting...',
    progressFinalizing: 'Finalizing render...',
    applyingSingle: 'Applying garment...',
    providerInvalid: 'Invalid output. Retry.',
    completed: 'Done.',
    validatingSelected: (codes) => `Checking: ${codes}...`,
    submittingSelected: (count) => `Submitting ${count} item${count === 1 ? '' : 's'}...`,
    applyingMulti: () => 'Applying selected items...',
  },
};

export const VTO_COPY_TONE: VtoCopyTone =
  (process.env.NEXT_PUBLIC_VTO_COPY_TONE as VtoCopyTone | undefined) ??
  (process.env.VTO_COPY_TONE as VtoCopyTone | undefined) ??
  'playful';

export function getVtoCopy(tone: VtoCopyTone = VTO_COPY_TONE): VtoCopySet {
  return COPY_BY_TONE[tone] ?? COPY_BY_TONE.playful;
}

export const vtoCopy = getVtoCopy();
