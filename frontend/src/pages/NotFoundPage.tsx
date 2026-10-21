import React from 'react';
import { Compass, Home, ArrowLeft } from 'lucide-react';

interface NotFoundPageProps {
  onNavigate?: (path: string) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onNavigate }) => {
  const handleHomeClick = () => {
    if (onNavigate) {
      onNavigate('/dashboard');
    } else {
      window.location.href = '/dashboard';
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-20 h-20 rounded-2xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-600 dark:text-teal-400 mb-6 shadow-sm">
        <Compass className="w-10 h-10 animate-spin-slow" />
      </div>

      <span className="text-xs font-mono font-bold tracking-widest text-teal-600 dark:text-teal-400 uppercase mb-2">
        Error 404
      </span>

      <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
        Page Not Found
      </h1>

      <p className="text-sm text-slate-500 dark:text-slate-500 max-w-md mb-8">
        The trading page or market resource you requested does not exist or has been relocated within the Quantx platform.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-200 bg-white dark:bg-slate-100 text-slate-700 dark:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-medium text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Go Back
        </button>

        <button
          onClick={handleHomeClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm transition-colors shadow-sm"
        >
          <Home className="w-4 h-4" />
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};

export default NotFoundPage;
