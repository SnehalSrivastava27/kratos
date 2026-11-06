import { MotionConfig } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Github, ListChecks, Menu, MessagesSquare, Moon, Send, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { REPO_URL } from './data';
import Hero from './Hero';
import Departments from './Departments';
import Threads from './Threads';
import Jobs from './Jobs';
import TeamChat from './TeamChat';
import Approve from './Approve';
import { Faq, FinalCta, Footer, HowItWorks } from './Outro';
import { Band, Container, Logo, Reveal, SectionRow, TwoTone } from './ui';

const LINKS = [['Teammates', '#teammates'], ['Threads', '#threads'], ['Use cases', '#jobs'], ['Telegram', '#telegram'], ['How it works', '#how'], ['FAQ', '#faq']];

export default function Landing() {
  return (
    // reducedMotion="user": Framer drops transform animations when the OS asks for less motion.
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-svh bg-canvas text-foreground antialiased selection:bg-saffron/25">
        <Guides />
        <Nav />
        <main className="relative">
          <Hero />
          <SectionRow id="teammates" a="Every department" b="has a teammate." cta={{ href: '/demo', Icon: Users, label: 'Meet the team' }}>
            <b>Five department teammates</b> plus a <b>Sale Captain</b> who splits the work and brings back one plan. Each knows what to take off your plate and <b>when to act on its own</b>.
          </SectionRow>
          <Departments />
          <SectionRow id="threads" a="A dedicated thread" b="for every teammate." cta={{ href: '/demo', Icon: MessagesSquare, label: 'Read a thread' }}>
            Every teammate keeps <b>one thread that never closes</b>: what it was asked, what it did, and how long it took. <b>Step in any time</b> in plain language.
          </SectionRow>
          <Threads />
          <SectionRow id="jobs" a="Give teammates a job." b="Watch them work it out." cta={{ href: '/demo', Icon: ListChecks, label: 'See it live' }}>
            Ask in plain language. Each teammate <b>works through it step by step</b>, then hands back <b>something you can ship</b>: a forecast, a media plan, a transfer.
          </SectionRow>
          <Jobs />
          <Trio />
          <TeamChat />
          <Approve />
          <HowItWorks />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}

/** Blueprint guides: frame edges + a faint dashed centre line, behind everything. */
function Guides() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
      <div className="mx-auto h-full max-w-[1264px] border-x border-black/[0.07]" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-[linear-gradient(to_bottom,rgba(244,163,0,0.45)_50%,transparent_50%)] [background-size:1px_8px] opacity-60" />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/[0.07] bg-canvas/80 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-6">
        <Link to="/" aria-label="Kratos home"><Logo /></Link>
        <nav className="mx-auto hidden items-center gap-7 text-[14px] text-neutral-500 lg:flex" aria-label="Sections">
          {LINKS.map(([label, href]) => <a key={href} href={href} className="transition-colors hover:text-foreground">{label}</a>)}
        </nav>
        <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
          <Button variant="ghost" className="hidden h-9 rounded-full px-3 text-[14px] sm:inline-flex" render={<a href={REPO_URL} target="_blank" rel="noreferrer" />} nativeButton={false}>
            <Github data-icon="inline-start" />GitHub
          </Button>
          <Button variant="ghost" className="hidden h-9 rounded-full px-3 text-[14px] sm:inline-flex" render={<Link to="/login" />} nativeButton={false}>
            Sign in
          </Button>
          <Button className="h-9 rounded-full px-4 text-[14px]" render={<Link to="/signup" />} nativeButton={false}>
            Get started
          </Button>
          <Sheet>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="size-9 rounded-full lg:hidden" aria-label="Menu" />}>
              <Menu />
            </SheetTrigger>
            <SheetContent side="right" className="bg-canvas p-6">
              <SheetTitle><Logo /></SheetTitle>
              <nav className="mt-6 flex flex-col text-[17px]" aria-label="Sections">
                {LINKS.map(([label, href]) => (
                  <SheetClose key={href} render={<a href={href} className="border-b border-black/[0.06] py-3.5 text-foreground" />}>{label}</SheetClose>
                ))}
                <SheetClose render={<Link to="/login" className="border-b border-black/[0.06] py-3.5 text-foreground" />}>Sign in</SheetClose>
                <SheetClose render={<Link to="/app" className="border-b border-black/[0.06] py-3.5 text-foreground" />}>Open the office</SheetClose>
                <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-3.5 text-neutral-500"><Github className="size-4" />GitHub</a>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </Container>
    </header>
  );
}

const TRIO = [
  { Icon: Send, a: 'In Telegram', b: 'by default.', text: 'No new app for the team. Teammates work in one Telegram group you already use, one topic per department.' },
  { Icon: ShieldCheck, a: 'Accountable', b: 'by design.', text: 'Every step and number is in the thread. The Captain checks the budget before anything reaches you.' },
  { Icon: Moon, a: 'Never off', b: 'the clock.', text: 'Stock runs low at midnight? Ops has already drafted the transfer. You wake up to a decision, not a fire.' },
];

function Trio() {
  return (
    <Band className="bg-canvas">
      <Container className="grid border-black/[0.07] md:grid-cols-3 md:border-x">
        {TRIO.map(({ Icon, a, b, text }, i) => (
          <Reveal key={a} delay={i * 0.06} className="border-black/[0.07] py-12 not-first:border-t md:px-8 md:py-20 md:not-first:border-t-0 md:not-first:border-l md:not-first:border-dashed md:not-first:border-saffron/40 md:first:pl-0 md:last:pr-0">
            <Icon className="size-7 text-saffron" strokeWidth={1.4} />
            <TwoTone as="h3" a={a} b={b} className="mt-6 text-[22px]" />
            <p className="mt-3 max-w-[36ch] text-[16px] leading-relaxed text-neutral-500">{text}</p>
          </Reveal>
        ))}
      </Container>
    </Band>
  );
}
