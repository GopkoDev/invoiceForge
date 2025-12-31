import * as React from 'react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { NavUser } from '@/components/layout/nav-user';
import { siteConfig } from '@/config/site.config';
import { NavHeader } from './nav-header';
import { navigationMenuConfig } from '@/config/navigation-menu.config';
import { DynamicSidebarSection } from './dynamic-sidebar-section';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      collapsible={siteConfig.sidebar.collapsible}
      {...props}
      suppressHydrationWarning
    >
      <NavHeader />

      <SidebarContent>
        {navigationMenuConfig.sections?.map((section, index) => (
          <DynamicSidebarSection key={`section-${index}`} section={section} />
        ))}
      </SidebarContent>

      <SidebarFooter>{<NavUser />}</SidebarFooter>
    </Sidebar>
  );
}
