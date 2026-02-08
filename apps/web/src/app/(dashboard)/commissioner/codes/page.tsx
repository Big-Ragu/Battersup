'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Key, Plus, Copy, Check, XCircle } from 'lucide-react';
import type { SignupCode } from '@batters-up/shared';

interface CodeWithLeague extends SignupCode {
  league_name: string;
  team_name: string | null;
}

export default function CodesPage() {
  const [codes, setCodes] = useState<CodeWithLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadCodes();
  }, []);

  async function loadCodes() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    // Get commissioner leagues
    const { data: roles } = await supabase
      .from('user_roles')
      .select('league_id')
      .eq('user_id', user.id)
      .eq('role', 'commissioner');

    const leagueIds = roles?.map((r) => r.league_id) ?? [];
    if (leagueIds.length === 0) {
      setLoading(false);
      return;
    }

    // Fetch codes, leagues, and teams
    const [codesRes, leaguesRes, teamsRes] = await Promise.all([
      supabase
        .from('signup_codes')
        .select('*')
        .in('league_id', leagueIds)
        .order('created_at', { ascending: false }),
      supabase.from('leagues').select('id, name').in('id', leagueIds),
      supabase.from('teams').select('id, name').in('league_id', leagueIds),
    ]);

    const leagueMap: Record<string, string> = {};
    leaguesRes.data?.forEach((l) => {
      leagueMap[l.id] = l.name;
    });

    const teamMap: Record<string, string> = {};
    teamsRes.data?.forEach((t) => {
      teamMap[t.id] = t.name;
    });

    const enrichedCodes: CodeWithLeague[] = (codesRes.data ?? []).map((c) => ({
      ...(c as SignupCode),
      league_name: leagueMap[c.league_id] || 'Unknown',
      team_name: c.team_id ? teamMap[c.team_id] || null : null,
    }));

    setCodes(enrichedCodes);
    setLoading(false);
  }

  async function handleCopy(code: string, id: string) {
    await navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDeactivate(id: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from('signup_codes')
      .update({ expires_at: new Date().toISOString() })
      .eq('id', id);

    if (!error) {
      setCodes((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, expires_at: new Date().toISOString() } : c
        )
      );
    }
  }

  function getCodeStatus(code: CodeWithLeague): {
    label: string;
    className: string;
  } {
    if (code.expires_at && new Date(code.expires_at) < new Date()) {
      return { label: 'Expired', className: 'bg-red-100 text-red-800' };
    }
    if (code.max_uses && code.use_count >= code.max_uses) {
      return { label: 'Maxed Out', className: 'bg-gray-100 text-gray-800' };
    }
    return { label: 'Active', className: 'bg-green-100 text-green-800' };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading codes...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Signup Codes</h1>
          <p className="mt-1 text-gray-600">
            Generate and manage signup codes for your leagues.
          </p>
        </div>
        <Link
          href="/commissioner/codes/new"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Generate Code
        </Link>
      </div>

      {codes.length === 0 ? (
        <div className="mt-8 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
          <Key className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No signup codes yet
          </h3>
          <p className="mt-2 text-gray-600">
            Generate codes to invite people to your league.
          </p>
          <Link
            href="/commissioner/codes/new"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Generate Code
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  League
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Team
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Uses
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {codes.map((code) => {
                const status = getCodeStatus(code);
                const isActive = status.label === 'Active';

                return (
                  <tr key={code.id}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <code className="rounded bg-gray-100 px-2 py-1 text-sm font-mono">
                        {code.code}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm capitalize text-gray-700">
                      {code.role}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {code.league_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {code.team_name || '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                      {code.use_count}
                      {code.max_uses ? ` / ${code.max_uses}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopy(code.code, code.id)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Copy code"
                        >
                          {copiedId === code.id ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                        {isActive && (
                          <button
                            onClick={() => handleDeactivate(code.id)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Deactivate code"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
