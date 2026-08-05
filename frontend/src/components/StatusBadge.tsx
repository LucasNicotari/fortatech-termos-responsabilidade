import { statusLabel } from '../utils/format';

const tone: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  SENT: 'bg-blue-100 text-blue-800',
  VIEWED: 'bg-blue-100 text-blue-800',
  SIGNED: 'bg-emerald-100 text-emerald-800',
  FINISHED: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  ERROR: 'bg-coral/15 text-coral',
  CANCELED: 'bg-zinc-200 text-zinc-700',
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  INACTIVE: 'bg-zinc-200 text-zinc-700',
  SCHEDULED: 'bg-blue-100 text-blue-800',
  SENDING: 'bg-blue-100 text-blue-800',
  FAILED: 'bg-coral/15 text-coral',
  SKIPPED: 'bg-zinc-200 text-zinc-700',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  UNKNOWN: 'bg-zinc-100 text-zinc-700'
};

export function StatusBadge({ status }: { status?: string }) {
  return (
    <span className={`inline-flex min-w-20 items-center justify-center rounded px-2 py-1 text-xs font-semibold ${tone[status || ''] || 'bg-zinc-100 text-zinc-700'}`}>
      {statusLabel(status)}
    </span>
  );
}
