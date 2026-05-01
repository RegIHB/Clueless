'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center px-6 py-12"
      style={{
        background: 'linear-gradient(180deg, #FFB3D9 0%, #FFE5F1 100%)',
      }}
    >
      <div
        className="max-w-[480px] w-full text-center p-8 md:p-10 rounded-3xl transition-shadow duration-200"
        style={{
          background: 'rgba(255, 255, 255, 0.85)',
          border: '3px solid #000',
          boxShadow: '8px 8px 0 #000',
        }}
      >
        <h1 className="mb-3 font-black tracking-tight uppercase" style={{ fontSize: 'clamp(1.25rem, 4vw, 1.5rem)' }}>
          Something went wrong
        </h1>
        <p className="mb-6 text-black/75 break-words leading-relaxed" style={{ fontSize: '15px', fontWeight: 500 }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="px-8 py-3 rounded-full font-bold tracking-wide transition-[transform,opacity] duration-200 ease-out hover:opacity-90 active:scale-[0.98]"
          style={{
            border: '2px solid #000',
            background: '#FFE5C8',
            fontSize: '13px',
            letterSpacing: '0.05em',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
