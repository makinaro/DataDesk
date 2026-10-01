import type { ReactNode } from 'react';

/** Small stroke icons in the current text colour. Decorative: buttons carry the label. */
function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const CompareIcon = () => (
  <Icon>
    <rect x="3" y="4" width="8" height="16" rx="1.5" />
    <rect x="13" y="4" width="8" height="16" rx="1.5" />
  </Icon>
);

export const TimelineIcon = () => (
  <Icon>
    <path d="M4 6h10M4 12h16M4 18h7" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
  </Icon>
);

export const ChartIcon = ({ size }: { size?: number }) => (
  <Icon size={size}>
    <path d="M5 20V10M12 20V4M19 20v-7" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon size={14}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
  </Icon>
);

export const SendIcon = () => (
  <Icon>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Icon>
);

export const StopIcon = () => (
  <Icon>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Icon>
);

/** The app mark: the installer icon's bar chart, in the theme's colours. */
export const LogoMark = () => (
  <span
    aria-hidden="true"
    className="grid h-5 w-5 place-items-center rounded-[5px] bg-fg text-canvas"
  >
    <ChartIcon size={13} />
  </span>
);
