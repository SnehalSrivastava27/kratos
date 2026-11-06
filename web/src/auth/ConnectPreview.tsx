import { AnimatePresence, motion } from 'framer-motion';
import { Check, CheckCheck, ChevronRight, Shield, Users } from 'lucide-react';
import { TOPICS } from '@/landing/data';
import { TG_WALL, TopicIcon } from '@/landing/Telegram';
import { EASE } from '@/landing/ui';
import { cn } from '@/lib/utils';

/** Right column of /connect: a light Telegram mock that follows the step you're on. Decorative. */
export default function ConnectPreview({ step, state, code, bot, name }: { step: number; state?: string; code?: string; bot: string; name?: string }) {
  const linking = state === 'linking';
  const ready = state === 'ready';
  const title = ready && name ? name : 'Your team group';
  return (
    <aside aria-hidden="true" className="relative hidden lg:block">
      <div className="sticky top-28">
        <div className="absolute -inset-10 -z-0 rounded-full bg-saffron/[0.07] blur-3xl" />
        <div className="relative overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_30px_70px_-30px_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#FFB830] to-[#F08A00] text-[15px] font-semibold text-white">{title[0]}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-semibold tracking-tight">{title}</p>
              <p className={cn('text-[12px]', linking ? 'text-tg' : 'text-neutral-400')}>
                {ready ? `${TOPICS.length} topics · 7 members · 1 bot` : linking ? `${bot} is creating topics…` : step >= 1 ? 'group · 2 members' : 'group · 1 member'}
              </p>
            </div>
          </div>

          <div className="h-[440px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step === 1 ? 'admin' : step === 2 ? 'chat' : 'group'} className="h-full"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3, ease: EASE }}>
                {step === 0 && <GroupView />}
                {step === 1 && <AdminView bot={bot} />}
                {step === 2 && <ChatView code={code} bot={bot} linking={linking} ready={ready} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </aside>
  );
}

function GroupView() {
  return (
    <div className={cn('flex h-full flex-col justify-end gap-2 p-4', TG_WALL)}>
      <Pill>You created the group</Pill>
      <Pill>You added your teammates</Pill>
      <div className="mt-2 self-center rounded-2xl bg-white/90 px-5 py-4 text-center shadow-sm">
        <Users className="mx-auto size-6 text-tg" strokeWidth={1.6} />
        <p className="mt-2 text-[13px] font-medium">Any group works</p>
        <p className="mt-0.5 text-[12px] text-neutral-500">It becomes six topics in step 3.</p>
      </div>
    </div>
  );
}

function AdminView({ bot }: { bot: string }) {
  return (
    <div className="h-full bg-[#F1F2F5] p-4">
      <p className="px-1 pb-1.5 text-[11.5px] font-medium tracking-wide text-neutral-400 uppercase">Edit group</p>
      <div className="overflow-hidden rounded-xl bg-white">
        <Row label="Topics" right={<Toggle />} />
        <Row label="Administrators" right={<span className="flex items-center gap-1 text-[13px] text-neutral-400">2<ChevronRight className="size-4" /></span>} />
      </div>
      <p className="mt-5 px-1 pb-1.5 text-[11.5px] font-medium tracking-wide text-neutral-400 uppercase">Admin rights · @{bot}</p>
      <div className="overflow-hidden rounded-xl bg-white">
        <div className="flex items-center gap-3 border-b border-black/[0.05] px-3.5 py-3">
          <span className="grid size-9 place-items-center rounded-full bg-neutral-900 text-white"><Shield className="size-4" /></span>
          <div><p className="text-[13.5px] font-medium">Kratos D2C bot</p><p className="text-[12px] text-tg">@{bot}</p></div>
        </div>
        <Row label="Manage topics" right={<Toggle />} strong />
        <Row label="Pin messages" right={<Toggle off />} />
        <Row label="Delete messages" right={<Toggle off />} />
      </div>
    </div>
  );
}

function ChatView({ code, bot, linking, ready }: { code?: string; bot: string; linking: boolean; ready: boolean }) {
  return (
    <div className={cn('flex h-full flex-col justify-end gap-2 overflow-hidden p-4', TG_WALL)}>
      <Pill>@{bot} joined the group</Pill>
      {code && (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}
          className="self-end rounded-2xl rounded-br-md bg-[#EFFDDE] px-3.5 py-2 shadow-sm">
          <span className="font-mono text-[18px] tracking-[0.18em] text-foreground">{code}</span>
          <span className="ml-2 inline-flex items-center gap-0.5 align-middle text-[10.5px] text-emerald-600">now{(linking || ready) && <CheckCheck className="size-3.5" />}</span>
        </motion.div>
      )}
      {(linking || ready) && (
        <div className="mt-1 rounded-2xl bg-white/95 p-3 shadow-sm">
          <p className="px-1 pb-2 text-[12px] font-medium text-neutral-500">{ready ? 'Topics ready' : 'Creating topics…'}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {TOPICS.map((t, i) => (
              <motion.div key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE, delay: ready ? 0 : i * 0.45 }}
                className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2 py-1.5">
                <TopicIcon emoji={t.emoji} on className="size-6 rounded-md text-[12px]" />
                <span className="truncate text-[12.5px] font-medium">{t.label}</span>
                {ready && <Check className="ml-auto size-3.5 text-emerald-600" />}
              </motion.div>
            ))}
          </div>
        </div>
      )}
      {!code && <Pill>Your code appears here</Pill>}
    </div>
  );
}

const Pill = ({ children }: { children: React.ReactNode }) => <p className="self-center rounded-full bg-black/[0.18] px-3 py-1 text-[11.5px] font-medium text-white">{children}</p>;

function Row({ label, right, strong }: { label: string; right: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between border-b border-black/[0.05] px-3.5 py-3 text-[13.5px] last:border-0', strong && 'bg-saffron/[0.07]')}>
      <span className={strong ? 'font-medium' : ''}>{label}</span>{right}
    </div>
  );
}

const Toggle = ({ off }: { off?: boolean }) => (
  <span className={cn('relative inline-block h-[22px] w-[38px] rounded-full transition-colors', off ? 'bg-neutral-200' : 'bg-tg')}>
    <span className={cn('absolute top-[3px] size-4 rounded-full bg-white shadow-sm', off ? 'left-[3px]' : 'left-[19px]')} />
  </span>
);
