'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { SettingsModalContainer } from '@/components/modals/settings/settings-modal-container';
import { protectedRoutes } from '@/config/routes.config';

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
    <div className="container mx-auto space-y-6 p-2 md:p-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and preferences.
        </p>
      </div>

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
    </div>
  );
}
