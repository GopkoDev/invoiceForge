import type { NavigationConfig } from '@/types/navigation';
import { legalRoutes, protectedRoutes } from './routes.config';

export const navigationMenuConfig: NavigationConfig = {
  sections: [
    {
      type: 'main',
      items: [
        {
          title: 'Dashboard',
          url: protectedRoutes.dashboard,
          icon: 'dashboard',
        },
        {
          title: 'Invoices',
          url: protectedRoutes.invoices,
          icon: 'invoices',
        },
      ],
    },

    {
      type: 'group',
      label: 'Management',
      items: [
        {
          title: 'Customers',
          url: protectedRoutes.customers,
          icon: 'customers',
        },
        {
          title: 'Sender Profiles',
          url: protectedRoutes.senderProfiles,
          icon: 'senderProfiles',
        },
        {
          title: 'Products',
          url: protectedRoutes.products,
          icon: 'products',
        },
      ],
    },

    {
      type: 'secondary',
      items: [
        {
          title: 'Privacy Policy',
          url: legalRoutes.privacy,
          icon: 'privacy',
        },
        {
          title: 'Terms of Service',
          url: legalRoutes.terms,
          icon: 'terms',
        },
        {
          title: 'Settings',
          url: protectedRoutes.settingsProfile,
          icon: 'settings',
        },
      ],
    },
  ],
};
