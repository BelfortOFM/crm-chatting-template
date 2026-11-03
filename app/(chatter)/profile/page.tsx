import { Wallet, CalendarClock, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPeriodForDate, toDateString } from "@/lib/period";
import { formatAmountEn, formatUsdEn } from "@/lib/currency";
import { StatCard } from "@/components/dashboard/StatCard";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chatterId = user!.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, agency_id")
    .eq("id", chatterId)
    .single();

  const now = new Date();
  const period = getPeriodForDate(now);
  const periodStartStr = toDateString(period.start);
  const periodEndStr = toDateString(period.end);

  const [{ data: shifts }] = await Promise.all([
    supabase
      .from("shift_entries")
      .select(
        "shift_date, model:models(name), sale_lines(amount)"
      )
      .eq("chatter_id", chatterId),
  ]);

  let lifetimeTotal = 0;
  let periodTotal = 0;
  const modelTotals = new Map<string, number>();

  for (const shift of shifts ?? []) {
    const model = Array.isArray(shift.model) ? shift.model[0] : shift.model;
    if (!model) continue;

    // Postgres `numeric` is serialized as a string by PostgREST — coerce before summing.
    // Devise unique USD : le montant est pris tel quel.
    const lines = shift.sale_lines as { amount: number | string }[];
    const total = lines.reduce((s, l) => s + Number(l.amount), 0);

    lifetimeTotal += total;
    if (shift.shift_date >= periodStartStr && shift.shift_date <= periodEndStr) {
      periodTotal += total;
    }
    modelTotals.set(model.name, (modelTotals.get(model.name) ?? 0) + total);
  }

  const bestModel = [...modelTotals.entries()].sort((a, b) => b[1] - a[1])[0];

  const usd = (amount: number) => formatUsdEn(amount);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{profile?.full_name}</h1>
        <p className="mt-1 text-sm text-muted">Your account, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Lifetime total" icon={<Wallet size={14} />} value={usd(lifetimeTotal)} />
        <StatCard
          label={`Period ${period.periodNumber} in progress`}
          icon={<CalendarClock size={14} />}
          value={usd(periodTotal)}
        />
        <StatCard
          label="Best model"
          icon={<Star size={14} />}
          value={bestModel ? bestModel[0] : "—"}
          sub={bestModel ? formatAmountEn(bestModel[1], "USD") : undefined}
        />
      </div>
    </div>
  );
}
