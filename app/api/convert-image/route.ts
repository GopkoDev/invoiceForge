import { NextRequest, NextResponse } from 'next/server';
import { siteConfig } from '@/config/site.config';

export async function POST(request: NextRequest) {
  try {
    // Restrict access by Origin/Referer to only our frontend domain
    const originHeader = request.headers.get('origin') || '';
    const refererHeader = request.headers.get('referer') || '';
    const source = originHeader || refererHeader;

    if (!source) {
      return NextResponse.json(
        { error: 'Forbidden: missing origin or referer' },
        { status: 403 }
      );
    }

    let sourceHost: string | null = null;
    try {
      const url = new URL(source);
      sourceHost = url.host;
    } catch {
      return NextResponse.json(
        { error: 'Forbidden: invalid origin or referer format' },
        { status: 403 }
      );
    }

    const allowedHosts = new Set<string>();
    allowedHosts.add(siteConfig.branding.domain);
    allowedHosts.add('localhost:3000');

    if (!sourceHost || !allowedHosts.has(sourceHost)) {
      return NextResponse.json(
        {
          error: 'Forbidden: origin not allowed',
          details: { origin: originHeader, referer: refererHeader },
        },
        { status: 403 }
      );
    }

    const { imageUrl } = await request.json();

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: 'Invalid image URL' }, { status: 400 });
    }

    // Validate URL
    try {
      new URL(imageUrl);
    } catch {
      return NextResponse.json(
        { error: 'Invalid URL format' },
        { status: 400 }
      );
    }

    // Fetch the image from the server side (no CORS issues)
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the image as buffer
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    // Convert to base64
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return NextResponse.json({
      success: true,
      base64: dataUrl,
      size: buffer.byteLength,
      type: contentType,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to convert image',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
