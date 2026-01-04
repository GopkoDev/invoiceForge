import { protectedRoutes } from '@/config/routes.config';
import { ContentAreaNotFound } from '@/components/layout/content-area';

export default function SenderProfileNotFound() {
  return (
    <ContentAreaNotFound
      title="Sender Profile Not Found"
      description="The sender profile you're looking for doesn't exist or you don't have access to it."
      backHref={protectedRoutes.senderProfiles}
      backText="Back to Sender Profiles"
    />
  );
}
