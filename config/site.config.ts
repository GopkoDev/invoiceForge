export type SidebarVariant = 'sidebar' | 'floating' | 'inset';

export interface SiteConfig {
  meta: {
    title: string;
    description: string;
  };

  branding: {
    name: string;
    website: string;
    domain: string;
    icon: string;
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
    title: 'Invoice Forge',
    description:
      'Invoice Forge is a modern invoice management system built with Next.js and shadcn/ui by Dmytro Hopko',
  },

  branding: {
    name: 'Invoice Forge',
    website: 'https://invoiceforge.hopko.dev',
    domain: 'invoiceforge.hopko.dev',
    icon: '/invoice-forge-logo.svg',
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
    position: 'top-center',
    expand: true,
  },

  enableProgressBar: true,
};
