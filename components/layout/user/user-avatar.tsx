import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { SessionUser } from '@/types/session-user';

interface UserAvatarProps {
  user: SessionUser;
  className?: string;
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  const fallback = user.name?.charAt(0).toUpperCase() || '?';

  return (
    <Avatar className={cn('h-8 w-8 rounded-lg', className)}>
      <AvatarImage src={user.avatar} alt={user.name} />
      <AvatarFallback className="rounded-lg">{fallback}</AvatarFallback>
    </Avatar>
  );
}
