export type SidebarVariant = 'sidebar' | 'floating' | 'inset';

const appName = 'Invoice Forge';
const appEmail = 'support@invoiceforge.hopko.dev';

export interface SiteConfig {
  meta: {
    title: string;
    email: string;
    googleSiteVerification: string;
    description: string;
  };

  branding: {
    name: string;
    website: string;
    domain: string;
    icon: string;
    emailFrom: string;
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
    title: appName,
    email: appEmail,
    googleSiteVerification: '',
    description:
      'Create professional-looking invoices in seconds with smart autofill, multi-currency support, and instant PDF generation. Free invoice management software for freelancers and small businesses.',
  },

  branding: {
    name: appName,
    website: 'https://invoiceforge.hopko.dev',
    domain: 'invoiceforge.hopko.dev',
    icon: '/invoice-forge-logo.svg',
    emailFrom: `${appName} <${appEmail}>`,
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
