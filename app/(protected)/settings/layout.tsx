'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SettingsModalContainer } from '@/components/modals/settings/settings-modal-container';
import { protectedRoutes } from '@/config/routes.config';
import {
  ContentArea,
  ContentAreaHeader,
} from '@/components/layout/content-area';

const settingsNavItems = [
  { name: 'Profile', href: protectedRoutes.settingsProfile },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <ContentArea>
      <ContentAreaHeader
        title="Settings"
        description="Manage your account settings and preferences."
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="lg:w-48">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
            {settingsNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'hover:bg-accent hover:text-accent-foreground block rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    pathname === item.href
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1 lg:max-w-4xl">{children}</div>
      </div>

      <SettingsModalContainer />
    </ContentArea>
  );
}
