import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { siteConfig } from '@/config/site.config';
import { ThemeProvider } from '@/components/theme-provider';
import { ProgressBarProvider } from '@/components/progress-bar-provider';
import { SessionProvider } from '@/components/session-provider';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: {
    default: siteConfig.meta.title,
    template: '%s - ' + siteConfig.meta.title,
  },
  description: siteConfig.meta.description,
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
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
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
