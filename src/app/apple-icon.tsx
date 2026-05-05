import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32" fill="none">
          <path
            d="M21.14 9.87 A8 8 0 1 0 21.14 22.13"
            stroke="#FFE5C8"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    ),
    size
  );
}
