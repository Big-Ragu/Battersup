import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function CommissionerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // RLS policies enforce data access — non-commissioners simply see empty
  // pages and cannot modify data. The league creation page uses an RPC
  // function that auto-assigns the commissioner role, so any authenticated
  // user can create their first league.
  return <>{children}</>;
}
