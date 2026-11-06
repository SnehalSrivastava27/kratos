import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Logo, TwoTone } from '@/landing/ui';
import { cn } from '@/lib/utils';
import { ApiError } from './api';
import { useAuth } from './AuthProvider';
import Showcase from './Showcase';

type Mode = 'login' | 'signup';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PW = 10;

function validate(mode: Mode, v: { name: string; email: string; password: string }) {
  const e: Partial<Record<'name' | 'email' | 'password', string>> = {};
  if (mode === 'signup' && !v.name.trim()) e.name = 'Tell us what to call you';
  if (!v.email.trim()) e.email = 'Enter your email';
  else if (!EMAIL.test(v.email.trim())) e.email = 'That doesn’t look like an email';
  if (!v.password) e.password = 'Enter your password';
  else if (mode === 'signup' && v.password.length < MIN_PW) e.password = `Use at least ${MIN_PW} characters`;
  return e;
}

function serverMessage(mode: Mode, err: unknown) {
  const s = err instanceof ApiError ? err.status : 0;
  if (s === 401 || (mode === 'login' && s === 400)) return 'Email or password is wrong.';
  if (s === 409) return 'An account with this email already exists.';
  if (s === 429) return 'Too many tries. Wait a minute, then try again.';
  if (s === 400) return 'Check your details and try again.';
  return 'We couldn’t reach the server. Try again in a moment.';
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const auth = useAuth();
  const nav = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [v, setV] = useState({ name: '', email: '', password: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errors = validate(mode, v);
  const shown = (k: keyof typeof errors) => (tried || touched[k] ? errors[k] : undefined);
  const signup = mode === 'signup';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    setErr(null);
    if (Object.keys(errors).length) {
      document.getElementById(`f-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      if (signup) await auth.signup(v.name.trim(), v.email.trim(), v.password);
      else await auth.login(v.email.trim(), v.password);
      nav(signup ? '/connect' : from ?? '/app', { replace: true });
    } catch (x) {
      setErr(serverMessage(mode, x));
      setBusy(false);
    }
  }

  const field = (k: 'name' | 'email' | 'password', label: string, input: React.ComponentProps<'input'>, extra?: React.ReactNode) => (
    <div className="grid gap-2">
      <Label htmlFor={`f-${k}`} className="text-[13px] font-medium text-neutral-700">{label}</Label>
      <div className="relative">
        <Input
          id={`f-${k}`}
          name={k}
          value={v[k]}
          onChange={(e) => setV((s) => ({ ...s, [k]: e.target.value }))}
          onBlur={() => setTouched((t) => ({ ...t, [k]: true }))}
          aria-invalid={!!shown(k) || undefined}
          aria-describedby={shown(k) ? `e-${k}` : k === 'password' && signup ? 'h-password' : undefined}
          className={cn('h-11 rounded-xl border-black/[0.1] bg-white px-3.5 text-[15px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:text-[15px]', extra && 'pr-11')}
          {...input}
        />
        {extra}
      </div>
      {shown(k) ? (
        <p id={`e-${k}`} className="text-[13px] text-red-600">{shown(k)}</p>
      ) : k === 'password' && signup ? (
        <p id="h-password" className="text-[13px] text-neutral-400">At least {MIN_PW} characters.</p>
      ) : null}
    </div>
  );

  return (
    <div className="grid min-h-svh bg-canvas text-foreground antialiased selection:bg-saffron/25 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div className="flex min-h-svh flex-col px-5 py-5 md:px-12">
        <header className="flex items-center justify-between">
          <Link to="/" aria-label="D2C Agent HQ home"><Logo /></Link>
          <p className="text-[14px] text-neutral-500">
            <span className="hidden sm:inline">{signup ? 'Have an account?' : 'New here?'} </span>
            <Link to={signup ? '/login' : '/signup'} state={from ? { from } : undefined} className="font-medium text-foreground underline-offset-4 hover:underline">
              {signup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
        </header>

        <main className="mx-auto flex w-full max-w-[380px] flex-1 flex-col pt-14 pb-10 md:justify-center md:py-14">
          <TwoTone as="h1" stack a={signup ? 'Hire your team.' : 'Welcome back.'} b={signup ? 'It takes two minutes.' : 'Your team kept at it.'}
            className="text-[32px] leading-[1.08] tracking-[-0.03em] md:text-[36px]" />
          <p className="mt-4 text-[15px] leading-relaxed text-neutral-500">
            {signup ? 'Create an account, then link your Telegram group. Six AI teammates move in.' : 'Sign in to open your live office and your team’s Telegram topics.'}
          </p>

          <form noValidate onSubmit={submit} className="mt-9 grid gap-5" aria-describedby={err ? 'form-err' : undefined}>
            {signup && field('name', 'Your name', { autoComplete: 'name', placeholder: 'Asha Rao', autoFocus: true })}
            {field('email', 'Work email', { type: 'email', autoComplete: 'email', inputMode: 'email', placeholder: 'you@brand.com', autoFocus: !signup, spellCheck: false })}
            {field('password', 'Password',
              { type: show ? 'text' : 'password', autoComplete: signup ? 'new-password' : 'current-password', },
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
                className="absolute inset-y-0 right-1 my-auto grid size-9 place-items-center rounded-lg text-neutral-400 transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>,
            )}

            {err && (
              <div id="form-err" role="alert" className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/70 px-3.5 py-3 text-[14px] text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>
                  {err}
                  {signup && err.startsWith('An account') && <> <Link to="/login" className="font-medium underline underline-offset-2">Sign in instead</Link></>}
                </span>
              </div>
            )}

            <Button type="submit" disabled={busy} className="mt-1 h-11 w-full rounded-full text-[15px]">
              {busy ? <><Loader2 className="animate-spin" />{signup ? 'Creating your account…' : 'Signing in…'}</> : <>{signup ? 'Create account' : 'Sign in'} <ArrowRight data-icon="inline-end" /></>}
            </Button>
          </form>

          <p className="mt-8 text-[13px] leading-relaxed text-neutral-400">
            {signup ? <>Next, you’ll add <span className="text-neutral-600">@kratosd2c_bot</span> to a Telegram group. Nothing is posted until you send a code.</>
              : <>Just looking? <Link to="/demo" className="text-neutral-600 underline-offset-4 hover:underline">Watch the demo office</Link>, no account needed.</>}
          </p>
        </main>
      </div>
      <Showcase />
    </div>
  );
}
