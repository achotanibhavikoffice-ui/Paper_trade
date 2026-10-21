import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { PackageOpen } from 'lucide-react';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon = PackageOpen, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-slate-200 bg-white/40 my-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100/80 text-slate-500 mb-3">
        <Icon size={22} />
      </div>
      <h3 className="text-base font-semibold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-4">{description}</p>
      {action}
    </div>
  );
}
