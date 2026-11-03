"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Camera, Check, AlertCircle, ShieldCheck, RotateCcw, Loader2, MapPin } from "lucide-react";
import { submitVerification, type VerificationState } from "./actions";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { compressImage, setInputFile } from "@/lib/image-compress";

const initialState: VerificationState = {};

interface Step {
  kind: "id_front" | "id_back" | "selfie" | "id_with_face";
  title: string;
  hint: string;
  /** "environment" = camera arriere pour un document, "user" = sefie. */
  facing: "environment" | "user";
}

const STEPS: Step[] = [
  {
    kind: "id_front",
    title: "ID document — front",
    hint: "ID card, passport or residence permit. All four corners must be visible and the text readable.",
    facing: "environment",
  },
  {
    kind: "id_back",
    title: "ID document — back",
    hint: "The back of the same document. For a passport, use the photo page again.",
    facing: "environment",
  },
  {
    kind: "selfie",
    title: "Photo of your face",
    hint: "Well-lit face, no sunglasses or cap. Used only to verify you're the person on the document.",
    facing: "user",
  },
  {
    kind: "id_with_face",
    title: "You with your ID",
    hint: "Hold your ID next to your face: both must be sharp and readable in the same photo.",
    facing: "user",
  },
];

type LocationStatus = "pending" | "found" | "unavailable";

export function CaptureForm() {
  const [state, formAction, pending] = useActionState(submitVerification, initialState);
  // Aperçus locaux : rien n'est envoyé tant que le formulaire n'est pas validé.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Demandée dès l'arrivée sur l'écran (pas au clic d'envoi) : le temps de
  // prendre les photos suffit généralement à ce qu'elle soit prête. En
  // l'absence de réponse (refus, timeout, appareil sans GPS), l'envoi se fait
  // quand même — le serveur retombe alors sur une estimation via l'IP.
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("pending");

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationStatus("unavailable");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(pos.coords);
        setLocationStatus("found");
      },
      () => setLocationStatus("unavailable"),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }, []);

  const ready = STEPS.every((s) => previews[s.kind]);

  // La photo est réduite avant l'envoi : une prise de vue d'iPhone dépasse à
  // elle seule la taille de corps acceptée par le serveur.
  async function onPick(kind: string, file: File | undefined) {
    if (!file) return;
    setWorking(kind);
    const compressed = await compressImage(file);
    const input = inputs.current[kind];
    if (input && compressed !== file) setInputFile(input, compressed);
    setPreviews((prev) => {
      if (prev[kind]) URL.revokeObjectURL(prev[kind]!);
      return { ...prev, [kind]: URL.createObjectURL(compressed) };
    });
    setWorking(null);
  }

  return (
    <form action={formAction} className="space-y-4">
      {STEPS.map((step, i) => {
        const done = Boolean(previews[step.kind]);
        return (
          <div
            key={step.kind}
            className={cn(
              "rounded-2xl border bg-surface p-4 transition-colors",
              done ? "border-success/40" : "border-border"
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  done ? "bg-success-soft text-success" : "bg-surface-2 text-muted"
                )}
              >
                {done ? <Check size={15} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="mt-0.5 text-xs text-muted">{step.hint}</p>
              </div>
            </div>

            {done && (
              // eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:), pas une ressource distante
              <img
                src={previews[step.kind]}
                alt=""
                className="mt-3 max-h-48 w-full rounded-xl object-cover"
              />
            )}

            {/* capture= ouvre directement l'appareil photo sur mobile ; sur
                ordinateur le navigateur retombe sur le sélecteur de fichier. */}
            <input
              ref={(el) => {
                inputs.current[step.kind] = el;
              }}
              type="file"
              name={step.kind}
              accept="image/*"
              capture={step.facing}
              required
              className="sr-only"
              onChange={(e) => onPick(step.kind, e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={working === step.kind}
              onClick={() => inputs.current[step.kind]?.click()}
              className={cn(
                "mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-medium transition-colors",
                done
                  ? "border-border text-muted hover:border-accent hover:text-accent"
                  : "border-accent/50 bg-accent-soft text-accent hover:bg-accent/20"
              )}
            >
              {working === step.kind ? (
                <Loader2 size={16} className="animate-spin" />
              ) : done ? (
                <RotateCcw size={16} />
              ) : (
                <Camera size={16} />
              )}
              {working === step.kind
                ? "Preparing…"
                : done
                  ? "Retake photo"
                  : "Take photo"}
            </button>
          </div>
        );
      })}

      {/* Champs cachés : posés par la géoloc navigateur si elle a répondu à
          temps, sinon vides — le serveur estime alors la position via l'IP. */}
      <input type="hidden" name="loc_lat" value={location?.latitude ?? ""} />
      <input type="hidden" name="loc_lon" value={location?.longitude ?? ""} />
      <input type="hidden" name="loc_accuracy" value={location?.accuracy ?? ""} />

      <p className="flex items-center gap-1.5 text-xs text-muted">
        <MapPin size={13} className="shrink-0" />
        {locationStatus === "found"
          ? "Location detected — attached to your submission for anti-fraud checks."
          : locationStatus === "unavailable"
            ? "Location not shared — an IP-based estimate will be used instead."
            : "Detecting your location…"}
      </p>

      {state.error && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending || !ready || working !== null} className="w-full">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={16} />
          {pending ? "Securely sending…" : "Submit my documents"}
        </span>
      </Button>

      {!ready && (
        <p className="text-center text-xs text-muted">
          All photos are required to submit.
        </p>
      )}
    </form>
  );
}
