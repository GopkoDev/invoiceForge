import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { getSenderProfiles } from '@/lib/actions/sender-profile-actions';
import { SenderProfilesList } from '@/components/sender-profiles/sender-profiles-list';
import type { Metadata } from 'next';
import { cn } from '@/lib/utils';
import { ContentAreaHeader } from '@/components/layout/content-area/content-area';
import { protectedRoutes } from '@/config/routes.config';

export const metadata: Metadata = {
  title: 'Sender Profiles',
  description: 'Manage your company and business profiles',
};

export default async function SenderProfilesPage() {
  const result = await getSenderProfiles();
  const profiles = result.data || [];

  return (
    <>
      <ContentAreaHeader
        title="Sender Profiles"
        description="Manage your company and business profiles for invoicing"
        rightContent={
          <Link
            href={protectedRoutes.senderProfilesNew}
            className={cn(buttonVariants())}
          >
            <Plus />
            New Profile
          </Link>
        }
      />

      <SenderProfilesList profiles={profiles} />
    </>
  );
}
