import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { SessionUser } from '@/types/session-user';

interface UserAvatarProps {
  user: SessionUser;
  className?: string;
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  const falbackName =
    user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();
  const avatarSrc = user.image && user.image !== '' ? user.image : undefined;

  return (
    <Avatar className={cn('h-8 w-8 rounded-lg', className)}>
      <AvatarImage src={avatarSrc} alt={user.name} />
      <AvatarFallback className="rounded-lg">{falbackName}</AvatarFallback>
    </Avatar>
  );
}
