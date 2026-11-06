// Adapted from AgentSystemLabs/agent-office (MIT), Copyright (c) 2026 AgentSystemLabs
// src/client/ui/dom.ts (openModal: backdrop, Esc / click-outside to close) and ui/hud.ts (openHelp's
// controls grid). The HUD bits shared by every overlay: the modal shell, the help window, the hint chip.
import { useEffect, useRef, type ReactNode } from 'react';
import { Gamepad2, X } from 'lucide-react';
import { TG_GROUP } from './data';

/** A cartoon window over the office. Esc is handled by the Office (it closes the top-most thing). */
export function Modal({ title, onClose, children, footer, className = '', top = false, label }: {
  title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; className?: string; top?: boolean; label?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus the first field (or the window itself) so typing goes here, not to the walk keys.
    const q = (sel: string) => box.current?.querySelector<HTMLElement>(sel);
    const el = q('textarea, input:not([type=hidden])') ?? q('button:not(.ao-x)') ?? box.current;
    el?.focus();
  }, []);
  return (
    <div className={`ao-backdrop${top ? ' top' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} className={`ao-modal ${className}`}>
        <header>
          <h2>{title}</h2>
          <button type="button" className="ao-x" aria-label="Close" onClick={onClose}><X /></button>
        </header>
        {children}
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

const CONTROLS: [string, string][] = [
  ['W A S D / ← ↑ → ↓', 'Walk (hold Shift to run). Click the floor to walk there'],
  ['E', 'Use what you face: hire at an empty desk, open the library, talk to a teammate, pet the dog, play the jukebox'],
  ['N', 'Jump to whoever is waiting on you (the red ring)'],
  ['T', 'Open the chat'],
  ['/ or Ctrl K', 'Command bar: message any Telegram topic, or hire, or open the library'],
  ['F', 'Fullscreen'],
  ['Drag · wheel', 'Turn the camera · zoom'],
  ['Eye button', 'Spectator: the whole-office camera (click a zone to fly there)'],
  ['Esc', 'Close any window or panel'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title={<span className="inline-flex items-center gap-2"><Gamepad2 className="size-5" strokeWidth={2.5} /> Controls</span>} label="Controls" onClose={onClose}>
      <div className="ao-body">
        <div className="help-grid">
          {CONTROLS.flatMap(([k, v]) => [<span key={k} className="ao-key">{k}</span>, <span key={v}>{v}</span>])}
        </div>
        <p className="mt-4 text-[13px] font-bold text-[var(--muted)]">
          You are the founder (the crown badge). Everyone else is an agent in the {TG_GROUP} Telegram group: what they say in a topic
          shows up here, and what you send from the command bar goes to that topic.
        </p>
      </div>
    </Modal>
  );
}

/** "E · Hire at this desk": what pressing E would do, at the bottom of the screen. */
export function Hint({ k = 'E', title, text, red }: { k?: string; title?: ReactNode; text: string; red?: boolean }) {
  return (
    <div className={`ao-hint${red ? ' red' : ''}`} role="status">
      <span><span className="ao-key">{k}</span>{title && <span className="title">{title}</span>}{text}</span>
    </div>
  );
}

export const isTyping = (e: Event) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};
