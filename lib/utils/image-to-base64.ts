async function convertViaServerApi(url: string): Promise<string | null> {
  try {
    const response = await fetch('/api/convert-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl: url }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.base64;
  } catch {
    return null;
  }
}

async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    // For external URLs (not same origin), use server API to avoid CORS
    const isExternal = url.startsWith('http://') || url.startsWith('https://');
    const isSameOrigin = isExternal && url.startsWith(window.location.origin);

    if (isExternal && !isSameOrigin) {
      return await convertViaServerApi(url);
    }

    // For same-origin or relative URLs, fetch directly
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const blob = await response.blob();

    // Convert blob to base64
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function convertLogoToBase64(
  logoUrl: string | null | undefined
): Promise<string | null> {
  if (!logoUrl) return null;

  if (logoUrl.startsWith('data:')) return logoUrl;

  if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://'))
    return await imageUrlToBase64(logoUrl);

  if (logoUrl.startsWith('/'))
    return await imageUrlToBase64(`${window.location.origin}${logoUrl}`);

  return null;
}
