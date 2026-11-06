// "Hire a teammate": E at an empty desk, or from the command bar. The form follows agent-office's
// ui/employees.ts (a name, a role and skill set, installed skills as chips to attach) and ui/prompt.ts
// (the window), adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs.
import { useMemo, useState } from 'react';
import { ExternalLink, UserPlus } from 'lucide-react';
import { HIRE_ICONS } from './icons';
import type { Library, RoomId } from '../shared/types';
import type { HireBody, HireResult } from './api';
import { TG_GROUP, deskById, zoneById } from './data';
import { Modal } from './Hud';
import { ROOMS } from './Telegram';
import { SHELF_LABEL } from './engine/library';


const COLORS = ['#ef476f', '#ff8a5b', '#f4a300', '#06d6a0', '#118ab2', '#5bc0eb', '#9d4edd', '#2b2d42'];
/** Links we'll open for the console step: the web, or the Switch desktop app (switchdash://open/template/<id>). Nothing else. */
/** The server takes at most this many skills per hire. */
const MAX_SKILLS = 20;
const safeUrl = (u: string) => /^(https?|switchdash):\/\//i.test(u);

export function HireDialog({ desk, room0, library, libError, onRetry, onClose, onHire }: {
  desk?: string; room0: string; library: Library | null; libError?: string; onRetry: () => void; onClose: () => void;
  onHire: (b: HireBody) => Promise<{ data: HireResult; status: number }>;
}) {
  const [f, setF] = useState({ name: '', role: '', room: room0 as RoomId, emoji: HIRE_ICONS[0].emoji, color: COLORS[4], instructions: '' });
  const [skills, setSkills] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<{ url: string; label: string; name: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const books = useMemo(() => {
    const all = library?.shelves.flatMap((s) => s.books.map((b) => ({ ...b, shelf: s.id }))) ?? [];
    const t = q.trim().toLowerCase();
    return (t ? all.filter((b) => (b.name + ' ' + b.description).toLowerCase().includes(t)) : all).slice(0, 60);
  }, [library, q]);
  const where = desk ? `${zoneById[deskById[desk]?.zone]?.label ?? 'desk'} · desk ${desk.split('#')[1]}` : null;

  const submit = async () => {
    if (!f.name.trim() || !f.role.trim() || !f.instructions.trim()) return setErr('Name, role and instructions are needed.');
    setBusy(true);
    setErr('');
    try {
      const r = await onHire({ ...f, name: f.name.trim(), role: f.role.trim(), instructions: f.instructions.trim(), skills });
      const d = r.data;
      // A 202 always means a human step is left: show it (with a link only when it's one we trust), never a silent success.
      if ('action' in d) setPending({ url: d.action.kind === 'open_url' && safeUrl(d.action.url) ? d.action.url : '', label: d.action.label || 'Finish in Switch Console', name: d.employee.name });
      else onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not hire');
    } finally {
      setBusy(false);
    }
  };

  if (pending)
    return (
      <Modal title="One more step" onClose={onClose}>
        <div className="ao-body text-[15px] font-bold">
          <p className="mb-4">{pending.name} has a desk, but Switch needs a human to finish creating the agent. Open the Switch Console, confirm, and they start work.</p>
          {pending.url ? (
            <a href={pending.url} target="_blank" rel="noopener noreferrer" className="ao-btn primary !h-11 !text-[15px]"><ExternalLink /> {pending.label}</a>
          ) : (
            <p className="text-[var(--muted)]">Open Switch Console and finish setting up {pending.name} there.</p>
          )}
        </div>
      </Modal>
    );

  return (
    <Modal title={<span className="inline-flex items-center gap-2"><UserPlus className="size-5" strokeWidth={2.5} /> Hire a teammate{where && <span className="ml-2 text-[13px] font-bold text-[var(--muted)]">{where}</span>}</span>} label="Hire a teammate" onClose={onClose} className="w-[min(720px,100%)]"
      footer={<>
        <span className="grow">{err ? <span className="text-[#C8303A]">{err}</span> : `They join ${TG_GROUP} on Telegram and walk in to their desk.`}</span>
        <button type="button" className="ao-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ao-btn primary" disabled={busy} onClick={() => void submit()}>{busy ? 'Hiring…' : 'Hire'}</button>
      </>}>
      <form className="ao-body grid gap-x-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), void submit())}>
        <label className="ao-field"><span>Name</span><input className="ao-input" maxLength={24} value={f.name} onChange={set('name')} placeholder="e.g. Meera" autoFocus /></label>
        <label className="ao-field"><span>Role</span><input className="ao-input" maxLength={60} value={f.role} onChange={set('role')} placeholder="e.g. Retention marketer" /></label>
        <label className="ao-field"><span>Topic / department</span>
          <select className="ao-input" value={f.room} onChange={set('room')}>
            {ROOMS.map((r) => <option key={r.id} value={r.id}>{r.topic}</option>)}
          </select>
        </label>
        <div className="ao-field"><span>Look</span>
          <div className="flex flex-wrap items-center gap-1">
            {HIRE_ICONS.map(({ Icon, emoji, name }) => (
              <button key={name} type="button" aria-label={`Icon ${name}`} aria-pressed={f.emoji === emoji} onClick={() => setF((s) => ({ ...s, emoji }))}
                className={`grid size-8 place-items-center rounded-lg ${f.emoji === emoji ? 'bg-white shadow-[0_2px_0_var(--ink)] ring-[2.5px] ring-[var(--ink)]' : 'hover:bg-black/5'}`}>
                <Icon size={18} color={f.color} strokeWidth={1.75} />
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={f.color === c} onClick={() => setF((s) => ({ ...s, color: c }))}
                className="size-6 rounded-full border-[3px]" style={{ background: c, borderColor: f.color === c ? 'var(--ink)' : 'transparent', boxShadow: f.color === c ? '0 2px 0 var(--ink)' : undefined }} />
            ))}
          </div>
        </div>
        <label className="ao-field sm:col-span-2"><span>Instructions</span>
          <textarea className="ao-input" rows={3} maxLength={4000} value={f.instructions} onChange={set('instructions')}
            placeholder="What they own and how they work, e.g. “Own repeat purchase: win-back flows, WhatsApp nudges, and a weekly cohort report in Analytics.”" />
        </label>
        <div className="ao-field sm:col-span-2 !mb-0">
          <span>Skills from the library <span className="font-bold text-[var(--muted)]">({skills.length}/{MAX_SKILLS} picked{library ? '' : libError ? '' : ' · loading…'})</span></span>
          <input className="ao-input !py-1.5 !text-[14px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search skills…" aria-label="Search skills" />
          <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
            {books.map((b) => {
              const on = skills.includes(b.id);
              return (
                <button key={b.id} type="button" title={`${SHELF_LABEL[b.shelf]} · ${b.description}`} aria-pressed={on}
                  disabled={!on && skills.length >= MAX_SKILLS} onClick={() => setSkills((s) => (on ? s.filter((x) => x !== b.id) : s.length < MAX_SKILLS ? [...s, b.id] : s))}
                  className={`rounded-full border-2 px-2.5 py-0.5 text-[12.5px] font-extrabold ${on ? 'border-[var(--ink)] bg-[var(--good)] text-white' : 'border-[var(--ink)]/20 bg-white hover:border-[var(--ink)]/50'} disabled:opacity-40`}>
                  /{b.name}
                </button>
              );
            })}
            {library && !books.length && <span className="text-[13px] text-[var(--muted)]">No skill matches “{q}”.</span>}
            {!library && libError && (
              <span className="flex items-center gap-2 text-[13px] text-[#C8303A]" role="alert">
                Skills didn't load ({libError}). <button type="button" className="ao-btn !h-7 !text-[12.5px]" onClick={onRetry}>Try again</button>
              </span>
            )}
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
