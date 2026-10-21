import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: string | ReactNode;
  change?: string;
  isPositive?: boolean;
  subtext?: string;
  icon?: ReactNode;
  action?: ReactNode;
  highlight?: boolean;
}

export function StatCard({ label, value, change, isPositive, subtext, icon, action, highlight = false }: StatCardProps) {
  return (
    <article className={`stat-card ${highlight ? 'stat-main' : ''}`}>
      <div className="stat-label">
        <span>{label}</span>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {change && (
          <span className={`change-pill ${isPositive ? 'change-up' : 'change-down'}`}>
            {isPositive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {change}
          </span>
        )}
        {subtext && <span>{subtext}</span>}
        {action}
      </div>
    </article>
  );
}
