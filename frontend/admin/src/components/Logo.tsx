/** Placeholder wordmark until the logo files arrive in docs/source. */
export function Logo({ light = false, className = '' }: { light?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold uppercase tracking-heading ${light ? 'text-white' : 'text-navy'} ${className}`}>
      <svg aria-hidden width="24" height="24" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill={light ? '#FFFFFF' : '#0B1B54'} /><path d="M18 20h28v7H35v21h-7V27H18z" fill="#F67025" /><path d="M40 44c4 0 7-2 8-5" stroke="#0BBBB4" strokeWidth="3" fill="none" strokeLinecap="round" /></svg>
      Thunikart
    </span>
  );
}
