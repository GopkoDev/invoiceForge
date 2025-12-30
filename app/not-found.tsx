import { ErrorPageLayout } from '@/components/layout/error-page';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return <ErrorPageLayout code="404" message="This page could not be found." />;
}
