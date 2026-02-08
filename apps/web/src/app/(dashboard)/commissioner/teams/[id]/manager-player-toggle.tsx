'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface ManagerPlayerToggleProps {
  userId: string;
  leagueId: string;
  teamId: string;
  isPlayer: boolean;
}

export function ManagerPlayerToggle({
  userId,
  leagueId,
  teamId,
  isPlayer: initialIsPlayer,
}: ManagerPlayerToggleProps) {
  const router = useRouter();
  const [isPlayer, setIsPlayer] = useState(initialIsPlayer);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('commissioner_toggle_manager_player', {
      p_user_id: userId,
      p_league_id: leagueId,
      p_team_id: teamId,
    });

    if (error) {
      alert(`Failed to update: ${error.message}`);
    } else {
      setIsPlayer((data as { is_player: boolean }).is_player);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
      <input
        type="checkbox"
        checked={isPlayer}
        onChange={handleToggle}
        disabled={loading}
        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      {loading ? 'Updating...' : 'Also a player'}
    </label>
  );
}
