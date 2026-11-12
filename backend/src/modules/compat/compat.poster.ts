import { SHAPES, shade } from './compat.art';

/** Department posters for the "Shop by category" tiles: bold title, tagline ribbons, offer tag, the garments and a Shop now pill. */
interface Poster { title: string; line2: string; tag: string; sub: string; bg: [string, string]; ribbon: string; accent: string; items: Array<[string, number]> }
const POSTERS: Record<string, Poster> = {
  'kurtis-and-sets': { title: 'KURTIS', line2: '& SETS', tag: 'TRENDING STYLES.', sub: 'FRESH COLOURS. EASY FITS.', bg: ['#FFE3EC', '#F9A8C4'], ribbon: '#B0124F', accent: '#FFD23F', items: [['kurti', 0], ['kurti', 3], ['frock', 5]] },
  innerwear: { title: 'INNERWEAR', line2: '', tag: 'EVERYDAY COMFORT.', sub: 'SOFT. BREATHABLE. TRUSTED.', bg: ['#FCE8F1', '#D9B8F0'], ribbon: '#6A1B9A', accent: '#FFD23F', items: [['camisole', 0], ['bra', 4], ['panty', 2]] },
  nightwear: { title: 'NIGHTWEAR', line2: '', tag: 'SLEEP IN COMFORT.', sub: 'LIGHT COTTON. SWEET DREAMS.', bg: ['#1B2A6B', '#4B2A86'], ribbon: '#F67025', accent: '#FFE27A', items: [['nighty', 0], ['nighty', 1], ['nighty', 4]] },
  bottoms: { title: 'LEGGINGS', line2: '& BOTTOMS', tag: 'STRETCH. MOVE. REPEAT.', sub: 'EVERY COLOUR. EVERY SIZE.', bg: ['#D9F4F1', '#7FD6CF'], ribbon: '#0B5E66', accent: '#FFD23F', items: [['leggings', 0], ['pants', 1], ['leggings', 2]] },
  men: { title: 'MEN', line2: 'ESSENTIALS', tag: 'VESTS. BRIEFS. TRUNKS.', sub: 'TOP BRANDS. HONEST PRICES.', bg: ['#DCE8FA', '#8DB2EA'], ribbon: '#0B1B54', accent: '#F67025', items: [['vest', 0], ['trunk', 2], ['brief', 5]] },
  kids: { title: 'KIDS', line2: 'WEAR', tag: 'PLAY ALL DAY.', sub: 'SOFT COTTON FOR LITTLE ONES.', bg: ['#FFF3C4', '#FFC56B'], ribbon: '#E0431B', accent: '#1F7A4D', items: [['frock', 0], ['tee', 7], ['frock', 2]] },
  accessories: { title: 'SHAWLS', line2: '& MORE', tag: 'THE FINISHING TOUCH.', sub: 'SHAWLS. TOWELS. SOCKS.', bg: ['#F3E3D0', '#D9A86B'], ribbon: '#7A1F2B', accent: '#FFD23F', items: [['shawl', 0], ['cloth', 1], ['socks', 0]] },
};
const FALLBACK: Poster = { title: 'NEW IN', line2: '', tag: 'NEW ARRIVALS.', sub: 'SHOP THE RANGE.', bg: ['#EEF1F8', '#B8C4E0'], ribbon: '#0B1B54', accent: '#F67025', items: [['cloth', 0], ['cloth', 2], ['cloth', 4]] };
const esc = (t: string) => t.replace(/&/g, '&amp;');

export function posterSvg(slug: string): string {
  const p = POSTERS[slug] ?? FALLBACK;
  const piece = (it: [string, number], x: number, y: number, sc: number, rot: number) => {
    const s = SHAPES[it[0]] ?? SHAPES.cloth!; const base = s.palette[it[1] % s.palette.length]!;
    return `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${sc}) translate(-450 -600)" filter="url(#ps)">${s.draw(base, shade(base, -0.45), shade(base, 0.55))}</g>`;
  };
  const font = `font-family="Impact, 'Arial Black', sans-serif" font-style="italic"`;
  const two = !!p.line2; const big = two ? 150 : 132;
  const fit = (t: string, size: number, max: number) => (t.length * 0.56 * size > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '');
  const bandY = two ? 330 : 232;
  const spark = (x: number, y: number, r: number) => `<path d="M${x} ${y - r}l${r * 0.28} ${r * 0.72} ${r * 0.72} ${r * 0.28}-${r * 0.72} ${r * 0.28}-${r * 0.28} ${r * 0.72}-${r * 0.28}-${r * 0.72}-${r * 0.72}-${r * 0.28} ${r * 0.72}-${r * 0.28}Z" fill="#fff" opacity=".85"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 900" width="900" height="900"><defs>`,
    `<linearGradient id="pb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/></linearGradient>`,
    `<radialGradient id="pg" cx="50%" cy="72%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
    `<filter id="ps" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".28"/></filter>`,
    `<filter id="ts" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="5" flood-color="#000" flood-opacity=".3"/></filter></defs>`,
    `<rect width="900" height="900" fill="url(#pb)"/><circle cx="820" cy="80" r="220" fill="#fff" opacity=".18"/><circle cx="60" cy="860" r="260" fill="#fff" opacity=".16"/><rect width="900" height="900" fill="url(#pg)"/>`,
    spark(90, 120, 26), spark(805, 96, 18), spark(840, 560, 22), spark(70, 600, 16),
    `<ellipse cx="450" cy="846" rx="360" ry="24" fill="#000" opacity=".12"/>`,
    piece(p.items[0]!, 225, 668, 0.46, -9), piece(p.items[2]!, 675, 668, 0.46, 9), piece(p.items[1]!, 450, 662, 0.56, 0),
    `<g transform="rotate(-5 450 240)" filter="url(#ts)">`,
    `<text x="450" y="${two ? 172 : 190}" text-anchor="middle" ${font} font-size="${big}" fill="${p.ribbon}" stroke="#fff" stroke-width="10" paint-order="stroke"${fit(p.title, big, 760)}>${esc(p.title)}</text>`,
    two ? `<text x="450" y="292" text-anchor="middle" ${font} font-size="112" fill="${p.ribbon}" stroke="#fff" stroke-width="9" paint-order="stroke"${fit(p.line2, 112, 660)}>${esc(p.line2)}</text>` : '',
    `<path d="M110 ${bandY}h700l-26 74H84Z" fill="${p.ribbon}"/><text x="447" y="${bandY + 53}" text-anchor="middle" ${font} font-size="46" fill="#fff"${fit(p.tag, 46, 620)}>${esc(p.tag)}</text>`,
    `<path d="M170 ${bandY + 88}h580l-22 56H148Z" fill="${p.accent}"/><text x="449" y="${bandY + 128}" text-anchor="middle" ${font} font-size="32" fill="${p.ribbon}"${fit(p.sub, 32, 520)}>${esc(p.sub)}</text>`,
    `</g>`,
    `<g transform="translate(790 ${bandY + 190}) rotate(14)" filter="url(#ts)"><path d="M-52 -40h76l34 40-34 40h-76Z" fill="#E11D48"/><circle cx="30" cy="0" r="7" fill="#fff"/><text x="-16" y="15" text-anchor="middle" font-family="Arial Black, Impact, sans-serif" font-size="40" fill="#fff">%</text></g>`,
    `<g filter="url(#ts)"><rect x="40" y="806" width="220" height="60" rx="30" fill="#fff"/><text x="150" y="846" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="30" fill="${p.ribbon}">Shop now</text></g></svg>`,
  ].join('');
}
