import { ImageResponse } from 'next/og';

// Image metadata
export const alt =
  'Invoice Forge - The fastest way to create, send, and track professional invoices.';
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

/**
 * Dynamic OpenGraph image generation - Visual twin of Hero component
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */
export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#000000',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '60px',
      }}
    >
      {/* Centered Card Container */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          background: 'rgba(0, 0, 0, 0.4)',
          border: '2px solid rgba(168, 85, 247, 0.3)',
          borderRadius: '24px',
          padding: '64px 80px',
          maxWidth: '1000px',
          width: '100%',
          height: '100%',
          boxShadow:
            '0 0 60px rgba(168, 85, 247, 0.3), 0 0 100px rgba(236, 72, 153, 0.2)',
        }}
      >
        {/* Headline */}
        <h1
          style={{
            fontSize: '72px',
            fontWeight: '800',
            lineHeight: '1.5',
            letterSpacing: '-0.025em',
            marginBottom: '32px',
            background: 'linear-gradient(to right, #22d3ee, #a78bfa, #ec4899)',
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Invoice Forge
        </h1>

        {/* Description */}
        <p
          style={{
            fontSize: '24px',
            lineHeight: '1.5',
            color: 'rgba(255, 255, 255, 0.7)',
            maxWidth: '700px',
            marginBottom: '48px',
          }}
        >
          The fastest way to create, send, and track professional invoices.
        </p>

        {/* URL Button Mockup */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '16px 40px',
            borderRadius: '8px',
            fontSize: '20px',
            fontWeight: '600',
            color: '#ffffff',
            boxShadow: '0 0 50px rgba(139, 92, 246, 0.7)',
          }}
        >
          <span>invoiceforge.hopko.dev</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  );
}
