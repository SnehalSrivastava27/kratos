// The library window: shelves (departments) and their books down the left, the book's SKILL.md on the
// right. Ported from agent-office's ui/library.ts (list + page, "Taking the books down…", stale reads
// ignored), adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs.
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Library, LibraryBook, ShelfId } from '../shared/types';
import { getBook } from './api';
import { Modal } from './Hud';
import { Markdown, frontMatter } from './md';
import { SHELF_LABEL } from './engine/library';

export function LibraryWindow({ library, shelf0, onClose, onRecategorize }: {
  library: Library | null; shelf0?: ShelfId; onClose: () => void; onRecategorize: () => Promise<string>;
}) {
  const [open, setOpen] = useState<ShelfId | undefined>(shelf0 ?? library?.shelves.find((s) => s.books.length)?.id);
  const [reading, setReading] = useState<LibraryBook | null>(null);
  const [page, setPage] = useState<{ id: string; md?: string; err?: string } | null>(null);
  const [note, setNote] = useState('');
  const want = useRef('');
  const list = useRef<HTMLElement>(null);

  const read = async (b: LibraryBook) => {
    setReading(b);
    want.current = b.id;
    setPage({ id: b.id });
    try {
      const r = await getBook(b.id);
      if (want.current === b.id) setPage({ id: b.id, md: r.data.markdown });
    } catch (e) {
      if (want.current === b.id) setPage({ id: b.id, err: e instanceof Error ? e.message : 'Could not open that book.' });
    }
  };
  // Open the first book of the shelf you walked up to, and scroll it into view.
  useEffect(() => {
    if (reading || !library) return;
    const s = library.shelves.find((x) => x.id === open) ?? library.shelves.find((x) => x.books.length);
    if (s?.books[0]) void read(s.books[0]);
    list.current?.querySelector(`[data-shelf="${open}"]`)?.scrollIntoView({ block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library]);

  const total = library?.shelves.reduce((n, s) => n + s.books.length, 0) ?? 0;
  const fm = page?.md ? frontMatter(page.md) : null;
  const working = library?.librarian === 'working';
  return (
    <Modal className="ao-lib" onClose={onClose} label="Library"
      title={<>📚 Skills Library <span className="ml-1 text-[13px] font-bold text-[var(--muted)]">{library ? `${total} skills on ${library.shelves.length} shelves` : 'Taking the books down…'}</span></>}
      footer={<>
        <span className="grow">{note || (working ? '📚 The Librarian is re-shelving every skill…' : library?.updatedAt ? `Shelved ${new Date(library.updatedAt).toLocaleString()}` : 'The Librarian reads every installed skill and shelves it by department.')}</span>
        <button type="button" className="ao-btn" disabled={working} onClick={() => onRecategorize().then(setNote, (e) => setNote(`Could not start: ${e instanceof Error ? e.message : e}`))}>
          <RefreshCw /> Re-shelve with the Librarian
        </button>
      </>}>
      <div className="ao-lib-body">
        <nav ref={list} className="ao-lib-list" aria-label="Shelves">
          {library?.shelves.map((s) => (
            <section key={s.id} data-shelf={s.id}>
              <button type="button" className="ao-lib-shelf" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? undefined : s.id)}>
                <span>{SHELF_LABEL[s.id] ?? s.label}</span><span className="ao-lib-n">{s.books.length}</span>
              </button>
              {open === s.id && s.books.map((b) => (
                <button key={b.id} type="button" title={b.why || b.description} className={`ao-lib-book${reading?.id === b.id ? ' on' : ''}`} onClick={() => void read(b)}>
                  <span className="ao-lib-name">{b.name}</span>
                  <span className="ao-lib-dir">{b.source}</span>
                </button>
              ))}
              {open === s.id && !s.books.length && <p className="ao-lib-quiet !py-1 !text-[12.5px]">Nothing on this shelf yet.</p>}
            </section>
          ))}
        </nav>
        <article className="ao-lib-page">
          {!page && <p className="ao-lib-quiet">{library ? 'Pick a book.' : 'Taking the books down…'}</p>}
          {page && !page.md && !page.err && <p className="ao-lib-quiet">Opening…</p>}
          {page?.err && <p className="ao-lib-quiet">{page.err}</p>}
          {fm && reading && (
            <>
              <div className="ao-lib-head">
                <div className="text-[20px] font-black">📕 {reading.name}</div>
                <div className="text-[13px] font-bold text-[var(--muted)]">{SHELF_LABEL[reading.department]} · {reading.source}</div>
                {reading.why && <div className="mt-1.5 text-[13.5px] font-bold">🏷️ {reading.why}</div>}
              </div>
              <Markdown src={fm.body} />
            </>
          )}
        </article>
      </div>
    </Modal>
  );
}
