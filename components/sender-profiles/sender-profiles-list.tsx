import { Building2 } from 'lucide-react';
import { SenderProfileWithRelations } from '@/types/sender-profile/types';
import { protectedRoutes } from '@/config/routes.config';
import { SenderProfileCardActions } from './sender-profile-card-actions';
import { ContactCard, ContactsGrid } from '@/components/layout/contacts';
import { EmptyState } from '../layout/content-area/empty-state';
import { formatLocation } from '@/lib/helpers';

interface SenderProfilesListProps {
  profiles: SenderProfileWithRelations[];
}

export function SenderProfilesList({ profiles }: SenderProfilesListProps) {
  if (profiles.length === 0) {
    return (
      <EmptyState
        title="No Sender Profiles"
        description="Create your first sender profile to start issuing invoices. You can have multiple profiles for different companies or business entities."
        href={protectedRoutes.senderProfilesNew}
        linkText="Create Sender Profile"
        Icon={Building2}
      />
    );
  }

  return (
    <ContactsGrid>
      {profiles.map((profile) => {
        const location = formatLocation(profile.city, profile.country);

        return (
          <ContactCard
            key={profile.id}
            avatar={{
              src: profile.logo,
              fallback: <Building2 className="h-6 w-6" />,
            }}
            title={profile.name}
            description={profile.legalName}
            badges={[
              ...(profile.isDefault
                ? [{ label: 'Default', variant: 'default' as const }]
                : []),
            ]}
            contactInfo={{
              email: profile.email,
              phone: profile.phone,
              location: location,
              website: profile.website,
            }}
            footer={{
              invoicesCount: profile._count.invoices,
              badge: profile.invoicePrefix,
            }}
            actions={
              <SenderProfileCardActions
                profileId={profile.id}
                profileName={profile.name}
              />
            }
          />
        );
      })}
    </ContactsGrid>
  );
}
