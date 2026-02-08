'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Play, Flag, XCircle, Clock, Save } from 'lucide-react';

interface GameActionsProps {
  gameId: string;
  status: string;
  homeScore: number;
  awayScore: number;
  canManage: boolean;
  canScore: boolean;
}

export function GameActions({
  gameId,
  status,
  homeScore,
  awayScore,
  canManage,
  canScore,
}: GameActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingScore, setEditingScore] = useState(false);
  const [home, setHome] = useState(homeScore);
  const [away, setAway] = useState(awayScore);

  async function updateStatus(newStatus: string, hScore?: number, aScore?: number) {
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('update_game_status', {
      p_game_id: gameId,
      p_status: newStatus,
      p_home_score: hScore ?? null,
      p_away_score: aScore ?? null,
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setEditingScore(false);
    router.refresh();
  }

  async function saveScore() {
    await updateStatus(status, home, away);
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
        Game Actions
      </h3>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Score editing */}
      {(status === 'in_progress' || status === 'final') && canScore && (
        <div className="mt-4">
          {editingScore ? (
            <div className="flex items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Home
                </label>
                <input
                  type="number"
                  min={0}
                  value={home}
                  onChange={(e) => setHome(Number(e.target.value))}
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 text-center text-lg font-bold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <span className="pb-2 text-gray-400">—</span>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Away
                </label>
                <input
                  type="number"
                  min={0}
                  value={away}
                  onChange={(e) => setAway(Number(e.target.value))}
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 text-center text-lg font-bold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={saveScore}
                disabled={loading}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                Save
              </button>
              <button
                onClick={() => {
                  setEditingScore(false);
                  setHome(homeScore);
                  setAway(awayScore);
                }}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingScore(true)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Edit Score
            </button>
          )}
        </div>
      )}

      {/* Status transition buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        {status === 'scheduled' && canScore && (
          <button
            onClick={() => updateStatus('in_progress')}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Start Game
          </button>
        )}

        {status === 'in_progress' && canScore && (
          <button
            onClick={() => updateStatus('final', home, away)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
          >
            <Flag className="h-4 w-4" />
            End Game (Final)
          </button>
        )}

        {(status === 'scheduled' || status === 'in_progress') && canManage && (
          <>
            <button
              onClick={() => updateStatus('postponed')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm font-medium text-yellow-800 hover:bg-yellow-100 disabled:opacity-50"
            >
              <Clock className="h-4 w-4" />
              Postpone
            </button>
            <button
              onClick={() => updateStatus('cancelled')}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Cancel
            </button>
          </>
        )}

        {(status === 'postponed' || status === 'cancelled') && canManage && (
          <button
            onClick={() => updateStatus('scheduled')}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            Reschedule (Set to Scheduled)
          </button>
        )}
      </div>
    </div>
  );
}
