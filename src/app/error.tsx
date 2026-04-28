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
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: '#444', marginBottom: 16, wordBreak: 'break-word' }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: '10px 20px',
            fontWeight: 600,
            borderRadius: 999,
            border: '2px solid #000',
            background: '#FFE5C8',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
