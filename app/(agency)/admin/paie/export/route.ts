import { NextResponse, type NextRequest } from "next/server";
import { requireAgencyAdmin } from "@/lib/require-role";
import { fetchPayroll } from "@/lib/payroll";
import { fetchCaBreakdown, scopeRowsToModel } from "@/lib/payroll-platform";

/** Echappement CSV : guillemets doubles, et on entoure toute valeur a risque. */
function cell(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export de la paie d'une periode, destine au comptable.
 * Separateur point-virgule et decimales a la virgule : c'est ce qu'attend
 * Excel en localisation francaise, sinon tout atterrit dans une seule colonne.
 */
export async function GET(request: NextRequest) {
  const { supabase, profile } = await requireAgencyAdmin();

  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");
  const platform = request.nextUrl.searchParams.get("platform");
  const model = request.nextUrl.searchParams.get("model");
  if (!start || !end) {
    return NextResponse.json({ error: "Période manquante." }, { status: 400 });
  }

  const [platformRows, breakdown] = await Promise.all([
    fetchPayroll(supabase, profile.agency_id, start, end, platform),
    fetchCaBreakdown(supabase, profile.agency_id, start, end),
  ]);

  // Export de la plateforme, reduit au modele demande si ?model= est present.
  const rows = model && platform ? scopeRowsToModel(platformRows, breakdown, platform, model) : platformRows;

  const num = (n: number) => n.toFixed(2).replace(".", ",");

  const header = [
    "Chatter",
    "Statut",
    "CA brut (USD)",
    "Frais plateforme (USD)",
    "CA net (USD)",
    "Heures",
    "USD/heure",
    "Commission (USD)",
    "Taux effectif (%)",
    "Bonus (USD)",
    "Sanction (USD)",
    "Net a verser (USD)",
    "Paye le",
  ];

  const lines = rows.map((r) =>
    [
      cell(r.fullName),
      r.active ? "actif" : "parti",
      num(r.revenueUsd),
      num(r.feeUsd),
      num(r.netRevenueUsd),
      num(r.hours),
      r.hours > 0 ? num(r.usdPerHour) : "",
      num(r.commissionUsd),
      num(r.effectiveRate),
      num(r.bonusUsd),
      num(r.sanctionUsd),
      num(r.netUsd),
      r.paidAt ? new Date(r.paidAt).toLocaleDateString("fr-FR") : "",
    ].join(";")
  );

  const totalRevenue = rows.reduce((s, r) => s + r.revenueUsd, 0);
  const totalFee = rows.reduce((s, r) => s + r.feeUsd, 0);
  const totalNetRevenue = rows.reduce((s, r) => s + r.netRevenueUsd, 0);
  const totalNet = rows.reduce((s, r) => s + r.netUsd, 0);
  const totalHours = rows.reduce((s, r) => s + r.hours, 0);
  lines.push(
    ["TOTAL", "", num(totalRevenue), num(totalFee), num(totalNetRevenue), num(totalHours), "", "", "", "", "", num(totalNet), ""].join(";")
  );

  // BOM UTF-8 : sans lui Excel affiche les accents en mojibake.
  const csv = "﻿" + [header.join(";"), ...lines].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paie_${platform ?? "toutes"}${model ? "_modele" : ""}_${start}_${end}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
