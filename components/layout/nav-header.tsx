import Link from 'next/link';
import { SidebarHeader } from '@/components/ui/sidebar';
import { siteConfig } from '@/config/site.config';
import { Logo } from '@/components/custom-icons';

export function NavHeader() {
  return (
    <SidebarHeader>
      <Link href="/" className="flex items-center gap-2 pl-1">
        <Logo size="26" />

        <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-semibold text-base">
            {siteConfig.branding.name}
          </span>
        </div>
      </Link>
    </SidebarHeader>
  );
}
