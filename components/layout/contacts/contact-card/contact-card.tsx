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
import { Mail, Phone, MapPin, Globe, FileText } from 'lucide-react';
import { ContactCardInfo } from './contact-card-info';
import { EMPTY_DATA_LABEL } from '@/constants/empty-labels';

interface ContactCardProps {
  avatar?: {
    src?: string | null;
    fallback: React.ReactNode;
  };
  title: string;
  description?: string | null;
  badges?: Array<{
    label: string;
    variant?: 'default' | 'secondary' | 'outline' | 'destructive';
  }>;
  contactInfo: {
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    website?: string | null;
  };
  footer?: {
    invoicesCount: number;
    badge?: string;
    customPricesCount?: number;
  };
  actions: React.ReactNode;
}

export function ContactCard({
  avatar,
  title,
  description,
  badges = [],
  contactInfo,
  footer,
  actions,
}: ContactCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4 overflow-hidden">
          <Avatar className="h-12 w-12">
            {avatar?.src && <AvatarImage src={avatar.src} alt={title} />}
            <AvatarFallback>{avatar?.fallback}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate block">{title}</CardTitle>

            <CardDescription className="text-xs truncate">
              {description ? (
                description
              ) : (
                <span className="opacity-30">No description</span>
              )}
            </CardDescription>
          </div>

          {badges.length > 0 && (
            <div className="flex gap-2">
              {badges.map((badge, index) => (
                <Badge key={`${badge.label}-${index}`} variant={badge.variant || 'secondary'}>
                  {badge.label}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 h-full">
        <Separator />

        <div className="space-y-2 text-sm mb-auto flex-1">
          <ContactCardInfo
            data={contactInfo.email || null}
            IconComponent={Mail}
            href={contactInfo.email ? `mailto:${contactInfo.email}` : undefined}
            noDataLabel={EMPTY_DATA_LABEL}
          />

          <ContactCardInfo
            data={contactInfo.phone || null}
            IconComponent={Phone}
            href={contactInfo.phone ? `tel:${contactInfo.phone}` : undefined}
            noDataLabel={EMPTY_DATA_LABEL}
          />

          <ContactCardInfo
            data={contactInfo.location || null}
            IconComponent={MapPin}
            href={
              contactInfo.location
                ? `https://maps.google.com/?q=${contactInfo.location}`
                : undefined
            }
            noDataLabel={EMPTY_DATA_LABEL}
          />

          <ContactCardInfo
            data={contactInfo.website?.replace(/^https?:\/\//, '') || null}
            IconComponent={Globe}
            href={contactInfo.website || undefined}
            noDataLabel={EMPTY_DATA_LABEL}
          />
        </div>

        {footer && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span>{footer.invoicesCount} invoices</span>
              </div>

              {footer.badge && <Badge variant="outline">{footer.badge}</Badge>}

              {footer.customPricesCount !== undefined &&
                footer.customPricesCount > 0 && (
                  <span className="text-xs">
                    {footer.customPricesCount} custom prices
                  </span>
                )}
            </div>
          </>
        )}

        {actions}
      </CardContent>
    </Card>
  );
}
