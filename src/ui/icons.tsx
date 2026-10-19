// Icons from the design export. All decorative: buttons carry aria-labels.

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  viewBox: '0 0 24 24',
};

export const UndoIcon = () => (
  <svg width="16" height="16" strokeWidth="1.7" {...common}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);

export const RedoIcon = () => (
  <svg width="16" height="16" strokeWidth="1.7" {...common}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);

export const SettingsIcon = () => (
  <svg width="16" height="16" strokeWidth="1.6" {...common}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);

export const HelpIcon = () => (
  <svg width="16" height="16" strokeWidth="1.6" {...common}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.4" />
    <path d="M12 16.8v.2" />
  </svg>
);

export const DownloadIcon = () => (
  <svg width="14" height="14" strokeWidth="1.8" {...common}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M4 21h16" />
  </svg>
);

export const BackIcon = () => (
  <svg width="14" height="14" strokeWidth="1.8" {...common}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

export const CheckIcon = () => (
  <svg width="14" height="14" strokeWidth="2" {...common}>
    <path d="M5 12l4 4 10-10" />
  </svg>
);

export const PencilIcon = () => (
  <svg width="13" height="13" strokeWidth="1.8" {...common}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);

export const TrashIcon = () => (
  <svg width="13" height="13" strokeWidth="1.8" {...common}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </svg>
);

export const PanelCloseIcon = () => (
  <svg width="16" height="16" strokeWidth="1.6" {...common}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
    <path d="M16 10l-2 2 2 2" />
  </svg>
);

export const PanelOpenIcon = () => (
  <svg width="16" height="16" strokeWidth="1.6" {...common}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
    <path d="M14 10l2 2-2 2" />
  </svg>
);

/** CHK-06: the black-and-white warning marker on a flagged triple. */
export const FlagIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} strokeWidth="2" {...common}>
    <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);
