import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Copy, ExternalLink, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo, TwoTone } from '@/landing/ui';
import { cn } from '@/lib/utils';
import { api, ApiError, isMock, type ConnectCode, type ConnectStatus } from './api';
import { useAuth } from './AuthProvider';
import ConnectPreview from './ConnectPreview';

const BOT = 'kratosd2c_bot';
const POLL_MS = 2000;
const STEPS = ['Your group', 'Bot admin', 'Send code'];
const TAPS: ReactNode[] = [
  'Open the group',
  'Tap the group name, then Edit',
  <>Turn <b>Topics</b> on</>,
  'Administrators',
  'Add Admin',
  <>Search <b>@{BOT}</b></>,
  <>Turn <b>Manage topics</b> on, then Save</>,
];

export default function Connect() {
  const { user, workspaces, refresh, logout, expire } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState<ConnectCode | null>(null);
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [issueErr, setIssueErr] = useState(false);
  const [pollErr, setPollErr] = useState(false);
  const [now, setNow] = useState(Date.now());
  const issuing = useRef(false);
  const hasOffice = workspaces.some((w) => w.status === 'ready');

  const issue = useCallback(async () => {
    if (issuing.current) return;
    issuing.current = true;
    setIssueErr(false);
    try {
      const c = await api.connect();
      setCode(c);
      setStatus({ state: 'waiting' });
      setNow(Date.now());
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return expire(); // session gone → RequireAuth sends you to /login
      setIssueErr(true);
    } finally {
      issuing.current = false;
    }
  }, [expire]);

  useEffect(() => { if (step === 2 && !code) void issue(); }, [step, code, issue]);

  const left = code ? Math.max(0, code.expiresAt - now) : 0;
  const state = status?.state === 'waiting' && code && left === 0 ? 'expired' : status?.state;
  const live = !!code && state !== 'ready' && state !== 'expired';

  // Poll the link status every 2 s while a code is live (on any step: needs_admin sends you back to step 2).
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        const s = await api.connectStatus();
        if (stop) return;
        setPollErr(false);
        setStatus(s);
        if (s.state === 'ready') void refresh();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return expire();
        if (!stop) setPollErr(true);
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => { stop = true; clearInterval(id); };
  }, [live, refresh, expire]);

  useEffect(() => {
    if (!code || state === 'ready') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [code, state]);

  useEffect(() => { if (state === 'ready') setStep(2); }, [state]);

  const bot = code?.botUsername ?? BOT;
  const ws = status?.workspace;

  return (
    <div className="min-h-svh bg-canvas text-foreground antialiased selection:bg-saffron/25">
      <header className="sticky top-0 z-30 border-b border-black/[0.07] bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1264px] items-center gap-3 px-5 md:px-12">
          <Link to="/" aria-label="Kratos home"><Logo /></Link>
          <div className="ml-auto flex items-center gap-1.5">
            {hasOffice && (
              <Button variant="ghost" className="h-9 rounded-full px-3 text-[14px]" render={<Link to="/app" />} nativeButton={false}>
                <ArrowLeft data-icon="inline-start" />Back to office
              </Button>
            )}
            <span className="hidden max-w-[220px] truncate px-2 text-[13px] text-neutral-500 sm:inline">{user?.email}</span>
            <Button variant="ghost" className="h-9 rounded-full px-3 text-[14px]" onClick={() => void logout().then(() => nav('/login', { replace: true }))}>
              <LogOut data-icon="inline-start" />Sign out
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1264px] gap-12 px-5 py-10 md:px-12 md:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-20">
        <main className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-saffron-ink">
            Connect Telegram
            {isMock && <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-neutral-500">Dev mock: links itself in ~10 s</span>}
          </p>
          <TwoTone as="h1" stack a="Bring your team" b="into your Telegram group." className="mt-3 text-[32px] leading-[1.08] tracking-[-0.03em] md:text-[40px]" />

          <Progress step={state === 'ready' ? 3 : step} onPick={(i) => state !== 'ready' && setStep(i)} />

          <section className="mt-8" aria-live="polite">
            {step === 0 && (
              <Step n={1} title="Create or open your Telegram group">
                <p>Any group works: a new one, or the one your team already uses. Add teammates now or later.</p>
                <Tip>We’ll switch it to <b>topics</b> and create one per department: War Room, Analytics, Ads, Creators, Ops and Design.</Tip>
                <Next onClick={() => setStep(1)}>I have a group</Next>
              </Step>
            )}

            {step === 1 && (
              <Step n={2} title={`Make @${bot} an admin`}>
                {state === 'needs_admin' && (
                  <Note tone="warn">The bot saw your code but isn’t an admin with <b>Manage topics</b> yet. Finish these taps, then send the code again.</Note>
                )}
                <p>The bot needs to be an admin so it can create the topics. In Telegram:</p>
                <ol className="mt-5 grid gap-2">
                  {TAPS.map((t, i) => (
                    <li key={i} className="flex items-center gap-3 text-[15px] text-neutral-700 [&_b]:font-medium [&_b]:text-foreground">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full border border-black/[0.1] bg-white text-[12px] font-medium text-neutral-500 tabular-nums">{i + 1}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <Button variant="outline" className="h-11 rounded-full bg-white px-5 text-[15px]" render={<a href={`https://t.me/${bot}?startgroup=hq&admin=manage_topics`} target="_blank" rel="noreferrer" />} nativeButton={false}>
                    <ExternalLink data-icon="inline-start" />Add @{bot} to a group
                  </Button>
                  <a href={`https://t.me/${bot}`} target="_blank" rel="noreferrer" className="text-[14px] text-neutral-500 underline-offset-4 hover:text-foreground hover:underline">or open t.me/{bot}</a>
                </div>
                <Next onClick={() => setStep(2)} back={() => setStep(0)}>{code ? 'Back to my code' : 'Done, show my code'}</Next>
              </Step>
            )}

            {step === 2 && (
              <Step n={3} title={state === 'ready' ? 'Your office is ready' : 'Send this code in the group'}>
                {state === 'ready' ? (
                  <Ready name={ws?.name} onOpen={() => nav(ws ? `/app/${ws.id}` : '/app')} />
                ) : (
                  <>
                    <p>Post it as a normal message in the group. The bot reads it and links the group to your account.</p>
                    <Code code={code?.code} expired={state === 'expired'} left={left} />
                    {issueErr && <Note tone="error">We couldn’t get a code. <button className="font-medium underline underline-offset-2" onClick={() => void issue()}>Try again</button></Note>}
                    <Live state={state} pollErr={pollErr} onNewCode={() => void issue()} onAdmin={() => setStep(1)} />
                    <Next back={() => setStep(1)} />
                  </>
                )}
              </Step>
            )}
          </section>
        </main>

        <ConnectPreview step={step} state={state} code={code?.code} bot={bot} name={ws?.name} />
      </div>
    </div>
  );
}

function Progress({ step, onPick }: { step: number; onPick: (i: number) => void }) {
  return (
    <nav aria-label="Progress" className="mt-9">
      <ol className="grid grid-cols-3 gap-2">
        {STEPS.map((label, i) => {
          const done = i < step;
          const on = i === step;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => onPick(i)}
                disabled={i > step}
                aria-current={on ? 'step' : undefined}
                className="group w-full text-left disabled:cursor-default"
              >
                <span className="block h-1 overflow-hidden rounded-full bg-black/[0.07]">
                  <span className={cn('block h-full rounded-full transition-all duration-500', done ? 'w-full bg-foreground' : on ? 'w-1/2 bg-saffron' : 'w-0')} />
                </span>
                <span className={cn('mt-2.5 flex items-center gap-1.5 text-[13px]', on ? 'font-medium text-foreground' : done ? 'text-neutral-600 group-hover:text-foreground' : 'text-neutral-400')}>
                  {done ? <Check className="size-3.5" /> : <span className="tabular-nums">{i + 1}.</span>}{label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] md:p-8">
      <p className="text-[12px] font-medium text-neutral-400">Step {n} of 3</p>
      <h2 className="mt-1.5 text-[22px] font-medium tracking-[-0.02em]">{title}</h2>
      <div className="mt-3 text-[15px] leading-relaxed text-neutral-500 [&_b]:font-medium [&_b]:text-foreground">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return <p className="mt-5 rounded-xl border border-dashed border-saffron/45 bg-saffron/[0.06] px-4 py-3 text-[14px] text-neutral-600">{children}</p>;
}

function Note({ tone, children }: { tone: 'warn' | 'error'; children: ReactNode }) {
  return (
    <div role="alert" className={cn('my-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[14px]', tone === 'warn' ? 'border-saffron/40 bg-saffron/[0.08] text-saffron-ink' : 'border-red-200 bg-red-50/70 text-red-700')}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{children}</span>
    </div>
  );
}

function Next({ onClick, back, children }: { onClick?: () => void; back?: () => void; children?: ReactNode }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-6">
      {back ? <Button variant="ghost" className="h-10 rounded-full px-3 text-[14px]" onClick={back}><ArrowLeft data-icon="inline-start" />Back</Button> : <span />}
      {onClick && <Button className="h-11 rounded-full px-5 text-[15px]" onClick={onClick}>{children} <ArrowRight data-icon="inline-end" /></Button>}
    </div>
  );
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

function Code({ code, expired, left }: { code?: string; expired: boolean; left: number }) {
  const [copied, setCopied] = useState(false);
  const copy = () => code && navigator.clipboard?.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => {});
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className={cn('flex gap-1.5 sm:gap-2', expired && 'opacity-35')} aria-label={code ? `Code ${code.split('').join(' ')}` : 'Getting your code'} role="group">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={cn(
              'grid h-14 w-11 place-items-center rounded-xl border border-black/[0.1] bg-canvas text-[28px] font-medium text-foreground tabular-nums shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] sm:h-16 sm:w-12 sm:text-[30px]',
              i === 2 && 'mr-2 sm:mr-3',
              expired && 'line-through decoration-1',
            )}>
              {code ? code[i] : <span className="h-6 w-5 animate-pulse rounded bg-black/[0.06] motion-reduce:animate-none" />}
            </span>
          ))}
        </div>
        <Button variant="outline" className="h-11 rounded-full bg-white px-4 text-[14px]" onClick={copy} disabled={!code || expired}>
          {copied ? <><Check data-icon="inline-start" />Copied</> : <><Copy data-icon="inline-start" />Copy</>}
        </Button>
      </div>
      {code && !expired && <p className="mt-3 text-[13px] text-neutral-400">Single use · expires in <span className="text-neutral-600 tabular-nums">{mmss(left)}</span></p>}
    </div>
  );
}

function Live({ state, pollErr, onNewCode, onAdmin }: { state?: string; pollErr: boolean; onNewCode: () => void; onAdmin: () => void }) {
  if (state === 'expired') {
    return (
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/[0.08] bg-neutral-50 px-4 py-3">
        <span className="text-[14px] text-neutral-600">This code expired. Codes last 15 minutes.</span>
        <Button className="h-9 rounded-full px-4 text-[14px]" onClick={onNewCode}><RefreshCw data-icon="inline-start" />Get a new code</Button>
      </div>
    );
  }
  if (state === 'needs_admin') {
    return (
      <Note tone="warn">
        Got your code, but the bot isn’t an admin with Manage topics yet.{' '}
        <button className="font-medium underline underline-offset-2" onClick={onAdmin}>Show me the admin steps</button>
      </Note>
    );
  }
  const linking = state === 'linking';
  return (
    <div className={cn('mt-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-[14px] transition-colors', linking ? 'border-saffron/40 bg-saffron/[0.07] text-saffron-ink' : 'border-black/[0.07] bg-neutral-50 text-neutral-600')}>
      {linking ? <Loader2 className="size-4 shrink-0 animate-spin" /> : (
        <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
          <span className="absolute inset-0 animate-ping rounded-full bg-tg opacity-60 motion-reduce:hidden" /><span className="relative size-2 rounded-full bg-tg" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        {linking ? 'Creating your 6 topics and inviting your team…' : 'Waiting for the code in your group…'}
      </span>
      {pollErr && <span className="text-[12px] text-neutral-400">Reconnecting…</span>}
    </div>
  );
}

function Ready({ name, onOpen }: { name?: string; onOpen: () => void }) {
  return (
    <div>
      <div className="mt-4 flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check className="size-5" strokeWidth={2.5} /></span>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-medium text-foreground">{name ?? 'Your group'} is linked</p>
          <p className="text-[13.5px] text-emerald-800">6 topics created · your teammates have joined</p>
        </div>
      </div>
      <p className="mt-5">Say hi in the War Room topic, or give the Captain a job. Everything shows up in your office live.</p>
      <div className="mt-8 flex justify-end border-t border-black/[0.06] pt-6">
        <Button autoFocus className="h-11 rounded-full px-5 text-[15px]" onClick={onOpen}>Open your office <ArrowRight data-icon="inline-end" /></Button>
      </div>
    </div>
  );
}
