import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { SiteHeader } from '@/components/layout/site-header';
import { siteConfig } from '@/config/site.config';

export default function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider
      defaultOpen={siteConfig.sidebar.defaultOpen}
      style={
        {
          '--sidebar-width': `calc(var(--spacing) * ${siteConfig.sidebar.width})`,
          '--header-height': `calc(var(--spacing) * ${siteConfig.header.height})`,
        } as React.CSSProperties
      }
      suppressHydrationWarning
    >
      <AppSidebar variant={siteConfig.sidebar.variant} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
