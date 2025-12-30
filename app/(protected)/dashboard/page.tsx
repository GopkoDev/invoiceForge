import { signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import { auth } from '@/auth';

export default async function Dashboard() {
  const session = await auth();

  return (
    <>
      <h1 className="text-2xl font-bold">
        Dashboard. Hello {session?.user?.name || session?.user?.email}
      </h1>
      <form
        action={async () => {
          'use server';
          await signOut();
        }}
      >
        <Button type="submit">Sign Out</Button>
      </form>
    </>
  );
}
