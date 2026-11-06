import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useSpring } from 'framer-motion';
import { ArrowRight, Bot, Cable, Check, Github, Monitor, Send } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { PEOPLE, REPO_URL, SWITCH_URL } from './data';
import { Band, Container, Logo, MateIcon, Reveal, TwoTone } from './ui';

const HOW = [
  { Icon: Send, title: 'Telegram', text: 'The founder drops one message in the War Room topic.' },
  { Icon: Cable, title: 'Switch', text: 'Switch routes it to the right teammates and gives them shared context.' },
  { Icon: Bot, title: 'Agents', text: 'Each teammate works in its own department topic, then reports back.' },
  { Icon: Monitor, title: 'Office', text: 'The live office shows who is doing what, right now.' },
];

export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 60%'] });
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <Band id="how" className="scroll-mt-16">
      <Container className="py-16 md:py-24">
        <Reveal className="grid gap-5 md:grid-cols-2">
          <TwoTone stack a="One message in." b="A whole plan out." className="text-[28px] leading-[1.12] md:text-[36px]" />
          <p className="max-w-[44ch] self-end text-[17px] md:pl-8 leading-[1.55] text-neutral-500">The whole festive sale, from first message to founder approval, took <b className="font-normal text-foreground">about 45 seconds</b> in the demo.</p>
        </Reveal>
        <div ref={ref} className="relative mt-14 grid sm:grid-cols-2 lg:grid-cols-4">
          <div className="absolute inset-x-0 top-0 h-px bg-black/[0.08]" />
          <motion.div style={{ scaleX }} className="absolute inset-x-0 top-0 h-px origin-left bg-saffron motion-reduce:!scale-x-100" />
          {HOW.map(({ Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 0.08} className="border-black/[0.07] pt-8 pb-4 sm:pr-8 lg:not-first:border-l lg:not-first:pl-8">
              <div className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl border border-black/[0.07] bg-white shadow-sm"><Icon className="size-[18px]" strokeWidth={1.6} /></span>
                <span className="text-[12px] text-neutral-400 tabular-nums">0{i + 1}</span>
              </div>
              <h3 className="mt-6 text-[18px] font-medium tracking-tight">{title}</h3>
              <p className="mt-2 max-w-[30ch] text-[15px] leading-relaxed text-neutral-500">{text}</p>
            </Reveal>
          ))}
        </div>
      </Container>
    </Band>
  );
}

const FAQ = [
  { q: 'What is D2C Agent HQ?', a: 'Six AI teammates for a D2C brand: a Sale Captain plus Analytics, Ads, Creators, Ops and Design. They plan work together inside one Telegram group, one topic each, and a live 3D office shows who is doing what.' },
  { q: 'Does it need Switch?', a: 'Yes. Switch connects the agents to your Telegram group through one bot, routes each message to the right teammate and gives them shared context, so the Captain can see what Creators proposed.' },
  { q: 'Telegram only, or WhatsApp too?', a: 'Telegram is live today: one group with Topics turned on. WhatsApp is on the roadmap; a production version would use the official WhatsApp Business API.' },
  { q: 'What happens to my data?', a: 'The demo runs on a fictional brand, Kesar & Co., with sample CSVs for products, sales, stock and campaigns. Your teammates only read the files and the Telegram group you connect.' },
  { q: 'Can I add my own teammates?', a: 'Yes. Each teammate is a Switch agent with its own prompt and topic. Add one for CX, returns or retention the same way.' },
  { q: 'What does it cost?', a: 'The project is open source. You bring your own model keys and Switch setup.' },
];

