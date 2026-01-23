import type { Metadata } from 'next';
import { Inter, Roboto } from 'next/font/google';
import { siteConfig } from '@/config/site.config';
import { ThemeProvider } from '@/components/theme-provider';
import { ProgressBarProvider } from '@/components/progress-bar-provider';
import { SessionProvider } from '@/components/session-provider';
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
  title: {
    default: siteConfig.meta.title,
    template: '%s - ' + siteConfig.meta.title,
  },
  description: siteConfig.meta.description,
  appleWebApp: {
    title: 'Invoice Forge',
  },
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
        <SessionProvider>
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
        </SessionProvider>
      </body>
    </html>
  );
}
