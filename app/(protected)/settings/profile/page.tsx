import { ProfileSettings, TimeZoneSettings } from '@/components/settings';
import type { Metadata } from 'next';
import { auth } from '@/auth';
import { SessionUser } from '@/types/session-user';
import { getProfile } from '@/lib/actions/profile-actions';
import { unwrapPageResult } from '@/components/layout/content-area';

export const metadata: Metadata = {
  title: 'Profile Settings',
};

export default async function ProfilePage() {
  const session = await auth();
  const user: SessionUser = session?.user as SessionUser;
  const profile = unwrapPageResult(await getProfile());
  return (
    <div className="space-y-6">
      <ProfileSettings user={user} />
      <TimeZoneSettings timeZone={profile.timeZone} />
    </div>
  );
}
