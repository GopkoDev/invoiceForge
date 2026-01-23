import { GdprSettings } from '@/components/settings';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Settings',
};

export default function PrivacyPage() {
  return <GdprSettings />;
}
