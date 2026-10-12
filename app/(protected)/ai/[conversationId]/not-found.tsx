import { protectedRoutes } from '@/config/routes.config';
import { ContentAreaNotFound } from '@/components/layout/content-area';

export default function ConversationNotFound() {
  return (
    <ContentAreaNotFound
      title="This conversation can't be found."
      description="It may have been deleted."
      backHref={protectedRoutes.ai}
      backText="Back to AI →"
    />
  );
}
