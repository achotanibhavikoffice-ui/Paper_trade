import type { NewsEntity } from '../../api';

/** Only absolute http(s) links may be opened; blocks javascript:/data: URLs from upstream data. */
export function safeArticleUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function formatPublished(iso: string | null | undefined, now: Date = new Date()): { relative: string; absolute: string } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const minutes = Math.round((now.getTime() - date.getTime()) / 60000);
  let relative: string;
  if (minutes < 1) relative = 'just now';
  else if (minutes < 60) relative = `${minutes}m ago`;
  else if (minutes < 60 * 24) relative = `${Math.floor(minutes / 60)}h ago`;
  else if (minutes < 60 * 24 * 7) relative = `${Math.floor(minutes / (60 * 24))}d ago`;
  else relative = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return { relative, absolute: date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) };
}

export const sentimentStyles: Record<string, { label: string; className: string }> = {
  positive: { label: 'Positive', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  negative: { label: 'Negative', className: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  neutral: { label: 'Neutral', className: 'bg-slate-500/10 text-slate-600 border-slate-500/30' },
};

export function entityLabel(entity: NewsEntity): string {
  return entity.symbol ?? entity.name ?? 'Unknown';
}
