import { useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Image as ImageIcon,
  Spinner,
  Warning,
} from "@phosphor-icons/react";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";
import { Button } from "../../components/ui/Button.tsx";
import type { OcrStage } from "../../ocr/pipeline.ts";

const STAGE_TEXT: Record<OcrStage, string> = {
  normalizing: "Preparing the photo…",
  preprocessing: "Cleaning up the image…",
  "loading-model": "Loading the OCR model (first scan only)…",
  reading: "Reading the receipt…",
  parsing: "Finding items and totals…",
};

type Status = "idle" | "working" | "error";

export function CaptureScreen() {
  const { reset, loadDraft } = useBill();
  const { navigate } = useRouter();

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState<OcrStage>("normalizing");
  const [error, setError] = useState<string>("");

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setStatus("working");
    setError("");
    try {
      const { runOcrPipeline } = await import("../../ocr/pipeline.ts");
      const outcome = await runOcrPipeline(file, { onStage: setStage });

      // ---- Per-scan dump for assessing OCR + classification on real receipts ----
      const { draft, lines, timings } = outcome;
      const classified = {
        items: draft.items.map((i) => ({
          name: i.name,
          qty: i.qty,
          unitPrice: i.unitPrice,
        })),
        subtotal: draft.subtotal,
        total: draft.total,
        service: draft.service,
        tax: draft.tax,
      };
      console.groupCollapsed("%c[PayRight OCR] scan result", "font-weight:bold");
      console.log("timings(ms):", timings);
      console.log(`raw OCR lines (${lines.length}):\n` + lines.join("\n"));
      console.log("classified:", JSON.stringify(classified, null, 2));
      console.table(classified.items);
      console.groupEnd();
      // Also exposed for quick inspection: window.__payrightOcr
      (window as unknown as { __payrightOcr?: unknown }).__payrightOcr = {
        lines,
        classified,
        timings,
      };

      reset();
      loadDraft(draft);
      navigate("/review");
    } catch (e) {
      console.error("[PayRight OCR] failed:", e);
      setError(
        e instanceof Error ? e.message : "Something went wrong reading the receipt.",
      );
      setStatus("error");
    }
  };

  return (
    <AppShell>
      <button
        type="button"
        onClick={() => navigate("/")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft weight="bold" size={16} />
        Back
      </button>

      <h1 className="text-2xl">Scan a receipt</h1>
      <p className="mt-1 text-sm text-text-secondary">
        Photograph the receipt or pick a photo. It's read on your phone — nothing
        is uploaded.
      </p>

      {/* Framing guide */}
      <div className="relative mt-6 aspect-[3/4] w-full overflow-hidden rounded-card bg-surface-1">
        <div className="pointer-events-none absolute inset-5 rounded-md border-2 border-dashed border-white/20" />
        {status === "working" ? (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <Spinner
                weight="bold"
                size={40}
                className="mx-auto mb-3 animate-spin text-success"
              />
              <p className="text-sm font-semibold text-text">{STAGE_TEXT[stage]}</p>
              <p className="mt-1 text-xs text-text-muted">
                The model is cached after the first scan.
              </p>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <Camera weight="duotone" size={44} className="mx-auto mb-2 text-text-muted" />
              <p className="text-sm text-text-secondary">
                Fit the whole receipt inside the frame, flat and well-lit.
              </p>
            </div>
          </div>
        )}
      </div>

      {status === "error" && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
          <Warning weight="fill" size={18} className="mt-0.5 shrink-0" />
          <div>
            <p>{error}</p>
            <p className="mt-1 text-text-secondary">
              Try again, or{" "}
              <button
                type="button"
                onClick={() => {
                  reset();
                  navigate("/review");
                }}
                className="font-semibold text-success-text underline-offset-2 hover:underline"
              >
                enter it manually
              </button>
              .
            </p>
          </div>
        </div>
      )}

      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      <div className="mt-6 flex flex-col gap-3">
        <Button
          variant="primary"
          className="w-full"
          disabled={status === "working"}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera weight="fill" size={20} />
          Take photo
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          disabled={status === "working"}
          onClick={() => galleryRef.current?.click()}
        >
          <ImageIcon weight="fill" size={20} />
          Choose from photos
        </Button>
      </div>
    </AppShell>
  );
}
