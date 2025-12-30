import type { NavigationIconKey } from '@/config/navigation-icons.config';

export interface BaseNavItem {
  title: string;
  url: string;
  icon?: NavigationIconKey;
  isActive?: boolean;
  disabled?: boolean;
}

export interface NavItemWithSubmenu extends BaseNavItem {
  items?: BaseNavItem[];
  isCollapsible?: boolean;
  defaultOpen?: boolean;
}

export type SidebarSectionType = 'main' | 'secondary' | 'group';

export interface SidebarSection {
  type: SidebarSectionType;
  label?: string;
  items?: NavItemWithSubmenu[] | BaseNavItem[];
}

export interface NavigationConfig {
  sections?: SidebarSection[];
}
