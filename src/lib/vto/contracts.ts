export type VtoStage = 'upload' | 'validation' | 'processing' | 'generating' | 'final';

export type VtoJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type VtoErrorCode =
  | 'INVALID_IMAGE'
  | 'NETWORK'
  | 'PROVIDER'
  | 'BILLING'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface TryOnGarmentInput {
  imageUrl: string;
  category: 'upper_body' | 'lower_body' | 'dresses';
  prompt?: string;
  code?: string;
}

export interface CreateTryOnJobInput {
  personImageUrl: string;
  garments?: TryOnGarmentInput[];
  garmentImageUrl?: string;
  prompt?: string;
  category?: 'upper_body' | 'lower_body' | 'dresses';
  crop?: boolean;
  steps?: number;
}

export interface CreateTryOnJobResponse {
  jobId: string;
  status: VtoJobStatus;
  progress: number;
  stage: VtoStage;
  statusMessage: string;
}

export interface TryOnJobSnapshot {
  jobId: string;
  status: VtoJobStatus;
  progress: number;
  stage: VtoStage;
  statusMessage: string;
  imageUrl?: string;
  errorCode?: VtoErrorCode;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

