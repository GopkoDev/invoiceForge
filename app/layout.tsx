import type { Metadata } from 'next';
import { Inter, Roboto } from 'next/font/google';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { siteConfig } from '@/config/site.config';
import { ThemeProvider } from '@/components/theme-provider';
import { ProgressBarProvider } from '@/components/progress-bar-provider';
import { Toaster } from '@/components/ui/sonner';
import { CookieBanner } from '@/components/layout/cookie-banner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const roboto = Roboto({
  weight: ['400', '700'],
  subsets: ['latin', 'cyrillic'],
  variable: '--font-roboto',
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.branding.website),
  title: {
    default: siteConfig.meta.title,
    template: `%s | ${siteConfig.meta.title}`,
  },
  description: siteConfig.meta.description,
  keywords: [
    'invoice management',
    'invoice generator',
    'billing software',
    'invoice tracking',
    'business invoicing',
    'PDF invoices',
    'multi-currency invoicing',
    'invoice automation',
    'freelance invoicing',
    'small business accounting',
  ],
  authors: [
    {
      name: 'Dmytro Hopko',
      url: siteConfig.branding.website,
    },
  ],
  creator: 'Dmytro Hopko',
  publisher: siteConfig.branding.name,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteConfig.branding.website,
    title: siteConfig.meta.title,
    description: siteConfig.meta.description,
    siteName: siteConfig.branding.name,
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.meta.title,
    description: siteConfig.meta.description,
    creator: '@invoiceforge',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // F-26: only the icon files that actually exist (app/favicon.ico, app/icon.png,
  // app/apple-icon.png) — the previous list also pointed at two sized PNGs nothing in this
  // app emits, which 404ed.
  icons: {
    icon: [{ url: '/favicon.ico', sizes: 'any' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: siteConfig.branding.name,
  },
  verification: {
    google: siteConfig.meta.googleSiteVerification,
  },
  category: 'business',
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${roboto.variable}`}
      suppressHydrationWarning
    >
      <body className={`antialiased`}>
        {/* T31 (AC-04, R-01): no next-auth/react SessionProvider here. It fetched
            /api/auth/session on every mount and tab focus, and that endpoint clears the session
            cookie whenever its check fails. Nothing reads the client session; signOut() needs no
            provider. tests/unit/no-client-session-fetch.test.ts keeps it out. */}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ProgressBarProvider>{children}</ProgressBarProvider>
          <Toaster
            position={siteConfig.toast.position}
            expand={siteConfig.toast.expand}
          />
          <CookieBanner />
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
