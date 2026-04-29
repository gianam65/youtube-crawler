import { useState } from 'react';

interface Props {
  onSubmit(url: string): void;
  busy: boolean;
}

export function UrlInput({ onSubmit, busy }: Props): JSX.Element {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 px-4 py-3 border-b border-gray-200 bg-white pt-12"
    >
      <input
        type="url"
        placeholder="Paste a YouTube URL..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={busy}
        className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      />
      <button
        type="submit"
        disabled={busy || !value.trim()}
        className="px-4 py-1.5 text-sm rounded bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {busy ? 'Loading...' : '+ Add'}
      </button>
    </form>
  );
}
