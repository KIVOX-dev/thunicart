import type { ReactNode } from 'react';

/**
 * Policy and page text. A paragraph is separated by a blank line. A line starting with "## " is a heading,
 * and a block whose lines start with "- " is a bullet list. Everything else is a normal paragraph. No HTML is ever rendered.
 */
export function RichText({ blocks }: { blocks: string[] }) {
  const out: ReactNode[] = [];
  blocks.forEach((raw, i) => {
    const text = raw.trim();
    if (!text) return;
    if (text.startsWith('## ')) {
      out.push(<h2 key={i} className="mt-4 text-xl font-bold text-navy md:text-2xl">{text.slice(3)}</h2>);
      return;
    }
    const lines = text.split('\n');
    if (lines.every((l) => l.startsWith('- '))) {
      out.push(<ul key={i} className="list-disc space-y-1.5 pl-6">{lines.map((l, n) => <li key={n}>{l.slice(2)}</li>)}</ul>);
      return;
    }
    out.push(<p key={i}>{text}</p>);
  });
  return <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-navy/90">{out}</div>;
}
