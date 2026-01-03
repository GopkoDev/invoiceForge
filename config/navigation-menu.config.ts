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
        {
          title: 'Sender Profiles',
          url: protectedRoutes.senderProfiles,
          icon: 'senderProfiles',
        },
      ],
    },

    {
      type: 'secondary',
      items: [
        {
          title: 'Settings',
          url: protectedRoutes.settings,
          icon: 'settings',
        },
      ],
    },
  ],
};
