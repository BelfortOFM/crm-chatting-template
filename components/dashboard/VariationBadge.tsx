import { Badge } from "@/components/ui/Badge";

export function VariationBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const tone = pct >= 0 ? "success" : "danger";
  const sign = pct >= 0 ? "+" : "";
  return (
    <Badge tone={tone}>
      {sign}
      {pct.toFixed(0)}%
    </Badge>
  );
}
