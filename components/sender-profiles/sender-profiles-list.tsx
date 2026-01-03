import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  FileText,
  Plus,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { protectedRoutes } from '@/config/routes.config';
import { SenderProfileWithRelations } from '@/types/sender-profile/types';
import { SenderContactInfo } from './sender-contact-info';
import { Separator } from '@/components/ui/separator';
import { SenderProfileCardActions } from './sender-profile-card-actions';
import Link from 'next/link';

interface SenderProfilesListProps {
  profiles: SenderProfileWithRelations[];
}

export function SenderProfilesList({ profiles }: SenderProfilesListProps) {
  if (profiles.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Sender Profiles</h3>
          <p className="text-muted-foreground text-center mb-6 max-w-md">
            Create your first sender profile to start issuing invoices. You can
            have multiple profiles for different companies or business entities.
          </p>
          <Link
            href={protectedRoutes.senderProfilesNew}
            className={buttonVariants()}
          >
            <Plus />
            Create Sender Profile
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
      {profiles.map((profile) => (
        <Card key={profile.id}>
          <CardHeader>
            <div className="flex items-start gap-4 overflow-hidden">
              <Avatar className="h-12 w-12">
                <AvatarImage
                  src={profile.logo || undefined}
                  alt={profile.name}
                />
                <AvatarFallback>
                  <Building2 className="h-6 w-6" />
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg truncate block">
                  {profile.name}
                </CardTitle>

                <CardDescription className="text-xs truncate">
                  {profile.legalName ? (
                    profile.legalName
                  ) : (
                    <span className="opacity-30">No legal name</span>
                  )}
                </CardDescription>
              </div>

              {profile.isDefault && <Badge variant="default">Default</Badge>}
            </div>
          </CardHeader>

          <CardContent className="flex flex-col gap-4 h-full">
            <Separator />

            <div className="space-y-2 text-sm mb-auto flex-1">
              <SenderContactInfo
                profileData={profile.email}
                IconComponent={Mail}
                href={`mailto:${profile.email}`}
                noDataLabel="No email"
              />

              <SenderContactInfo
                profileData={profile.phone}
                IconComponent={Phone}
                href={`tel:${profile.phone}`}
                noDataLabel="No phone"
              />

              <SenderContactInfo
                profileData={profile.city}
                IconComponent={MapPin}
                href={`https://maps.google.com/?q=${profile.city}, ${profile.country}`}
                noDataLabel="No city"
              />

              <SenderContactInfo
                profileData={
                  profile.website?.replace(/^https?:\/\//, '') || null
                }
                IconComponent={Globe}
                href={profile.website || ''}
                noDataLabel="No website"
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>{profile._count.invoices} invoices</span>
              </div>

              <Badge variant="outline">{profile.invoicePrefix}</Badge>
            </div>

            <SenderProfileCardActions
              profileId={profile.id}
              profileName={profile.name}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
