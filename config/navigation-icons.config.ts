import {
  LayoutDashboardIcon,
  SettingsIcon,
  FileTextIcon,
  Building2Icon,
  UsersIcon,
  PackageIcon,
  ShieldIcon,
  ScaleIcon,
  SparklesIcon,
  type LucideIcon,
} from 'lucide-react';

export const navigationIcons = {
  dashboard: LayoutDashboardIcon,
  settings: SettingsIcon,
  invoices: FileTextIcon,
  ai: SparklesIcon,
  senderProfiles: Building2Icon,
  customers: UsersIcon,
  products: PackageIcon,
  privacy: ShieldIcon,
  terms: ScaleIcon,
} as const satisfies Record<string, LucideIcon>;

export type NavigationIconKey = keyof typeof navigationIcons;

export function getNavigationIcon(key: NavigationIconKey): LucideIcon {
  return navigationIcons[key];
}
