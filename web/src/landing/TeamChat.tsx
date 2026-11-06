import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Check, Mic, MoreVertical, Paperclip, Send, Smile } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { FEED, SWITCH_URL, TG_GROUP, TOPICS } from './data';
import { TG_WALL, TgAvatar, TgMessages, TopicTabs, tgSubtitle, topicCounts } from './Telegram';
import { Band, Container, EASE, Reveal, TwoTone } from './ui';
import { Mark } from './Brands';

const START = 3; // never show an empty chat

export default function TeamChat() {
  const [tab, setTab] = useState<'tg' | 'wa'>('tg');
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(START);

  useEffect(() => {
    if (!inView || reduce) return;
    const id = setTimeout(() => setShown((s) => (s >= FEED.length ? START : s + 1)), shown >= FEED.length ? 4500 : 900);
    return () => clearTimeout(id);
  }, [inView, reduce, shown]);

  const seen = FEED.slice(0, reduce ? FEED.length : shown);
  // The phone stays in the War Room topic; the other topics tick up like unread badges.
  const room = 'war_room';
  const visible = seen.filter((e) => e.room === room);
  const sub = tgSubtitle(visible);

  return (
    <Band id="telegram" className="scroll-mt-16 overflow-hidden">
      <Container className="grid items-center gap-12 py-16 md:grid-cols-2 md:gap-0 md:py-24">
        <Reveal className="md:pr-16">
          <TwoTone stack a="Works where your team works." b="No new tool to learn." className="text-[28px] leading-[1.12] md:text-[36px]" />
          <p className="mt-5 max-w-[44ch] text-[17px] leading-[1.55] text-neutral-500 [&_b]:font-normal [&_b]:text-foreground">
            Indian D2C teams don’t run on Slack. They run on <b>Telegram</b>. Your teammates live in one group, <b>one topic per department</b>, all posting through a single bot.
          </p>
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'tg' | 'wa')} className="mt-8">
            <TabsList className="h-10 rounded-full bg-black/[0.04] p-1">
              <TabsTrigger value="tg" className="h-8 rounded-full px-4 text-[13.5px] data-active:shadow-sm"><Mark name="telegram" color="#26A5E4" className="size-4" />Telegram</TabsTrigger>
              <TabsTrigger value="wa" className="h-8 rounded-full px-4 text-[13.5px] data-active:shadow-sm"><Mark name="whatsapp" color="#25D366" className="size-4" />WhatsApp <span className="rounded-full bg-neutral-200/70 px-1.5 text-[10.5px] font-medium text-neutral-500">Soon</span></TabsTrigger>
            </TabsList>
          </Tabs>
          <ul className="mt-8 flex flex-col gap-3 text-[15px] text-neutral-600">
            {[`${TOPICS.length} topics: ${TOPICS.map((t) => t.label).join(', ')}`, 'Address a teammate by name, approve with a reply', 'Shared context, so the Captain sees what Creators proposed'].map((t) => (
              <li key={t} className="flex gap-3"><Check className="mt-1 size-4 shrink-0 text-saffron-ink" />{t}</li>
            ))}
          </ul>
          <a href={SWITCH_URL} target="_blank" rel="noreferrer" className="mt-8 inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white py-1.5 pr-3.5 pl-1.5 text-[13px] text-neutral-500 shadow-sm transition-colors hover:text-foreground">
            <span className="grid size-6 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-white">S</span>
            Powered by <b className="font-medium text-foreground">Switch</b>
          </a>
        </Reveal>

        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="relative mx-auto w-full max-w-[340px]"
        >
          <div aria-hidden="true" className="absolute -inset-x-24 -inset-y-10 -z-10 rounded-full bg-[radial-gradient(closest-side,rgba(244,163,0,0.12),transparent)]" />
          <div className="relative flex h-[600px] flex-col overflow-hidden rounded-[44px] border-[7px] border-neutral-900 bg-white shadow-[0_40px_80px_-30px_rgba(0,0,0,0.35)]" role="img" aria-label={`Telegram group ${TG_GROUP} with forum topics: the Sale Captain splits the festive sale into department topics, then brings back the final plan for approval.`}>
            <div className="absolute top-2 left-1/2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-neutral-900" />
            <div className="flex items-center gap-2.5 border-b border-black/[0.06] bg-white/95 px-3.5 pt-11 pb-2.5">
              <ArrowLeft className="size-5 text-tg" />
              <TgAvatar />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold">{TG_GROUP}</p>
                <p className={cn('text-[12px]', sub.endsWith('…') ? 'text-tg' : 'text-neutral-400')}>{tab === 'wa' ? 'WhatsApp · coming soon' : sub}</p>
              </div>
              <MoreVertical className="size-5 text-neutral-400" />
            </div>
            {tab === 'tg' && <TopicTabs active={room} counts={topicCounts(seen)} />}
            <div className={cn('flex flex-1 flex-col justify-end overflow-hidden px-2.5 py-3', TG_WALL)}>
              {tab === 'wa' ? (
                <div className="m-auto max-w-[240px] rounded-2xl bg-white/90 p-5 text-center shadow-sm">
                  <p className="text-[15px] font-semibold">WhatsApp is coming soon</p>
                  <p className="mt-1.5 text-[13px] leading-snug text-neutral-500">Same teammates, same topics. Telegram is live today.</p>
                </div>
              ) : (
                <TgMessages events={visible.slice(-5)} />
              )}
            </div>
            <div className="flex items-center gap-3 bg-white px-3.5 pt-2.5 pb-5 text-[14px] text-neutral-400">
              <Paperclip className="size-5" /><span className="flex-1 rounded-full border border-black/[0.08] px-3 py-1.5">Message</span><Smile className="size-5" />
              {tab === 'tg' ? <Mic className="size-5" /> : <Send className="size-5" />}
            </div>
          </div>
        </motion.div>
      </Container>
    </Band>
  );
}
