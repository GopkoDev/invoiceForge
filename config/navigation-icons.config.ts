import {
  LayoutDashboardIcon,
  SettingsIcon,
  FileTextIcon,
  type LucideIcon,
} from 'lucide-react';

export const navigationIcons = {
  dashboard: LayoutDashboardIcon,
  settings: SettingsIcon,
  invoices: FileTextIcon,
} as const satisfies Record<string, LucideIcon>;

export type NavigationIconKey = keyof typeof navigationIcons;

export function getNavigationIcon(key: NavigationIconKey): LucideIcon {
  return navigationIcons[key];
}
