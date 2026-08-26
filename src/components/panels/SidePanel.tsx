/**
 * Shared right-side slide-in panel shell (settings, help, layers all use the
 * same look and animation).
 */

import type { ReactNode } from 'react';

interface SidePanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  closeTitle: string;
  children: ReactNode;
}

export function SidePanel({ open, title, onClose, closeTitle, children }: SidePanelProps) {
  return (
    <div
      className={`
        fixed top-0 right-0 bottom-0 w-80 z-40
        bg-white/95 border-l border-slate-200 shadow-2xl backdrop-blur-sm
        dark:bg-slate-900/95 dark:border-slate-700
        transform transition-transform duration-200
        ${open ? 'translate-x-0' : 'translate-x-full'}
        flex flex-col
      `}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-sm font-bold text-dental-600 dark:text-dental-400 select-none">{title}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-200 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 rounded"
          title={closeTitle}
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {children}
      </div>
    </div>
  );
}
