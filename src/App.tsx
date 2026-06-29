import {
  Receipt,
  Crown,
  CheckCircle,
  Camera,
  PencilSimple,
} from "@phosphor-icons/react";
import { RouterProvider, Routes } from "./router.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { Button } from "./components/ui/Button.tsx";

const ACCENTS = [
  { name: "orange", className: "bg-accent-orange" },
  { name: "blue", className: "bg-accent-blue" },
  { name: "green", className: "bg-accent-green" },
  { name: "teal", className: "bg-accent-teal" },
  { name: "gold", className: "bg-accent-gold" },
  { name: "purple", className: "bg-accent-purple" },
] as const;

/*
  Step 1 design proof. Not a feature screen — it renders the tokens, fonts,
  icons, radii, and status colors so we can verify the system before building
  real UI in Step 3+.
*/
function TokenProof() {
  return (
    <AppShell
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1">
            <PencilSimple weight="bold" size={20} />
            Enter manually
          </Button>
          <Button variant="primary" className="flex-1">
            <Camera weight="fill" size={20} />
            Scan receipt
          </Button>
        </div>
      }
    >
      {/* Header */}
      <header className="mb-6 flex items-center gap-3">
        <div className="grid size-11 place-items-center rounded-md bg-success text-surface-0">
          <Receipt weight="fill" size={24} />
        </div>
        <div>
          <h1 className="text-2xl leading-none">PayRight</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Split the bill, fair and square.
          </p>
        </div>
      </header>

      {/* Settle hero card — proves surfaces, money type, status green */}
      <section className="mb-4 rounded-card bg-surface-1 p-5">
        <p className="text-sm font-semibold text-text-secondary">Total to settle</p>
        <p className="tabular mt-1 text-5xl font-bold text-text">
          200.00 <span className="text-2xl text-text-muted">EGP</span>
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-pill bg-success/15 px-3 py-1.5 text-sm font-semibold text-success-text">
          <CheckCircle weight="fill" size={18} />
          Paid 200.03 / Bill 200.00 (+0.03)
        </div>
      </section>

      {/* People row — proves the 6-hue accent palette + payer crown */}
      <section className="mb-4 rounded-card bg-surface-1 p-5">
        <h2 className="mb-3 text-base">People</h2>
        <div className="flex flex-wrap gap-4">
          {ACCENTS.map((a, i) => (
            <div key={a.name} className="flex flex-col items-center gap-1.5">
              <div className="relative">
                <div
                  className={`grid size-12 place-items-center rounded-full ${a.className} font-display text-lg font-bold text-surface-0`}
                >
                  {a.name[0].toUpperCase()}
                </div>
                {i === 0 ? (
                  <Crown
                    weight="fill"
                    size={20}
                    className="absolute -top-2 left-1/2 -translate-x-1/2 -rotate-12 text-accent-gold"
                  />
                ) : null}
              </div>
              <span className="text-xs capitalize text-text-muted">{a.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Type + radius + status scale */}
      <section className="rounded-card bg-surface-1 p-5">
        <h2 className="mb-3 text-base">Design tokens</h2>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Fredoka — display / money</span>
            <span className="tabular text-lg">123.45</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Nunito — body</span>
            <span className="text-text">The quick brown fox</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="grid h-12 place-items-center rounded-sm bg-surface-2 text-xs text-text-muted">
            sm
          </div>
          <div className="grid h-12 place-items-center rounded-md bg-surface-2 text-xs text-text-muted">
            md
          </div>
          <div className="grid h-12 place-items-center rounded-card bg-surface-2 text-xs text-text-muted">
            card
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <span className="rounded-pill bg-success/15 px-3 py-1 text-xs font-semibold text-success-text">
            covered
          </span>
          <span className="rounded-pill bg-danger/15 px-3 py-1 text-xs font-semibold text-danger">
            underpaid
          </span>
        </div>
      </section>
    </AppShell>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <Routes routes={[{ path: "*", element: <TokenProof /> }]} />
    </RouterProvider>
  );
}
