export type SidebarVariant = 'sidebar' | 'floating' | 'inset';

export interface SiteConfig {
  meta: {
    title: string;
    description: string;
  };

  branding: {
    name: string;
  };

  sidebar: {
    variant: SidebarVariant;
    width: number;
    collapsible: 'none' | 'icon' | 'offExamples';
    defaultOpen: boolean;
    keyboardShortcut: string;
  };
  header: {
    height: number;
  };

  toast: {
    position:
      | 'top-right'
      | 'bottom-right'
      | 'top-left'
      | 'bottom-left'
      | 'top-center'
      | 'bottom-center';
    expand: boolean;
  };

  enableProgressBar: boolean;
}

export const siteConfig: SiteConfig = {
  meta: {
    title: 'Invoices by Hopko',
    description:
      'Invoice Hopko is a modern invoice management system built with Next.js and shadcn/ui by Dmytro Hopko',
  },

  branding: {
    name: 'Invoices by Hopko',
  },

  sidebar: {
    variant: 'inset',
    width: 72,
    collapsible: 'icon',
    defaultOpen: true,
    keyboardShortcut: 'b',
  },

  header: {
    height: 12,
  },

  toast: {
    position: 'top-right',
    expand: true,
  },

  enableProgressBar: true,
};
