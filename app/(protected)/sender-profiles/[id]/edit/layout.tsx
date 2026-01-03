'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Landmark } from 'lucide-react';
import { protectedRoutes } from '@/config/routes.config';
import { use, useMemo } from 'react';

const tabs = {
  profile: {
    icon: Building2,
    label: 'Profile Info',
    value: 'profile',
    getHref: protectedRoutes.senderProfileEditTab,
  },
  'bank-accounts': {
    icon: Landmark,
    label: 'Bank Accounts',
    value: 'bank-accounts',
    getHref: protectedRoutes.senderProfileEditBankAccounts,
  },
};

const DEFAULT_TAB = 'profile';

function getActiveTabFromPathname(pathname: string): string {
  const lastSegment = pathname.split('/').pop();

  if (lastSegment && lastSegment in tabs) {
    return tabs[lastSegment as keyof typeof tabs].value;
  }

  return tabs[DEFAULT_TAB].value;
}

interface EditLayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default function SenderProfileEditLayout({
  children,
  params,
}: EditLayoutProps) {
  const pathname = usePathname();
  const { id } = use(params);

  const activeTab = useMemo(
    () => getActiveTabFromPathname(pathname),
    [pathname]
  );

  return (
    <>
      <Tabs value={activeTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          {Object.values(tabs).map((tab) => (
            <Link key={tab.value} href={tab.getHref(id)}>
              <TabsTrigger
                value={tab.value}
                className="w-full flex items-center gap-2"
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            </Link>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-6">{children}</div>
    </>
  );
}
