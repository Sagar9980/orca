export function OrcaMark() {
  return (
    <svg viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path
        d="M3 21.5c6.5-.6 10.6-6.6 12.4-18.3 1.7 1 2.9 3 2.9 6.4 0 6.2 2.6 9.9 6.7 11.9"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 25.2c3-1.4 5.4-1.4 8 0s5 1.4 8 0 5.2-1.4 8 0"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity=".55"
      />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <rect x="3" y="2" width="3" height="10" rx="1" />
      <rect x="8" y="2" width="3" height="10" rx="1" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
      <path d="M4 2.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5z" />
    </svg>
  );
}

export function ThemeIcon() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="7" cy="7" r="5.2" />
      <path d="M7 1.8v10.4a5.2 5.2 0 0 0 0-10.4z" fill="currentColor" />
    </svg>
  );
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M1 5h11M8.5 1.5 12 5 8.5 8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Shell icons: 16px grid, drawn with the current text colour.
function Stroke({ d, width = 1.7 }: { d: string; width?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const FolderIcon = () => <Stroke d="M2 4.6c0-.9.7-1.6 1.6-1.6h2.7l1.5 1.5h4.6c.9 0 1.6.7 1.6 1.6v5.3c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6V4.6z" />;
export const BranchIcon = () => <Stroke d="M4.5 2.5v8M11.5 6.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 0c0 3.2-4 2.6-7 4.2m0 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" width={1.5} />;
export const PlusIcon = () => <Stroke d="M8 3v10M3 8h10" />;
export const ComposeIcon = () => <Stroke d="M3 13h2.8L13 5.8 10.2 3 3 10.2V13zM8.8 4.4l2.8 2.8" />;
export const ChevronIcon = () => <Stroke d="m6 3.5 4.5 4.5L6 12.5" width={1.9} />;
export const CaretIcon = () => <Stroke d="m4 6 4 4 4-4" width={2} />;
export const ArrowUpIcon = () => <Stroke d="M8 13V3M3.5 7.5 8 3l4.5 4.5" width={2} />;
export const SidebarIcon = () => <Stroke d="M3.5 2.5h9a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4a1.5 1.5 0 0 1 1.5-1.5zM6.5 2.5v11" width={1.5} />;
export const MenuIcon = () => <Stroke d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />;
export const CheckIcon = () => <Stroke d="m3 8.5 3.2 3L13 4.5" width={2} />;
export const BackIcon = () => <Stroke d="M10 3.5 5.5 8l4.5 4.5" width={1.9} />;
export const CoinIcon = () => <Stroke d="M8 2v12M10.8 4.8C10.4 3.9 9.4 3.4 8 3.4S5.2 4.1 5.2 5.4c0 2.9 5.6 1.7 5.6 4.6 0 1.3-1.2 2-2.8 2s-2.6-.6-3-1.6" width={1.5} />;
