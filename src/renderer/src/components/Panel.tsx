import type { ReactNode } from 'react';

interface PanelProps {
  title: string;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, className = '', children }: PanelProps) {
  return (
    <section aria-label={title} className={`flex min-h-0 flex-col ${className}`}>
      <h2 className="border-b border-line px-4 py-2 text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </section>
  );
}

/** Placeholder content for areas that later phases fill in. */
export function ComingSoon({ phase, children }: { phase: number; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-strong p-4 text-sm text-faint">
      <p>{children}</p>
      <p className="mt-2 text-xs text-faint">Arrives in Phase {phase}.</p>
    </div>
  );
}
