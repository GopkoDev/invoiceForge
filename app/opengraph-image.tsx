import { ImageResponse } from 'next/og';
import { siteConfig } from '@/config/site.config';

// Image metadata
export const alt = `${siteConfig.branding.name} - Modern Invoice Management System`;
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

/**
 * Dynamic OpenGraph image generation
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
 */
export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 60,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontFamily: 'system-ui, sans-serif',
        padding: '80px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 'bold',
            marginBottom: 20,
            textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {siteConfig.branding.name}
        </div>
        <div
          style={{
            fontSize: 32,
            maxWidth: 900,
            lineHeight: 1.4,
            opacity: 0.95,
            textAlign: 'center',
          }}
        >
          {siteConfig.meta.description}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 24,
            padding: '12px 32px',
            background: 'rgba(255, 255, 255, 0.2)',
            borderRadius: 12,
            backdropFilter: 'blur(10px)',
          }}
        >
          {siteConfig.branding.domain}
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  );
}
