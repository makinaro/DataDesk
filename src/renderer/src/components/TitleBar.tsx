import type { ReactNode } from 'react';
import { LogoMark } from './icons';

/**
 * The window's title bar. The whole bar drags the window (app-region in styles.css); buttons
 * opt out. The right edge stops where Windows draws the native window controls.
 */
export function TitleBar({ children }: { children: ReactNode }) {
  return (
    <header className="titlebar flex shrink-0 items-center gap-1 border-b border-line bg-surface pl-3">
      <span className="flex items-center gap-2 pr-3 text-[13px] font-semibold select-none">
        <LogoMark />
        <h1>DataDesk</h1>
      </span>
      {children}
    </header>
  );
}

interface TitleBarButtonProps {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
  onClick: () => void;
}

export function TitleBarButton({ label, icon, pressed, onClick }: TitleBarButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] hover:bg-raised hover:text-fg ${
        pressed ? 'bg-strong text-fg' : 'text-muted'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
