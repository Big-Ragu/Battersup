'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FIELD_POSITION_ABBREV } from '@batters-up/shared';
import type { GameLineupEntry } from '@batters-up/shared';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

interface SubstitutionPanelProps {
  gameId: string;
  teamId: string;
  currentInning: number;
  starters: GameLineupEntry[];
  benchPlayers: GameLineupEntry[];
  exitedPlayers: GameLineupEntry[];
  allowReentry: boolean;
  mode: 'pinch_hit' | 'pinch_run' | 'pitcher';
  targetPlayer: GameLineupEntry;
  onComplete: (incoming: GameLineupEntry) => void;
  onClose: () => void;
}

const MODE_LABELS: Record<string, string> = {
  pinch_hit: 'Pinch Hitter',
  pinch_run: 'Pinch Runner',
  pitcher: 'Pitcher Change',
};

export function SubstitutionPanel({
  gameId,
  teamId,
  currentInning,
  starters,
  benchPlayers,
  exitedPlayers,
  allowReentry,
  mode,
  targetPlayer,
  onComplete,
  onClose,
}: SubstitutionPanelProps) {
  // Step tracking: select → pitcher_dest (pitcher mode only) → fill_vacancy
  const [step, setStep] = useState<'select' | 'pitcher_dest' | 'fill_vacancy'>('select');

  // Player selection
  const [selected, setSelected] = useState<GameLineupEntry | null>(null);
  const [fieldingPosition, setFieldingPosition] = useState<number>(
    mode === 'pitcher' ? 1 : (targetPlayer.fielding_position ?? 0)
  );

  // Pitcher destination (swap positions vs bench/exit)
  const [pitcherDest, setPitcherDest] = useState<'swap' | 'bench'>('swap');

  // Vacancy fill (after a starter's old position becomes open)
  const [vacantBattingOrder, setVacantBattingOrder] = useState<number>(0);
  const [vacantPosition, setVacantPosition] = useState<number>(0);
  const [vacantFillPlayer, setVacantFillPlayer] = useState<GameLineupEntry | null>(null);
  // Track players who became available after RPC calls (e.g., old pitcher just exited)
  const [extraExitedPlayers, setExtraExitedPlayers] = useState<GameLineupEntry[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLineup, setShowLineup] = useState(false);
  const [showReentry, setShowReentry] = useState(false);

  // Available lineup players: all starters EXCEPT the target player
  const availableStarters = starters.filter(
    (l) => l.player_user_id !== targetPlayer.player_user_id
  );

  // Is selected player a starter (from lineup, has a fielding position)?
  const isStarterSelected = selected != null && selected.fielding_position != null;

  // Available fill candidates for vacancy step (exclude the player who already moved)
  const fillCandidates = benchPlayers.filter(
    (p) => p.player_user_id !== selected?.player_user_id
  );
  // Combine prop-sourced exited players with those who became exited during this flow
  const allExited = [
    ...exitedPlayers,
    ...extraExitedPlayers.filter(
      (ep) => !exitedPlayers.some((p) => p.player_user_id === ep.player_user_id)
    ),
  ];
  const fillReentryCandidates = allExited.filter(
    (p) => p.player_user_id !== selected?.player_user_id
  );

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const supabase = createClient();

    if (step === 'select') {
      if (!selected) return;

      // Pitcher mode + starter selected → go to destination step
      if (mode === 'pitcher' && isStarterSelected) {
        setStep('pitcher_dest');
        setSubmitting(false);
        return;
      }

      // Execute substitution
      const { error: rpcError } = await supabase.rpc('substitute_player', {
        p_game_id: gameId,
        p_team_id: teamId,
        p_outgoing_player_id: targetPlayer.player_user_id,
        p_incoming_player_id: selected.player_user_id,
        p_fielding_position: fieldingPosition,
        p_inning: currentInning,
      });

      if (rpcError) {
        setError(rpcError.message);
        setSubmitting(false);
        return;
      }

      // If a starter was subbed in, their old position is vacant — always show fill step
      if (isStarterSelected) {
        // The target player just got exited — add them as a fill candidate
        if (allowReentry) {
          setExtraExitedPlayers([targetPlayer]);
        }
        setVacantBattingOrder(selected.batting_order);
        setVacantPosition(selected.fielding_position!);
        setStep('fill_vacancy');
        setSubmitting(false);
        return;
      }

      onComplete(selected);
      return;
    }

    if (step === 'pitcher_dest') {
      if (!selected) return;

      if (pitcherDest === 'swap') {
        // Swap positions: selected becomes pitcher, old pitcher takes selected's position
        const { error: rpcError } = await supabase.rpc('swap_fielding_positions', {
          p_game_id: gameId,
          p_team_id: teamId,
          p_player_a_id: selected.player_user_id,
          p_player_b_id: targetPlayer.player_user_id,
        });

        if (rpcError) {
          setError(rpcError.message);
          setSubmitting(false);
          return;
        }

        onComplete(selected);
        return;
      }

      // Bench: old pitcher exits, selected becomes pitcher
      const { error: rpcError } = await supabase.rpc('substitute_player', {
        p_game_id: gameId,
        p_team_id: teamId,
        p_outgoing_player_id: targetPlayer.player_user_id,
        p_incoming_player_id: selected.player_user_id,
        p_fielding_position: 1,
        p_inning: currentInning,
      });

      if (rpcError) {
        setError(rpcError.message);
        setSubmitting(false);
        return;
      }

      // Selected player's old position is now vacant — always show fill step
      // The old pitcher (targetPlayer) just got exited — add them as a fill candidate
      if (allowReentry) {
        setExtraExitedPlayers([targetPlayer]);
      }
      setVacantBattingOrder(selected.batting_order);
      setVacantPosition(selected.fielding_position!);
      setStep('fill_vacancy');
      setSubmitting(false);
      return;
    }

    if (step === 'fill_vacancy') {
      if (!vacantFillPlayer) return;

      const { error: rpcError } = await supabase.rpc('fill_vacant_position', {
        p_game_id: gameId,
        p_team_id: teamId,
        p_player_id: vacantFillPlayer.player_user_id,
        p_batting_order: vacantBattingOrder,
        p_fielding_position: vacantPosition,
        p_inning: currentInning,
      });

      if (rpcError) {
        setError(rpcError.message);
        setSubmitting(false);
        return;
      }

      onComplete(selected!);
    }
  }

  function PlayerButton({
    player,
    badge,
    isPlayerSelected,
    onSelect,
  }: {
    player: GameLineupEntry;
    badge?: string;
    isPlayerSelected: boolean;
    onSelect: () => void;
  }) {
    const posLabel = player.fielding_position
      ? FIELD_POSITION_ABBREV[player.fielding_position]
      : null;
    return (
      <button
        onClick={onSelect}
        className={`flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
          isPlayerSelected
            ? 'bg-blue-100 ring-2 ring-blue-500'
            : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <span className="text-sm font-bold text-gray-900 flex-1 truncate">
          {player.player_name ?? 'Unknown'}
          {player.jersey_number != null && (
            <span className="ml-1 text-gray-400 text-xs">
              #{player.jersey_number}
            </span>
          )}
        </span>
        {posLabel && (
          <span className="text-xs font-medium text-gray-500">{posLabel}</span>
        )}
        {badge && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
            {badge}
          </span>
        )}
      </button>
    );
  }

  // Dynamic header based on step
  const headerTitle = step === 'select'
    ? MODE_LABELS[mode]
    : step === 'pitcher_dest'
      ? 'Old Pitcher Destination'
      : `Fill Vacant ${FIELD_POSITION_ABBREV[vacantPosition] ?? ''} Position`;

  const headerSubtitle = step === 'select'
    ? `Replacing: ${targetPlayer.player_name}${targetPlayer.jersey_number != null ? ` #${targetPlayer.jersey_number}` : ''}${targetPlayer.fielding_position ? ` · ${FIELD_POSITION_ABBREV[targetPlayer.fielding_position]}` : ''}`
    : step === 'pitcher_dest'
      ? `Where does ${targetPlayer.player_name} go?`
      : `${selected?.player_name} moved, leaving ${FIELD_POSITION_ABBREV[vacantPosition] ?? '?'} open`;

  // Confirm button text
  const confirmText = submitting
    ? (step === 'fill_vacancy' ? 'Filling...' : 'Processing...')
    : step === 'select' && mode === 'pitcher' && isStarterSelected
      ? 'Next'
      : step === 'fill_vacancy'
        ? 'Fill Position'
        : 'Confirm';

  // Confirm disabled state
  const confirmDisabled = submitting
    || (step === 'select' && !selected)
    || (step === 'fill_vacancy' && !vacantFillPlayer);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="w-full max-w-md rounded-t-xl bg-white shadow-xl sm:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900">{headerTitle}</h3>
            <p className="text-xs text-gray-500">{headerSubtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-3">
          {/* ====== STEP: SELECT PLAYER ====== */}
          {step === 'select' && (
            <>
              {/* Bench players */}
              {benchPlayers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Bench ({benchPlayers.length})
                  </p>
                  <div className="space-y-1.5">
                    {benchPlayers.map((p) => (
                      <PlayerButton
                        key={p.player_user_id}
                        player={p}
                        isPlayerSelected={selected?.player_user_id === p.player_user_id}
                        onSelect={() => setSelected(p)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* From lineup (collapsible) */}
              {availableStarters.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowLineup(!showLineup)}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase"
                  >
                    From Lineup ({availableStarters.length})
                    {showLineup ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                  {showLineup && (
                    <div className="mt-2 space-y-1.5">
                      {availableStarters.map((p) => (
                        <PlayerButton
                          key={p.player_user_id}
                          player={p}
                          isPlayerSelected={selected?.player_user_id === p.player_user_id}
                          onSelect={() => setSelected(p)}
                        />
                      ))}
                      <p className="text-[10px] text-gray-400 italic mt-1">
                        Using a starter will leave their position vacant.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Re-entry players */}
              {allowReentry && exitedPlayers.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowReentry(!showReentry)}
                    className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase"
                  >
                    Re-entry ({exitedPlayers.length})
                    {showReentry ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                  {showReentry && (
                    <div className="mt-2 space-y-1.5">
                      {exitedPlayers.map((p) => (
                        <PlayerButton
                          key={p.player_user_id}
                          player={p}
                          badge="Re-entry"
                          isPlayerSelected={selected?.player_user_id === p.player_user_id}
                          onSelect={() => setSelected(p)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* No options */}
              {benchPlayers.length === 0 && availableStarters.length === 0 && exitedPlayers.length === 0 && (
                <p className="text-sm text-gray-500 italic text-center py-4">
                  No available players for substitution.
                </p>
              )}

              {/* Fielding position selector — only for bench/re-entry, not starter in pitcher mode */}
              {selected && !(mode === 'pitcher' && isStarterSelected) && (
                <div className="border-t border-gray-200 pt-3">
                  <label className="text-xs font-semibold text-gray-600 uppercase">
                    Fielding Position
                  </label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {Object.entries(FIELD_POSITION_ABBREV).map(([num, abbrev]) => {
                      const posNum = parseInt(num);
                      return (
                        <button
                          key={num}
                          onClick={() => setFieldingPosition(posNum)}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors ${
                            fieldingPosition === posNum
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {abbrev}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ====== STEP: PITCHER DESTINATION ====== */}
          {step === 'pitcher_dest' && selected && (
            <div className="space-y-2">
              <button
                onClick={() => setPitcherDest('swap')}
                className={`flex flex-col w-full rounded-lg px-4 py-3 text-left transition-colors ${
                  pitcherDest === 'swap'
                    ? 'bg-blue-100 ring-2 ring-blue-500'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <span className="text-sm font-bold text-gray-900">
                  Move to {FIELD_POSITION_ABBREV[selected.fielding_position!]}
                </span>
                <span className="text-xs text-gray-500">
                  Swap positions with {selected.player_name}
                </span>
              </button>
              <button
                onClick={() => setPitcherDest('bench')}
                className={`flex flex-col w-full rounded-lg px-4 py-3 text-left transition-colors ${
                  pitcherDest === 'bench'
                    ? 'bg-blue-100 ring-2 ring-blue-500'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <span className="text-sm font-bold text-gray-900">
                  Exit game (bench)
                </span>
                <span className="text-xs text-gray-500">
                  Remove {targetPlayer.player_name} from the lineup
                </span>
              </button>
            </div>
          )}

          {/* ====== STEP: FILL VACANCY ====== */}
          {step === 'fill_vacancy' && (
            <>
              {fillCandidates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Bench ({fillCandidates.length})
                  </p>
                  <div className="space-y-1.5">
                    {fillCandidates.map((p) => (
                      <PlayerButton
                        key={p.player_user_id}
                        player={p}
                        isPlayerSelected={vacantFillPlayer?.player_user_id === p.player_user_id}
                        onSelect={() => setVacantFillPlayer(p)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {allowReentry && fillReentryCandidates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                    Re-entry ({fillReentryCandidates.length})
                  </p>
                  <div className="space-y-1.5">
                    {fillReentryCandidates.map((p) => (
                      <PlayerButton
                        key={p.player_user_id}
                        player={p}
                        badge="Re-entry"
                        isPlayerSelected={vacantFillPlayer?.player_user_id === p.player_user_id}
                        onSelect={() => setVacantFillPlayer(p)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {fillCandidates.length === 0 && (!allowReentry || fillReentryCandidates.length === 0) && (
                <p className="text-sm text-gray-500 italic text-center py-4">
                  No available players to fill the position. Click Skip to leave the position vacant.
                </p>
              )}
            </>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-gray-200 px-4 py-3">
          {step === 'fill_vacancy' ? (
            <>
              <button
                onClick={() => onComplete(selected!)}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Skip
              </button>
              <button
                onClick={handleConfirm}
                disabled={!vacantFillPlayer || submitting}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {submitting ? 'Filling...' : 'Fill Position'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={step === 'pitcher_dest' ? () => setStep('select') : onClose}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {step === 'pitcher_dest' ? 'Back' : 'Cancel'}
              </button>
              <button
                onClick={handleConfirm}
                disabled={confirmDisabled}
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {confirmText}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
