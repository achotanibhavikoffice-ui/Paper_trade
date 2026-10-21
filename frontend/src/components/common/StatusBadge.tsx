import type { OrderStatus, OrderProduct, OrderSide } from '../../types';

export interface StatusBadgeProps {
  status: OrderStatus | OrderProduct | OrderSide | string;
  variant?: 'status' | 'product' | 'side';
}

export function StatusBadge({ status, variant = 'status' }: StatusBadgeProps) {
  let badgeClass = 'px-2 py-0.5 text-xs font-semibold rounded inline-flex items-center gap-1 ';

  if (variant === 'side') {
    if (status === 'BUY') {
      badgeClass += 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    } else {
      badgeClass += 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
    }
  } else if (variant === 'product') {
    if (status === 'MIS') {
      badgeClass += 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
    } else {
      badgeClass += 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30';
    }
  } else {
    switch (status) {
      case 'FILLED':
      case 'ACTIVE':
        badgeClass += 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        break;
      case 'PENDING':
      case 'OPEN':
      case 'PARTIALLY_FILLED':
        badgeClass += 'bg-amber-500/15 text-amber-300 border border-amber-500/30';
        break;
      case 'CANCELLED':
      case 'REJECTED':
        badgeClass += 'bg-rose-500/15 text-rose-400 border border-rose-500/30';
        break;
      default:
        badgeClass += 'bg-slate-700/50 text-slate-600 border border-slate-600/50';
    }
  }

  return <span className={badgeClass}>{status}</span>;
}
