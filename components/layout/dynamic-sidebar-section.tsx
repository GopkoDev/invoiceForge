'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronRightIcon } from 'lucide-react';
import {
  navigationIcons,
  type NavigationIconKey,
} from '@/config/navigation-icons.config';
import type {
  SidebarSection,
  NavItemWithSubmenu,
  BaseNavItem,
} from '@/types/navigation';

interface DynamicSidebarSectionProps {
  section: SidebarSection;
}

const MenuItem = ({
  item,
  isSubItem = false,
}: {
  item: NavItemWithSubmenu | BaseNavItem;
  isSubItem?: boolean;
}) => {
  const pathname = usePathname();

  const IconComponent = item.icon
    ? navigationIcons[item.icon as NavigationIconKey]
    : null;

  const isActive = pathname === item.url || pathname.startsWith(item.url + '/');

  const content = (
    <>
      {IconComponent && <IconComponent />}
      <span>{item.title}</span>
    </>
  );

  return isSubItem ? (
    <SidebarMenuSubItem key={item.title}>
      <Link href={item.url} className="w-full">
        <SidebarMenuSubButton isActive={isActive}>
          {content}
        </SidebarMenuSubButton>
      </Link>
    </SidebarMenuSubItem>
  ) : (
    <SidebarMenuItem key={item.title}>
      <Link href={item.url} className="w-full">
        <SidebarMenuButton
          tooltip={item.title}
          isActive={isActive}
          disabled={item.disabled}
        >
          {content}
        </SidebarMenuButton>
      </Link>
    </SidebarMenuItem>
  );
};

const CollapsibleItem = ({ item }: { item: NavItemWithSubmenu }) => {
  const pathname = usePathname();
  const IconComponent = item.icon
    ? navigationIcons[item.icon as NavigationIconKey]
    : null;

  const isActive =
    pathname === item.url ||
    pathname.startsWith(item.url + '/') ||
    item.items?.some(
      (sub) => pathname === sub.url || pathname.startsWith(sub.url + '/')
    );
  const isOpen = item.defaultOpen || isActive;

  return (
    <Collapsible
      key={item.title}
      defaultOpen={isOpen}
      className="group/collapsible"
    >
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={item.title}
          isActive={isActive}
          disabled={item.disabled}
          render={<CollapsibleTrigger />}
        >
          {IconComponent && <IconComponent />}
          <span>{item.title}</span>
          <ChevronRightIcon className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
        </SidebarMenuButton>
        <CollapsibleContent>
          <SidebarMenuSub>
            {item.items?.map((sub) => (
              <MenuItem key={sub.title} item={sub} isSubItem />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
};

export function DynamicSidebarSection({ section }: DynamicSidebarSectionProps) {
  const { type, label, items } = section;
  if (!items) return null;

  const renderItems = (list: (NavItemWithSubmenu | BaseNavItem)[]) =>
    list.map((item) =>
      'items' in item && item.items?.length && item.isCollapsible ? (
        <CollapsibleItem key={item.title} item={item as NavItemWithSubmenu} />
      ) : (
        <MenuItem key={item.title} item={item} />
      )
    );

  const content = (
    <SidebarMenu>
      {renderItems(
        type === 'main'
          ? (items as NavItemWithSubmenu[])
          : (items as BaseNavItem[])
      )}
    </SidebarMenu>
  );

  return (
    <SidebarGroup className={type === 'secondary' ? 'mt-auto' : ''}>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent
        className={type === 'main' ? 'flex flex-col gap-2' : ''}
      >
        {content}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
