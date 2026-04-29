import type { SystemCheckResult } from '@shared/types';

interface Props {
  result: SystemCheckResult;
  onRetry(): void;
}

export function SystemCheckModal({ result, onRetry }: Props): JSX.Element {
  const missing: string[] = [];
  if (!result.ytdlp.installed) missing.push('yt-dlp');
  if (!result.ffmpeg.installed) missing.push('ffmpeg');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-lg font-semibold text-gray-900">Missing dependencies</h2>
        <p className="text-sm text-gray-600 mt-2">
          The following tools are required but not found on your system:{' '}
          <span className="font-mono text-red-600">{missing.join(', ')}</span>.
        </p>
        <p className="text-sm text-gray-700 mt-4">Install with Homebrew:</p>
        <pre className="mt-2 bg-gray-900 text-gray-100 rounded p-3 text-xs">
          brew install {missing.join(' ')}
        </pre>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full bg-gray-900 text-white rounded py-2 text-sm hover:bg-gray-800"
        >
          I&apos;ve installed them — re-check
        </button>
      </div>
    </div>
  );
}
