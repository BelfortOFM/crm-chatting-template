"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { login, type LoginState } from "./actions";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      {/* Halo derrière la carte */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/15 blur-[120px]"
      />

      <form
        action={formAction}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface/90 p-8 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05),0_20px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-info via-sky-500 to-accent text-white shadow-[0_4px_16px_rgb(56_189_248/0.5)]">
            <Sparkles size={18} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">LordAgency Pro</h1>
            <p className="text-sm text-muted">Sign in to your space</p>
          </div>
        </div>

        <div className="mt-7 space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@agency.com" />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••" />
          </Field>
        </div>

        {state.error && (
          <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
        )}

        <Button type="submit" disabled={pending} className="mt-6 w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
