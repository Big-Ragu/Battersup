'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UserMinus } from 'lucide-react';

interface RemoveFromTeamButtonProps {
  roleId: string;
  memberName: string;
}

export function RemoveFromTeamButton({ roleId, memberName }: RemoveFromTeamButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    setLoading(true);
    const supabase = createClient();

    // Set team_id to null — keeps the user in the league, just unassigns from team
    const { error } = await supabase.rpc('commissioner_update_user_role', {
      p_role_id: roleId,
      p_clear_team: true,
    });

    if (error) {
      alert(`Failed to remove from team: ${error.message}`);
      setLoading(false);
      setConfirming(false);
      return;
    }

    router.refresh();
    setConfirming(false);
    setLoading(false);
  }

  if (confirming) {
    return (
      <div className="inline-flex items-center gap-2">
        <span className="text-xs text-red-600">Remove {memberName}?</span>
        <button
          onClick={handleRemove}
          disabled={loading}
          className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? '...' : 'Yes'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
      title="Remove from team"
    >
      <UserMinus className="h-4 w-4" />
    </button>
  );
}
