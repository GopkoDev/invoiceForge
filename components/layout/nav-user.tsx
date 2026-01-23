import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVerticalIcon } from 'lucide-react';
import { UserAvatar } from '@/components/layout/user/user-avatar';
import { UserDropdownContent } from '@/components/layout/user/user-dropdown-content';
import { auth } from '@/auth';
import { SessionUser } from '@/types/session-user';

export async function NavUser() {
  const session = await auth();
  const user: SessionUser = session?.user as SessionUser;
  const updatedUser = {
    ...user,
    name: user.name || user.email.split('@')[0],
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            render={<DropdownMenuTrigger />}
          >
            <UserAvatar
              user={updatedUser}
              className="h-8 w-8 rounded-lg grayscale"
            />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{updatedUser.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {updatedUser.email}
              </span>
            </div>
            <MoreVerticalIcon className="ml-auto size-4" />
          </SidebarMenuButton>
          <UserDropdownContent user={updatedUser} />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