export function Faq() {
  return (
    <Band id="faq" className="scroll-mt-16">
      <Container className="grid gap-8 py-16 md:grid-cols-2 md:gap-0 md:py-24">
        <Reveal>
          <TwoTone stack a="Questions," b="answered." className="text-[28px] leading-[1.12] md:text-[36px]" />
        </Reveal>
        <Reveal delay={0.06} className="md:pl-8">
          <Accordion className="border-t border-black/[0.07]">
            {FAQ.map((f) => (
              <AccordionItem key={f.q} value={f.q} className="border-black/[0.07] not-last:border-b">
                <AccordionTrigger className="py-5 text-[16px] font-medium hover:no-underline">{f.q}</AccordionTrigger>
                <AccordionContent className="pb-5 text-[15px] leading-relaxed text-neutral-500">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </Container>
    </Band>
  );
}

function MiniCard({ who, title, line, className }: { who: string; title: string; line: string; className?: string }) {
  const p = PEOPLE[who];
  return (
    <div aria-hidden="true" className={`w-[264px] rounded-2xl text-left border border-black/[0.07] bg-white p-4 shadow-[0_24px_50px_-28px_rgba(0,0,0,0.25)] ${className ?? ''}`}>
      <p className="flex items-center gap-2 text-[12px] text-neutral-500"><MateIcon id={who} size="sm" />{p.name}</p>
      <p className="mt-2 text-[15px] font-medium tracking-tight">{title}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-emerald-700"><Check className="size-3.5" />{line}</p>
    </div>
  );
}

export function FinalCta() {
  return (
    <Band className="overflow-hidden">
      <Container className="relative py-24 text-center md:py-44">
        <MiniCard who="d2c-ops" title="Mumbai → Delhi · 110 units" line="Arrives in 2 days" className="absolute top-10 left-12 hidden xl:block" />
        <MiniCard who="d2c-captain" title="Final plan · ₹4.68L of ₹5L" line="Founder approved" className="absolute right-12 bottom-10 hidden xl:block" />
        <Reveal>
          <h2 className="mx-auto text-[40px] leading-[1.04] font-medium tracking-[-0.035em] text-balance md:text-[64px]">
            Meet your new teammates.<br className="hidden md:block" /> <span className="text-dim">They’re already at work.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08} className="mt-10 flex flex-wrap justify-center gap-3">
          <Button size="lg" className="h-11 rounded-full px-5 text-[15px]" render={<Link to="/office" />} nativeButton={false}>
            Open the office <ArrowRight data-icon="inline-end" />
          </Button>
          <Button size="lg" variant="outline" className="h-11 rounded-full bg-white px-5 text-[15px]" render={<a href={REPO_URL} target="_blank" rel="noreferrer" />} nativeButton={false}>
            <Github data-icon="inline-start" />View on GitHub
          </Button>
        </Reveal>
      </Container>
    </Band>
  );
}

export function Footer() {
  const cols = [
    ['Product', [['Live office', '/office'], ['Teammates', '#teammates'], ['Use cases', '#jobs'], ['How it works', '#how']]],
    ['Resources', [['GitHub', REPO_URL], ['Switch', SWITCH_URL], ['FAQ', '#faq']]],
  ] as const;
  return (
    <footer className="relative">
      <Container className="grid gap-10 py-14 md:grid-cols-[2fr_1fr_1fr] md:py-16 md:[&>*:nth-child(2)]:pl-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-[34ch] text-[14px] leading-relaxed text-neutral-500">AI teammates for every department of your D2C brand, working in the Telegram you already use.</p>
        </div>
        {cols.map(([title, links]) => (
          <div key={title}>
            <p className="text-[14px] font-medium">{title}</p>
            <ul className="mt-3 flex flex-col gap-2 text-[14px] text-neutral-500">
              {links.map(([l, h]) => (
                <li key={l}>{h.startsWith('/') ? <Link to={h} className="hover:text-foreground">{l}</Link> : <a href={h} className="hover:text-foreground" {...(h.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{l}</a>}</li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-black/[0.07]">
        <Container className="flex flex-col gap-2 py-6 text-[13px] text-neutral-400 sm:flex-row sm:justify-between">
          <span>Powered by <a href={SWITCH_URL} target="_blank" rel="noreferrer" className="text-neutral-600 hover:text-foreground">Switch</a> · Built for Flip the Switch 2026</span>
          <span>Demo brand: Kesar &amp; Co. (fictional)</span>
        </Container>
        <Container className="-mt-3 pb-6 text-[12px] text-neutral-400">Brand names and logos are trademarks of their owners, used to identify sales channels.</Container>
      </div>
    </footer>
  );
}
