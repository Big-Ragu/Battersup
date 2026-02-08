'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface RedeemResult {
  league_name: string;
  team_name: string | null;
  role: string;
}

export default function JoinLeaguePage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemResult | null>(null);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('redeem_signup_code', {
      p_code: code.trim(),
    });

    if (rpcError) {
      setError(rpcError.message);
      setLoading(false);
      return;
    }

    setResult(data as RedeemResult);
    setLoading(false);
  }

  if (result) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome to the league!</h1>
        <div className="mt-6 max-w-md rounded-lg border border-green-200 bg-green-50 p-6">
          <h3 className="font-semibold text-green-900">Successfully joined!</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-green-700">League:</dt>
              <dd className="font-medium text-green-900">{result.league_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-green-700">Role:</dt>
              <dd className="font-medium text-green-900 capitalize">{result.role}</dd>
            </div>
            {result.team_name && (
              <div className="flex justify-between">
                <dt className="text-green-700">Team:</dt>
                <dd className="font-medium text-green-900">{result.team_name}</dd>
              </div>
            )}
          </dl>
          <div className="mt-4">
            <button
              onClick={() => {
                router.push('/dashboard');
                router.refresh();
              }}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Join a League</h1>
      <p className="mt-1 text-gray-600">
        Enter the signup code from your league commissioner to join.
      </p>

      <form
        onSubmit={handleRedeem}
        className="mt-6 max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="code"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Signup Code
          </label>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-lg tracking-wider text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="BU-XXXXXX"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Joining...' : 'Join League'}
          </button>
          <Link
            href="/dashboard"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
