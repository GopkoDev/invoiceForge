import type { NavigationConfig } from '@/types/navigation';
import { protectedRoutes } from './routes.config';

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
          title: 'Settings',
          url: protectedRoutes.settingsProfile,
          icon: 'settings',
        },
      ],
    },
  ],
};
