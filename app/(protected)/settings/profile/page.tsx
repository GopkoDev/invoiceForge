import { ProfileSettings } from '@/components/settings/profile-settings';
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { SessionUser } from '@/types/session-user';

export const metadata: Metadata = {
  title: 'Profile Settings',
};

export default async function ProfilePage() {
  const session = await auth();
  const user: SessionUser = session?.user as SessionUser;
  return <ProfileSettings user={user} />;
}
