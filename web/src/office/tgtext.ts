// Telegram's Markdown subset as plain nodes (no DOM, no React), so tgtext.check.mjs runs under node.
// Order as Switch converts for Telegram: `code`, # heading → bold, "- " → "• ", **bold**, ~~strike~~, *italic*, _italic_, links (http(s) and /gallery/ only).

export type Node = string | { t: 'code' | 'b' | 'i' | 's' | 'a'; kids: Node[]; href?: string };

const INLINE = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|~~(.+?)~~|\*([^*\n]+?)\*|(?<![\w])_([^_\n]+?)_(?![\w])|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;
export const safeHref = (u: string) => (/^https?:\/\//i.test(u) || (/^\/gallery\/[\w./-]+$/.test(u) && !u.includes('..')) ? u : null);

/** One line of text → inline nodes. */
export function inline(s: string): Node[] {
  const out: Node[] = [];
  while (s) {
    const m = INLINE.exec(s);
    if (!m) {
      out.push(s);
      break;
    }
    if (m.index) out.push(s.slice(0, m.index));
    const [all, code, lt, lu, b, st, i1, i2, url] = m;
    if (code !== undefined) out.push({ t: 'code', kids: [code] });
    else if (lt !== undefined) {
      const href = safeHref(lu);
      out.push(href ? { t: 'a', href, kids: inline(lt) } : lt);
    } else if (b !== undefined) out.push({ t: 'b', kids: inline(b) });
    else if (st !== undefined) out.push({ t: 's', kids: inline(st) });
    else if (i1 !== undefined || i2 !== undefined) out.push({ t: 'i', kids: inline(i1 ?? i2) });
    else out.push({ t: 'a', href: url, kids: [url] });
    s = s.slice(m.index + all.length);
  }
  return out;
}

/** A Telegram line's block rules: "# Title" is bold, "- item" is "• item". */
export function tgLine(line: string): Node[] {
  const h = /^#{1,6}\s+(.*)$/.exec(line);
  if (h) return [{ t: 'b', kids: inline(h[1]) }];
  return inline(line.replace(/^(\s*)[-*]\s+/, '$1• '));
}

/** The message's lines, or just the first `max` non-empty ones (speech bubbles: the title and first fact). */
export const linesOf = (text: string, max?: number) => {
  const all = text.split('\n');
  if (!max) return all;
  return all.filter((l) => l.trim()).slice(0, max);
};

// ---- Plain text (canvas walls, list previews, captions) ----
const plainOf = (ns: Node[]): string => ns.map((n) => (typeof n === 'string' ? n : plainOf(n.kids))).join('');
export const tgPlain = (text: string) => text.split('\n').map((l) => plainOf(tgLine(l))).join('\n');

