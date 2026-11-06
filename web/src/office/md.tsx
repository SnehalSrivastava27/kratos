// Safe Markdown, built as nodes (never innerHTML), so nothing an agent or a SKILL.md says can run.
// 1. Telegram messages: the subset Switch converts for Telegram, in its order: `code`, # heading → bold,
//    "- " → "• ", **bold**, ~~strike~~, *italic*, _italic_, links only for http(s) and /gallery/ paths.
// 2. SKILL.md pages in the library: blocks (headings, lists, quotes, fenced code, rules) over the same
//    inline rules. Look of the page from agent-office's .md styles, adapted from AgentSystemLabs/agent-office
//    (MIT), Copyright (c) 2026 AgentSystemLabs (src/client/ui/markdown.ts + style.css).
import { Fragment, type ReactNode } from 'react';

import { inline, linesOf, tgLine, type Node } from './tgtext';
export { tgPlain, safeHref } from './tgtext';

// ---- React ----
function toReact(n: Node, k: number): ReactNode {
  if (typeof n === 'string') return n;
  const kids = n.kids.map(toReact);
  switch (n.t) {
    case 'code': return <code key={k} className="rounded bg-black/[0.07] px-1 font-mono text-[0.92em]">{kids}</code>;
    case 'b': return <strong key={k} className="font-semibold">{kids}</strong>;
    case 'i': return <em key={k}>{kids}</em>;
    case 's': return <s key={k}>{kids}</s>;
    case 'a': return <a key={k} href={n.href} target="_blank" rel="noopener noreferrer" className="text-[#1A6FB5] underline-offset-2 hover:underline">{kids}</a>;
  }
}
/** A Telegram message as React nodes, blank lines kept (render inside white-space: pre-wrap or with the <br/>s here). */
export function Tg({ text, max }: { text: string; max?: number }) {
  const lines = linesOf(text, max);
  return <>{lines.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{tgLine(l).map(toReact)}</Fragment>)}</>;
}

// ---- DOM (the engine's speech bubbles live outside React) ----
function toDom(n: Node): globalThis.Node {
  if (typeof n === 'string') return document.createTextNode(n);
  const el = document.createElement(n.t === 'b' ? 'strong' : n.t === 'i' ? 'em' : n.t);
  if (n.t === 'a') {
    (el as HTMLAnchorElement).href = n.href!;
    (el as HTMLAnchorElement).target = '_blank';
    (el as HTMLAnchorElement).rel = 'noopener noreferrer';
  }
  el.append(...n.kids.map(toDom));
  return el;
}
export function tgDom(text: string, max?: number): DocumentFragment {
  const f = document.createDocumentFragment();
  linesOf(text, max).forEach((l, i) => {
    if (i) f.append(document.createElement('br'));
    f.append(...tgLine(l).map(toDom));
  });
  return f;
}

// ---- SKILL.md pages ----
/** Splits off a leading `---` front-matter block (name/description), returned as pairs. */
export function frontMatter(src: string): { meta: [string, string][]; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { meta: [], body: src };
  const meta = m[1].split('\n').map((l) => /^([\w-]+):\s*(.*)$/.exec(l)).filter(Boolean).map((x) => [x![1], x![2].replace(/^["']|["']$/g, '')] as [string, string]);
  return { meta, body: src.slice(m[0].length) };
}

export function Markdown({ src }: { src: string }) {
  const out: ReactNode[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const il = (s: string) => inline(s).map(toReact);
  const flush = () => {
    if (para.length) out.push(<p key={out.length}>{il(para.join(' '))}</p>);
    para = [];
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{il(it)}</li>);
      out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    }
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const fence = /^\s*(```|~~~)/.exec(l);
    if (fence) {
      flush();
      const code: string[] = [];
      while (++i < lines.length && !lines[i].trim().startsWith(fence[1])) code.push(lines[i]);
      out.push(<pre key={out.length}><code>{code.join('\n')}</code></pre>);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(l);
    if (h) {
      flush();
      const H = `h${h[1].length}` as 'h1';
      out.push(<H key={out.length}>{il(h[2])}</H>);
    } else if (/^\s*(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/.test(l)) {
      flush();
      out.push(<hr key={out.length} />);
    } else if (li) {
      const ordered = /\d/.test(li[1]);
      if (para.length || (list && list.ordered !== ordered)) flush();
      list ??= { ordered, items: [] };
      list.items.push(li[2]);
    } else if (/^>\s?/.test(l)) {
      flush();
      out.push(<blockquote key={out.length}>{il(l.replace(/^>\s?/, ''))}</blockquote>);
    } else if (!l.trim()) flush();
    else if (list && /^\s{2,}/.test(l)) list.items[list.items.length - 1] += ' ' + l.trim();
    else {
      if (list) flush();
      para.push(l.trim());
    }
  }
  flush();
  return <div className="md">{out}</div>;
}
