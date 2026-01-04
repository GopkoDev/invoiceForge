import {
  LayoutDashboardIcon,
  SettingsIcon,
  FileTextIcon,
  Building2Icon,
  UsersIcon,
  PackageIcon,
  type LucideIcon,
} from 'lucide-react';

export const navigationIcons = {
  dashboard: LayoutDashboardIcon,
  settings: SettingsIcon,
  invoices: FileTextIcon,
  senderProfiles: Building2Icon,
  customers: UsersIcon,
  products: PackageIcon,
} as const satisfies Record<string, LucideIcon>;

export type NavigationIconKey = keyof typeof navigationIcons;

export function getNavigationIcon(key: NavigationIconKey): LucideIcon {
  return navigationIcons[key];
}
