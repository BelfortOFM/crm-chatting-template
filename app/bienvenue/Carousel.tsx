"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import {
  CalendarDays,
  PlusCircle,
  Wallet,
  ChevronLeft,
  ChevronRight,
  Clock,
  CalendarOff,
  Coins,
  Trophy,
  Target,
  Check,
} from "lucide-react";
import { completeOnboarding } from "./actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface Slide {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  intro: string;
  points: { icon: ReactNode; label: string; detail: string }[];
  /** Aperçu schématique de l'écran concerné, dessiné en CSS. */
  preview: ReactNode;
}

/** Maquette d'écran miniature : donne à voir l'écran avant de l'ouvrir. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[15rem] rounded-2xl border border-border bg-surface-2/60 p-3 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05)]">
      {children}
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    icon: <CalendarDays size={24} />,
    eyebrow: "Step 1",
    title: "Your planning",
    intro:
      "Your agency assigns you a time slot. You'll find it here, day by day, and this is the screen where you check in for your shift.",
    points: [
      { icon: <Clock size={13} />, label: "Check in and out", detail: "One button at the start of your shift, another at the end." },
      { icon: <CalendarOff size={13} />, label: "Request a day OFF", detail: "Several per week, on an upcoming day." },
    ],
    preview: (
      <Frame>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between rounded-lg bg-accent-soft px-2 py-1.5">
            <span className="text-[10px] font-semibold text-accent">Monday</span>
            <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[9px] font-medium text-warning">
              3pm → 9pm
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface px-2 py-1.5">
            <span className="text-[10px] text-muted">Tuesday</span>
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[9px] text-muted">Day OFF</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface px-2 py-1.5">
            <span className="text-[10px] text-muted">Wednesday</span>
            <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-[9px] text-warning">3pm → 9pm</span>
          </div>
        </div>
      </Frame>
    ),
  },
  {
    icon: <PlusCircle size={24} />,
    eyebrow: "Step 2",
    title: "Report your sales",
    intro:
      "At the end of each shift, enter the model, your hours and the amount of each sale. That's what drives your pay — nothing else is counted.",
    points: [
      { icon: <Coins size={13} />, label: "One line per sale", detail: "Add them one by one, the total calculates itself." },
      { icon: <Check size={13} />, label: "The rate is locked in", detail: "The day's exchange rate is recorded and won't move again." },
    ],
    preview: (
      <Frame>
        <div className="space-y-1.5">
          <div className="rounded-lg bg-surface px-2 py-1.5">
            <p className="text-[9px] uppercase tracking-wide text-muted">Shift sales</p>
          </div>
          {["50.00", "120.00", "35.00"].map((v) => (
            <div key={v} className="flex items-center gap-1.5 rounded-lg bg-surface px-2 py-1.5">
              <span className="text-[10px] font-semibold text-muted">$</span>
              <span className="text-[10px] text-foreground">{v}</span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg bg-surface-2 px-2 py-1.5">
            <span className="text-[9px] text-muted">Total</span>
            <span className="text-[11px] font-bold text-info">$205.00</span>
          </div>
        </div>
      </Frame>
    ),
  },
  {
    icon: <Wallet size={24} />,
    eyebrow: "Step 3",
    title: "Track your pay",
    intro:
      "Your pay is calculated live from your commission. See where you stand on your goal, what's been paid out, and your rank in the team.",
    points: [
      { icon: <Target size={13} />, label: "Your monthly goal", detail: "Your progress, updated with every sale." },
      { icon: <Wallet size={13} />, label: "Your payments", detail: "Each paid period, bonuses and penalties detailed." },
      { icon: <Trophy size={13} />, label: "The leaderboard", detail: "Your rank among the agency's chatters." },
    ],
    preview: (
      <Frame>
        <div className="space-y-2">
          <div className="rounded-lg bg-surface px-2 py-2">
            <p className="text-[9px] uppercase tracking-wide text-muted">Monthly goal</p>
            <p className="mt-0.5 text-sm font-bold text-foreground">$1,240</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-info via-sky-500 to-accent" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-surface px-2 py-1.5">
            <span className="text-[9px] text-muted">Period pay</span>
            <span className="text-[11px] font-bold text-accent">$372</span>
          </div>
        </div>
      </Frame>
    ),
  },
];

export function Carousel({ firstName }: { firstName: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();

  // La position vient du défilement réel, pas d'un état qu'on tiendrait à
  // jour : le doigt et les flèches passent ainsi par le même chemin.
  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  const last = index === SLIDES.length - 1;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="safe-top px-5 pt-6 text-center">
        <p className="text-sm text-muted">Welcome {firstName}</p>
        <h1 className="mt-1 text-xl font-bold tracking-tight text-foreground">
          How your space works
        </h1>
      </header>

      <div
        ref={trackRef}
        onScroll={onScroll}
        className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {SLIDES.map((slide) => (
          <section
            key={slide.title}
            className="flex w-full shrink-0 snap-center flex-col justify-center px-5 py-6"
          >
            <div className="mx-auto w-full max-w-sm space-y-5">
              <div className="text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-info via-sky-500 to-accent text-white shadow-[0_8px_24px_-8px_rgb(56_189_248/0.7)]">
                  {slide.icon}
                </span>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-accent">
                  {slide.eyebrow}
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{slide.title}</h2>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{slide.intro}</p>
              </div>

              {slide.preview}

              <ul className="space-y-2">
                {slide.points.map((p) => (
                  <li
                    key={p.label}
                    className="flex items-start gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      {p.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{p.label}</span>
                      <span className="block text-xs text-muted">{p.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <footer className="safe-bottom space-y-4 px-5 pb-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={index === 0}
            aria-label="Previous card"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-0"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="flex items-center gap-2" role="tablist" aria-label="Progress">
            {SLIDES.map((s, i) => (
              <button
                key={s.title}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Card ${i + 1}: ${s.title}`}
                onClick={() => goTo(i)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === index ? "w-7 bg-gradient-to-r from-info to-accent" : "w-2 bg-border"
                )}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={last}
            aria-label="Next card"
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-0"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Le bouton final n'apparaît qu'au bout : on ne propose pas de sortir
            d'une présentation qu'on vient d'ouvrir. */}
        {last ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => completeOnboarding())}
            className="w-full"
          >
            {pending ? "…" : "Let's go"}
          </Button>
        ) : (
          <Button type="button" variant="secondary" onClick={() => goTo(index + 1)} className="w-full">
            Next
          </Button>
        )}
      </footer>
    </div>
  );
}
