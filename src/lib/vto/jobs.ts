import Replicate from 'replicate';
import type {
  CreateTryOnJobInput,
  TryOnJobSnapshot,
  VtoErrorCode,
  VtoJobStatus,
  VtoStage,
} from '@/lib/vto/contracts';
import { vtoCopy } from '@/lib/vto/copy';

type Listener = (snapshot: TryOnJobSnapshot) => void;

type TryOnJob = {
  id: string;
  ownerUserId: string;
  input: CreateTryOnJobInput;
  status: VtoJobStatus;
  progress: number;
  stage: VtoStage;
  statusMessage: string;
  imageUrl?: string;
  errorCode?: VtoErrorCode;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  listeners: Set<Listener>;
};

type VtoStore = {
  jobs: Map<string, TryOnJob>;
};

const IDM_VTON_MODEL =
  'cuuupid/idm-vton:906425dbca90663ff5427624839572cc56ea7d380343d13e2a4c4b09d3f0c30f';

function getStore(): VtoStore {
  const g = globalThis as typeof globalThis & { __cluelessVtoStore?: VtoStore };
  if (!g.__cluelessVtoStore) {
    g.__cluelessVtoStore = { jobs: new Map() };
  }
  return g.__cluelessVtoStore;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toSnapshot(job: TryOnJob): TryOnJobSnapshot {
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    statusMessage: job.statusMessage,
    imageUrl: job.imageUrl,
    errorCode: job.errorCode,
    errorMessage: job.errorMessage,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function emit(job: TryOnJob): void {
  const snap = toSnapshot(job);
  for (const l of job.listeners) l(snap);
}

function updateJob(
  job: TryOnJob,
  patch: Partial<
    Pick<
      TryOnJob,
      'status' | 'progress' | 'stage' | 'statusMessage' | 'imageUrl' | 'errorCode' | 'errorMessage'
    >
  >
): void {
  Object.assign(job, patch);
  job.updatedAt = nowIso();
  emit(job);
}

function coerceImageForReplicate(url: string): string | Buffer {
  const u = url.trim();
  const data = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i.exec(u);
  if (data) return Buffer.from(data[2], 'base64');
  return u;
}

function extractImageUrl(output: unknown): string | null {
  if (output == null) return null;
  if (typeof output === 'string' && output.startsWith('http')) return output;
  if (Array.isArray(output) && output.length > 0) return extractImageUrl(output[0]);
  if (typeof output === 'object' && output !== null && 'url' in output) {
    const o = output as { url: unknown };
    if (typeof o.url === 'function') {
      try {
        return (o.url as () => URL)().href;
      } catch {
        return null;
      }
    }
    if (typeof o.url === 'string' && o.url.startsWith('http')) return o.url;
  }
  return null;
}

function classifyError(message: string, httpStatus?: number): VtoErrorCode {
  if (httpStatus === 402 || /\b402\b|payment required|insufficient credit/i.test(message)) {
    return 'BILLING';
  }
  if (/timeout|timed out|deadline/i.test(message)) return 'TIMEOUT';
  if (/network|fetch|connection|econn|dns/i.test(message)) return 'NETWORK';
  if (/invalid|image|format|resolution|aspect/i.test(message)) return 'INVALID_IMAGE';
  if (/replicate|provider|model|gpu/i.test(message)) return 'PROVIDER';
  return 'UNKNOWN';
}

export function createTryOnJob(input: CreateTryOnJobInput, ownerUserId: string): TryOnJobSnapshot {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const createdAt = nowIso();
  const job: TryOnJob = {
    id,
    ownerUserId,
    input,
    status: 'queued',
    progress: 5,
    stage: 'processing',
    statusMessage: vtoCopy.queued,
    createdAt,
    updatedAt: createdAt,
    listeners: new Set(),
  };
  getStore().jobs.set(id, job);
  void processTryOnJob(job).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    updateJob(job, {
      status: 'failed',
      progress: 100,
      stage: 'final',
      errorCode: classifyError(msg),
      errorMessage: msg,
      statusMessage: vtoCopy.failed,
    });
  });
  return toSnapshot(job);
}

export function getTryOnJob(jobId: string, ownerUserId: string): TryOnJobSnapshot | null {
  const job = getStore().jobs.get(jobId);
  if (job && job.ownerUserId !== ownerUserId) return null;
  return job ? toSnapshot(job) : null;
}

export function subscribeTryOnJob(
  jobId: string,
  ownerUserId: string,
  listener: Listener
): (() => void) | null {
  const job = getStore().jobs.get(jobId);
  if (job && job.ownerUserId !== ownerUserId) return null;
  if (!job) return null;
  job.listeners.add(listener);
  listener(toSnapshot(job));
  return () => {
    job.listeners.delete(listener);
  };
}

