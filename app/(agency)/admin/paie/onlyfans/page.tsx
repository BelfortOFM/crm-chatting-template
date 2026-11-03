import PaieView from "../PaieView";

export default async function OnlyFansPaiePage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; model?: string }>;
}) {
  const { p, model } = await searchParams;
  return <PaieView platform="onlyfans" p={p} model={model} />;
}
