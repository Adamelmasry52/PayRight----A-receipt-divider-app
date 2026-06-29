import { ArrowLeft, ShareNetwork } from "@phosphor-icons/react";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";

/* Placeholder for Step 7 (read-only shareable link via lz-string URL). */
export function ShareScreen() {
  const { navigate } = useRouter();
  return (
    <AppShell>
      <button
        type="button"
        onClick={() => navigate("/summary")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft weight="bold" size={16} />
        Back to summary
      </button>
      <div className="rounded-card bg-surface-1 p-8 text-center">
        <ShareNetwork
          weight="duotone"
          size={44}
          className="mx-auto mb-3 text-accent-teal"
        />
        <h1 className="text-2xl">Share — coming next</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Step 7 will generate a read-only link here.
        </p>
      </div>
    </AppShell>
  );
}
