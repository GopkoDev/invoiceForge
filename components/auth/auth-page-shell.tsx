import { siteConfig } from '@/config/site.config';
import { Logo } from '../custom-icons';

interface AuthPageShellProps {
  children: React.ReactNode;
}

export function AuthPageShell({ children }: AuthPageShellProps) {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a
          href="#"
          className="flex items-center gap-2 self-center font-medium text-xl"
        >
          <div className="text-primary-foreground flex size-8 items-center justify-center">
            <Logo size={32} />
          </div>
          {siteConfig.branding.name}
        </a>
        {children}
      </div>
    </div>
  );
}
