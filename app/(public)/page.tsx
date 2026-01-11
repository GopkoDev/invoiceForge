import Link from 'next/link';
import { authRoutes } from '@/config/routes.config';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/custom-icons';
import { siteConfig } from '@/config/site.config';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="flex flex-col items-center justify-center gap-4">
        <Logo size={64} />
        <h1 className="text-center text-2xl font-bold">
          {siteConfig.branding.name}
        </h1>
      </div>
      <h2 className="text-center text-xl font-bold">
        Welcome to the Landing Page
      </h2>
      <Link href={authRoutes.signIn}>
        <Button variant="outline" className="w-[200px]">
          Login
        </Button>
      </Link>
    </div>
  );
}
