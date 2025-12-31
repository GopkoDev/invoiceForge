import { redirect } from 'next/navigation';
import { protectedRoutes } from '@/config/routes.config';

export default function SettingsPage() {
  redirect(protectedRoutes.settingsProfile);
}
