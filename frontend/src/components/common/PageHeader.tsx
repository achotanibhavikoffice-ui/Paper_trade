import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: ReactNode;
}

export function PageHeader({ title, eyebrow, description, breadcrumbs, actions }: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-2 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumbs">
            <Link to="/dashboard" className="hover:text-slate-700 transition-colors">Workspace</Link>
            {breadcrumbs.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <ChevronRight size={12} className="text-slate-600" />
                {item.href ? (
                  <Link to={item.href} className="hover:text-slate-700 transition-colors">{item.label}</Link>
                ) : (
                  <span className="text-slate-700 font-medium">{item.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <span className="eyebrow block mb-1">{eyebrow}</span>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500 max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
