import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { isWebAddress } from '@/lib/validations/web-address';
import { SessionUser } from '@/types/session-user';

interface UserAvatarProps {
  user: SessionUser;
  className?: string;
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  const falbackName =
    user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase();
  const avatarSrc =
    user.image && isWebAddress(user.image) ? user.image : undefined;

  return (
    <Avatar className={cn('h-8 w-8 rounded-lg', className)}>
      {avatarSrc && <AvatarImage src={avatarSrc} alt={user.name} />}
      <AvatarFallback className="rounded-lg">{falbackName}</AvatarFallback>
    </Avatar>
  );
}