async function processTryOnJob(job: TryOnJob): Promise<void> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    updateJob(job, {
      status: 'failed',
      progress: 100,
      stage: 'final',
      errorCode: 'PROVIDER',
      errorMessage: 'Missing REPLICATE_API_TOKEN',
      statusMessage: vtoCopy.missingConfig,
    });
    return;
  }

  updateJob(job, {
    status: 'processing',
    progress: 12,
    stage: 'processing',
    statusMessage: vtoCopy.analyzingPhoto,
  });

  const garments =
    job.input.garments && job.input.garments.length > 0
      ? job.input.garments
      : job.input.garmentImageUrl
        ? [
            {
              imageUrl: job.input.garmentImageUrl,
              category: job.input.category ?? 'upper_body',
              prompt: job.input.prompt,
            },
          ]
        : [];

  if (garments.length === 0) {
    updateJob(job, {
      status: 'failed',
      progress: 100,
      stage: 'final',
      errorCode: 'INVALID_IMAGE',
      errorMessage: 'No garment selected for try-on.',
      statusMessage: vtoCopy.noGarments,
    });
    return;
  }

  const progressiveStatus: Array<{ delayMs: number; progress: number; message: string; stage: VtoStage }> = [
    { delayMs: 600, progress: 24, message: vtoCopy.progressValidating, stage: 'processing' },
    { delayMs: 1200, progress: 38, message: vtoCopy.progressFitting, stage: 'generating' },
    { delayMs: 1800, progress: 54, message: vtoCopy.progressRefining, stage: 'generating' },
    { delayMs: 2400, progress: 68, message: vtoCopy.progressLighting, stage: 'generating' },
    { delayMs: 3200, progress: 82, message: vtoCopy.progressFinalizing, stage: 'generating' },
  ];

  const timers = progressiveStatus.map(({ delayMs, progress, message, stage }) =>
    setTimeout(() => {
      if (job.status !== 'processing') return;
      if (progress > job.progress) {
        updateJob(job, { progress, statusMessage: message, stage });
      }
    }, delayMs)
  );

  try {
    const replicate = new Replicate({ auth: token });
    let currentPersonImage = job.input.personImageUrl;
    let imageUrl: string | null = null;
    const progressFloor = 24;
    const progressCeiling = 96;

    for (let idx = 0; idx < garments.length; idx += 1) {
      const garment = garments[idx];
      updateJob(job, {
        stage: 'generating',
        statusMessage:
          garments.length === 1
            ? vtoCopy.applyingSingle
            : vtoCopy.applyingMulti(idx + 1, garments.length, garment.code),
        progress: Math.max(
          job.progress,
          progressFloor + Math.round(((idx + 0.3) / garments.length) * (progressCeiling - progressFloor))
        ),
      });
      const runPromise = replicate.run(IDM_VTON_MODEL, {
        input: {
          human_img: coerceImageForReplicate(currentPersonImage),
          garm_img: coerceImageForReplicate(garment.imageUrl),
          garment_des: (garment.prompt ?? job.input.prompt ?? 'garment').slice(0, 500),
          category: garment.category,
          crop: job.input.crop ?? true,
          steps: Math.max(20, Math.min(40, job.input.steps ?? 36)),
        },
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Try-on provider timed out after 90s')), 90000)
      );
      const rawOutput = await Promise.race([runPromise, timeoutPromise]);
      imageUrl = extractImageUrl(rawOutput);
      if (!imageUrl) {
        updateJob(job, {
          status: 'failed',
          progress: 100,
          stage: 'final',
          errorCode: 'PROVIDER',
          errorMessage: 'Model finished but output format was unexpected.',
          statusMessage: vtoCopy.providerInvalid,
        });
        return;
      }
      currentPersonImage = imageUrl;
      updateJob(job, {
        progress: Math.max(
          job.progress,
          progressFloor + Math.round(((idx + 1) / garments.length) * (progressCeiling - progressFloor))
        ),
      });
    }

    if (!imageUrl) {
      updateJob(job, {
        status: 'failed',
        progress: 100,
        stage: 'final',
        errorCode: 'PROVIDER',
        errorMessage: 'Try-on job completed without an image.',
        statusMessage: vtoCopy.providerInvalid,
      });
      return;
    }

    updateJob(job, {
      status: 'completed',
      progress: 100,
      stage: 'final',
      imageUrl,
      statusMessage: vtoCopy.completed,
    });
  } catch (error) {
    let httpStatus: number | undefined;
    let apiDetail: string | undefined;
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      error.response instanceof Response
    ) {
      httpStatus = error.response.status;
      try {
        const j = (await error.response.clone().json()) as { detail?: string; title?: string };
        apiDetail = j.detail ?? j.title;
      } catch {
        // ignore parse failures
      }
    }
    const message = `${error instanceof Error ? error.message : String(error)} ${apiDetail ?? ''}`.trim();
    updateJob(job, {
      status: 'failed',
      progress: 100,
      stage: 'final',
      errorCode: classifyError(message, httpStatus),
      errorMessage: message,
      statusMessage: vtoCopy.failed,
    });
  } finally {
    for (const t of timers) clearTimeout(t);
  }
}

