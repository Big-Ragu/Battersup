'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Field } from '@batters-up/shared';
import { ArrowLeft } from 'lucide-react';

export default function EditFieldPage() {
  const params = useParams();
  const fieldId = params.id as string;

  const [field, setField] = useState<Field | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [diamondCount, setDiamondCount] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadField() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('fields')
        .select('*')
        .eq('id', fieldId)
        .single();

      if (error || !data) {
        setMessage({ type: 'error', text: 'Field not found.' });
        setLoading(false);
        return;
      }

      const fieldData = data as Field;
      setField(fieldData);
      setName(fieldData.name);
      setAddress(fieldData.address || '');
      setDiamondCount(fieldData.diamond_count);
      setNotes(fieldData.notes || '');
      setLoading(false);
    }
    loadField();
  }, [fieldId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setMessage({ type: 'error', text: 'Field name is required.' });
      return;
    }

    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from('fields')
      .update({
        name: name.trim(),
        address: address.trim() || null,
        diamond_count: diamondCount,
        notes: notes.trim() || null,
      })
      .eq('id', fieldId);

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setMessage({ type: 'success', text: 'Field updated successfully.' });
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading field...</div>
      </div>
    );
  }

  if (!field) {
    return (
      <div>
        <Link
          href="/commissioner/fields"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fields
        </Link>
        <div className="mt-4 rounded-md bg-red-50 p-4 text-red-700">
          Field not found.
        </div>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/commissioner/fields"
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Fields
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-gray-900">Edit Field</h1>
      <p className="mt-1 text-gray-600">Update field details.</p>

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
      >
        {message && (
          <div
            className={`mb-4 rounded-md p-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mb-4">
          <label
            htmlFor="name"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Field Name *
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            required
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="address"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Address
          </label>
          <input
            id="address"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="diamondCount"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Number of Diamonds
          </label>
          <input
            id="diamondCount"
            type="number"
            value={diamondCount}
            onChange={(e) => setDiamondCount(parseInt(e.target.value, 10) || 1)}
            min={1}
            max={20}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label
            htmlFor="notes"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Notes
          </label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <Link
            href="/commissioner/fields"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
