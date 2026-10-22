/** Five rounded bars, short-tall-mid-tall-short, as in Grok's voice button. */
export function VoiceWaveIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M3.5 7.75v4.5M6.75 4v12M10 6.75v6.5M13.25 4v12M16.5 7.75v4.5" />
    </svg>
  );
}
