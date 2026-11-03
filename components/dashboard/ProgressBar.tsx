export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-gradient-to-r from-info via-sky-500 to-accent shadow-[0_0_12px_rgb(56_189_248/0.5)] transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
