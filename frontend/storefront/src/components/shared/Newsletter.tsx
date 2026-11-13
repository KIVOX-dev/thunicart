'use client';
import { useState } from 'react';

/** Newsletter box. It only checks the email shape here, and the sign up goes to the API. */
export function Newsletter() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'ok' | 'bad'>('idle');
  return (
    <form className="mt-5 max-w-sm" noValidate onSubmit={(e) => { e.preventDefault(); setState(/^\S+@\S+\.\S+$/.test(email) ? 'ok' : 'bad'); }} aria-label="Newsletter">
      <label htmlFor="news-email" className="text-xs font-medium uppercase tracking-heading">Get offers by email</label>
      <div className="mt-2 flex gap-2">
        <input id="news-email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setState('idle'); }} aria-invalid={state === 'bad'} aria-describedby="news-msg" placeholder="Your email" className="min-h-11 w-full rounded-sm border border-white/40 bg-transparent px-3 text-base text-white placeholder:text-white/70" />
        <button type="submit" className="min-h-11 rounded-full tk-press shadow-soft hover:bg-navy hover:text-white hover:shadow-lift bg-orange px-4 text-sm font-bold text-navy ">Join</button>
      </div>
      <p id="news-msg" role="status" className="mt-1 min-h-5 text-xs">{state === 'ok' ? 'Thank you. You are on the list.' : state === 'bad' ? 'Enter a valid email address.' : ''}</p>
    </form>
  );
}
