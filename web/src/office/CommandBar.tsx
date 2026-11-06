// The founder's command bar (/ or Ctrl+K): write into any Telegram topic of the group, or jump to an
// office action. Sending is optimistic: "sending…", then "sent ✓"; the message itself comes back through
// the event feed like any Telegram message. Window shell from agent-office's ui/prompt.ts (Enter to send,
// Shift+Enter for a new line), adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs.
import { useState } from 'react';
import { ArrowUp, BookOpen, Megaphone, PackageSearch, UserPlus } from 'lucide-react';
import type { RoomId } from '../shared/types';
import { TG_GROUP } from './data';
import { Modal } from './Hud';
import { ROOMS, TopicIcon } from './Telegram';

type Status = { k: 'idle' } | { k: 'sending' } | { k: 'sent'; text: string; room: string; mock: boolean } | { k: 'error'; msg: string };

export function CommandBar({ room0, text0 = '', onClose, onSend, onHire, onLibrary }: {
  room0: string; text0?: string; onClose: () => void;
  onSend: (room: RoomId, text: string) => Promise<{ mock: boolean }>; onHire: () => void; onLibrary: () => void;
}) {
  const [room, setRoom] = useState(room0);
  const [text, setText] = useState(text0);
  const [status, setStatus] = useState<Status>({ k: 'idle' });
  const topic = ROOMS.find((r) => r.id === room)!;

  const send = async (body = text.trim(), to = room) => {
    if (!body || status.k === 'sending') return;
    setStatus({ k: 'sending' });
    try {
      const r = await onSend(to as RoomId, body);
      setStatus({ k: 'sent', text: body, room: to, mock: r.mock });
      setText('');
    } catch (e) {
      setStatus({ k: 'error', msg: e instanceof Error ? e.message : 'Could not send' });
    }
  };
  const quick: { icon: JSX.Element; label: string; run: () => void }[] = [
    { icon: <Megaphone />, label: 'Plan a sale…', run: () => (setRoom('war_room'), setText('@Sale Captain Plan a sale: ')) },
    { icon: <PackageSearch />, label: 'Ask Ops for stock risks', run: () => (setRoom('ops'), void send('@Ops Lead What are our stock risks for the next 2 weeks? Flag any SKU under 10 days of cover.', 'ops')) },
    { icon: <UserPlus />, label: 'Hire a teammate', run: onHire },
    { icon: <BookOpen />, label: 'Open library', run: onLibrary },
  ];

  return (
    <Modal top className="w-[min(640px,100%)]" onClose={onClose} label="Command bar" title={<span className="flex items-center gap-2">⌘ Message the team <span className="text-[13px] font-bold text-[var(--muted)]">· {TG_GROUP}</span></span>}>
      <div className="ao-body !pb-3">
        <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Topic">
          {ROOMS.map((r) => (
            <button key={r.id} type="button" role="radio" aria-checked={r.id === room} onClick={() => setRoom(r.id)}
              className={`flex items-center gap-1.5 rounded-full border-2 py-0.5 pr-2.5 pl-0.5 text-[13px] font-extrabold transition-colors ${r.id === room ? 'border-[#3390EC] bg-[#3390EC] text-white' : 'border-[var(--ink)]/15 bg-white hover:border-[#3390EC]/50'}`}>
              <TopicIcon room={r.id} size={24} /> {r.topic}
            </button>
          ))}
        </div>
        <form className="flex items-end gap-2" onSubmit={(e) => (e.preventDefault(), void send())}>
          <textarea autoFocus rows={2} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} aria-label={`Message in ${topic.topic}`}
            placeholder={`Message in ${topic.topic}…`} className="ao-input min-h-[52px] flex-1 !rounded-[18px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) (e.preventDefault(), void send());
            }} />
          <button type="submit" disabled={!text.trim() || status.k === 'sending'} aria-label="Send"
            className="grid size-[52px] shrink-0 place-items-center rounded-full border-[3px] border-[var(--ink)] bg-[#3390EC] text-white shadow-[0_3px_0_var(--ink)] disabled:opacity-40">
            <ArrowUp className="size-6" strokeWidth={3} />
          </button>
        </form>
        <div className="mt-2 min-h-5 text-[13px] font-bold" aria-live="polite">
          {status.k === 'sending' && <span className="text-[var(--muted)]">Sending to {topic.topic}<span className="hq-dots" /></span>}
          {status.k === 'sent' && (
            <span className="text-[#0F7A4F]">Sent ✓ to {ROOMS.find((r) => r.id === status.room)?.topic}{status.mock ? ' (demo: no server, echoed locally)' : ' · it will show up in the chat when Telegram echoes it'}</span>
          )}
          {status.k === 'error' && <span className="text-[#C8303A]">Not sent: {status.msg}</span>}
          {status.k === 'idle' && <span className="text-[var(--muted)]">Enter to send · Shift+Enter for a new line · @name to mention</span>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-t-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 sm:grid-cols-4">
        {quick.map((q) => (
          <button key={q.label} type="button" className="ao-btn !h-auto !justify-start !py-2 text-left !whitespace-normal !text-[13px]" onClick={q.run}>
            {q.icon}{q.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
