import { buttonVariants } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { getSenderProfiles } from '@/lib/actions/sender-profile-actions';
import { SenderProfilesList } from '@/components/sender-profiles/sender-profiles-list';
import type { Metadata } from 'next';
import { cn } from '@/lib/utils';
import { ContentAreaHeader } from '@/components/layout/content-area';
import { protectedRoutes } from '@/config/routes.config';
import { PAGE_HEADER_TEXT } from './_constants';

export const metadata: Metadata = {
  title: 'Sender Profiles',
  description: 'Manage your company and business profiles',
};

const { title, description, buttonText } = PAGE_HEADER_TEXT;

export default async function SenderProfilesPage() {
  const result = await getSenderProfiles();
  const profiles = result.data || [];

  return (
    <>
      <ContentAreaHeader
        title={title}
        description={description}
        rightContent={
          <Link
            href={protectedRoutes.senderProfilesNew}
            className={cn(buttonVariants())}
          >
            <Plus />
            {buttonText}
          </Link>
        }
      />

      <SenderProfilesList profiles={profiles} />
    </>
  );
}
