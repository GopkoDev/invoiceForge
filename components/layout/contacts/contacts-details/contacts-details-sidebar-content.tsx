import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CONTACT_FIELD_ICONS } from './contacts-details-sidebar-icons';
import { HelpCircle } from 'lucide-react';

interface InfoItemProps {
  icon: React.ElementType;
  label: string;
  value: string | null;
}

function InfoItem({ icon: Icon, label, value }: InfoItemProps) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium truncate">
          {value || <span className="text-muted-foreground">Not provided</span>}
        </p>
      </div>
    </div>
  );
}

interface SectionField {
  key: string;
  label: string;
  value: string | null;
  icon?: React.ElementType;
}

interface Section {
  title: string;
  fields: SectionField[];
}

interface Statistic {
  key: string;
  label: string;
  value: string | number;
  icon?: React.ElementType;
}

interface ContactsDetailsSidebarContentProps {
  avatar: {
    src?: string | null;
    fallback: React.ReactNode;
    alt: string;
  };
  title: string;
  subtitle?: string | null;
  badges?: Array<{
    label: string;
    variant?: 'default' | 'secondary' | 'outline' | 'destructive';
  }>;
  sections: Section[];
  notes?: string | null;
  statistics?: Statistic[];
}

export function ContactsDetailsSidebarContent({
  avatar,
  title,
  subtitle,
  badges = [],
  sections,
  notes,
  statistics,
}: ContactsDetailsSidebarContentProps) {
  return (
    <div className="space-y-6 min-w-0">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-20 w-20 mb-4">
              {avatar.src && <AvatarImage src={avatar.src} alt={avatar.alt} />}

              <AvatarFallback className="bg-primary/10 text-primary text-2xl font-semibold">
                {avatar.fallback}
              </AvatarFallback>
            </Avatar>

            <CardTitle className="text-xl">{title}</CardTitle>
            {subtitle && <CardDescription>{subtitle}</CardDescription>}
            {badges.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                {badges.map((badge, index) => (
                  <Badge key={`badge-${badge.label}-${index}`} variant={badge.variant || 'secondary'}>
                    {badge.label}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-6">
          <div className="space-y-4">
            {sections.map((section, index) => {
              const hasVisibleFields = section.fields.some(
                (field) => field.value
              );

              if (!hasVisibleFields && section.title !== 'DETAILS') {
                return null;
              }

              return (
                <div key={section.title}>
                  {index > 0 && <Separator className="mb-4" />}

                  <div>
                    <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
                      {section.title}
                    </h4>

                    <div className="space-y-3">
                      {section.fields.map((field) => {
                        const Icon =
                          field.icon ||
                          CONTACT_FIELD_ICONS[field.key] ||
                          HelpCircle;

                        return (
                          <InfoItem
                            key={field.key}
                            icon={Icon}
                            label={field.label}
                            value={field.value}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}

            {notes && (
              <>
                <Separator />
                <div>
                  <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                    NOTES
                  </h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {notes}
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {statistics && statistics.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Statistics</CardTitle>
          </CardHeader>

          <CardContent>
            {statistics.map((stat, index) => {
              const Icon =
                stat.icon || CONTACT_FIELD_ICONS[stat.key] || HelpCircle;

              return (
                <div key={stat.key}>
                  {index > 0 && <Separator className="my-2" />}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon className="h-4 w-4" />
                      <span>{stat.label}</span>
                    </div>
                    <span className="font-semibold">{stat.value}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
