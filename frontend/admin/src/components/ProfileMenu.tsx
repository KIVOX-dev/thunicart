import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Smartphone, Monitor, User } from 'lucide-react';
import { useLogout, useSession } from '../features/auth/use-session';
import { useView } from '../app/view';

/** Profile dropdown with the view switch. The choice is remembered per user on this device. */
export function ProfileMenu() {
  const { data: me } = useSession();
  const { view, setPref } = useView();
  const logout = useLogout();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const item = 'flex w-full min-h-10 items-center gap-2 px-3 text-left text-sm text-navy hover:bg-mist';
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-10 items-center gap-2 rounded px-2 hover:bg-mist">
        <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">{me?.name.slice(0, 1).toUpperCase()}</span>
        <span className="hidden text-left text-xs md:block"><strong className="block">{me?.name}</strong><span className="text-muted">{me?.role.name}</span></span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded border-2 border-navy-100 bg-white py-1 shadow-overlay">
          <Link role="menuitem" to="/profile" className={item} onClick={() => setOpen(false)}><User aria-hidden size={16} />My profile</Link>
          {view === 'desktop'
            ? <button role="menuitem" className={item} onClick={() => { setPref('mobile'); setOpen(false); }}><Smartphone aria-hidden size={16} />Switch to mobile view</button>
            : <button role="menuitem" className={item} onClick={() => { setPref('desktop'); setOpen(false); }}><Monitor aria-hidden size={16} />Switch to desktop view</button>}
          <button role="menuitem" className={item} onClick={async () => { await logout.mutateAsync(); nav('/login'); }}><LogOut aria-hidden size={16} />Sign out</button>
        </div>
      )}
    </div>
  );
}
