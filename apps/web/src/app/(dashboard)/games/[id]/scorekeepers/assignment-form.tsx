'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ROLE_LABELS } from '@batters-up/shared';
import type { Role } from '@batters-up/shared';

interface Member {
  user_id: string;
  full_name: string;
  role: string;
  group: string;
}

interface AssignmentFormProps {
  gameId: string;
  teamId: string;
  teamName: string;
  currentUserId: string | null;
  currentUserName: string | null;
  teamMembers: Member[];
  otherMembers: Member[];
}

export function AssignmentForm({
  gameId,
  teamId,
  teamName,
  currentUserId,
  currentUserName,
  teamMembers,
  otherMembers,
}: AssignmentFormProps) {
  const [selectedUserId, setSelectedUserId] = useState(currentUserId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  async function handleAssign() {
    if (!selectedUserId) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('assign_scorekeeper', {
      p_game_id: gameId,
      p_team_id: teamId,
      p_user_id: selectedUserId,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setSuccess(true);
      router.refresh();
    }
    setSaving(false);
  }

  function roleLabel(role: string) {
    return ROLE_LABELS[role as Role] ?? role;
  }

  return (
    <div>
      {currentUserId && (
        <div className="mb-4 rounded-md bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-800">
            Currently assigned:{' '}
            <span className="font-medium">{currentUserName}</span>
          </p>
        </div>
      )}

      <label className="block text-sm font-medium text-gray-700 mb-1">
        Select scorekeeper
      </label>
      <select
        value={selectedUserId}
        onChange={(e) => {
          setSelectedUserId(e.target.value);
          setSuccess(false);
        }}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
      >
        <option value="">Choose a person...</option>
        {teamMembers.length > 0 && (
          <optgroup label={`${teamName} Members`}>
            {teamMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name} ({roleLabel(m.role)})
              </option>
            ))}
          </optgroup>
        )}
        {otherMembers.length > 0 && (
          <optgroup label="Other League Members">
            {otherMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name} ({roleLabel(m.role)})
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <button
        onClick={handleAssign}
        disabled={!selectedUserId || saving}
        className="mt-3 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        {saving ? 'Assigning...' : currentUserId ? 'Change Assignment' : 'Assign'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
      {success && (
        <p className="mt-2 text-sm text-green-600">
          Scorekeeper assigned successfully!
        </p>
      )}
    </div>
  );
}
