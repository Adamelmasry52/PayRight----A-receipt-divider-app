import { useMemo } from "react";
import { CheckCircle, LinkBreak, Receipt, ShareNetwork, XCircle } from "@phosphor-icons/react";
import {
  decodeBillPayload,
  settleUp,
  whoOwesPayer,
  type Settlement,
} from "../../core/index.ts";
import { AppShell } from "../../components/AppShell.tsx";
import { Avatar } from "../../components/Avatar.tsx";
import { Button } from "../../components/ui/Button.tsx";

const money = (n: number) => n.toFixed(2);

/** Leave the shared link and reload into the Start screen (scan / enter manually). */
function startYourOwn() {
  // Go to the app root (StartScreen), dropping the shared fragment AND any
  // deep path the link was opened at (e.g. /summary).
  window.location.href = window.location.origin + "/";
}

/*
  Read-only view of a shared bill (spec §7). Hydrated entirely from the URL
  fragment — no editing controls, no context. A bad/oversized fragment shows a
  friendly invalid state, never a crash.
*/
export function SharedBillScreen({ fragment }: { fragment: string }) {
  const decoded = useMemo(() => decodeBillPayload(fragment), [fragment]);

  if (!decoded || decoded.bill.items.length === 0) {
    return (
      <AppShell
        footer={
          <Button variant="primary" className="w-full" onClick={startYourOwn}>
            <Receipt weight="fill" size={20} />
            Start your own bill
          </Button>
        }
      >
        <div className="grid min-h-[60dvh] place-items-center text-center">
          <div>
            <LinkBreak weight="duotone" size={48} className="mx-auto mb-3 text-danger" />
            <h1 className="text-2xl">This link is invalid</h1>
            <p className="mt-2 text-sm text-text-secondary">
              The shared bill couldn't be read. The link may be incomplete or out of date.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  const { bill, overrides } = decoded;

  let settlement: Settlement | null = null;
  try {
    settlement = settleUp(bill, { overrides });
  } catch {
    settlement = null;
  }

  if (!settlement) {
    return (
      <AppShell
        footer={
          <Button variant="primary" className="w-full" onClick={startYourOwn}>
            Start your own bill
          </Button>
        }
      >
        <div className="grid min-h-[60dvh] place-items-center text-center text-text-secondary">
          This shared bill is missing its totals.
        </div>
      </AppShell>
    );
  }

  const payer = bill.people.find((p) => p.id === bill.payerId) ?? null;
  const framing = whoOwesPayer(settlement, bill.payerId);
  const shortfall = Math.round((settlement.total - settlement.totalPaid) * 100) / 100;
  const upliftAmount = Math.round((settlement.total - settlement.subtotal) * 100) / 100;

  return (
    <AppShell
      footer={
        <Button variant="secondary" className="w-full" onClick={startYourOwn}>
          <Receipt weight="fill" size={20} />
          Start your own bill
        </Button>
      }
    >
      {/* Shared indicator */}
      <div className="mb-4 mt-1 flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-text-secondary">
        <ShareNetwork weight="fill" size={16} className="text-accent-teal" />
        Shared bill · read-only
      </div>

      <h1 className="mb-4 text-2xl">Settle up</h1>

      {/* Settle hero */}
      <section
        className={
          "rounded-card p-5 " +
          (settlement.isCovered ? "bg-surface-1" : "bg-surface-1 ring-2 ring-danger")
        }
      >
        <p className="text-sm font-semibold text-text-secondary">Total to settle</p>
        <p className="tabular mt-1 text-5xl font-bold text-text">
          {money(settlement.total)} <span className="text-2xl text-text-muted">EGP</span>
        </p>
        <div
          className={
            "mt-3 inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-semibold " +
            (settlement.isCovered
              ? "bg-success/15 text-success-text"
              : "bg-danger/15 text-danger")
          }
        >
          {settlement.isCovered ? (
            <CheckCircle weight="fill" size={18} />
          ) : (
            <XCircle weight="fill" size={18} />
          )}
          Paid {money(settlement.totalPaid)} / Bill {money(settlement.total)}
          {settlement.isCovered
            ? settlement.overage > 0
              ? ` (+${money(settlement.overage)})`
              : ""
            : ` (−${money(shortfall)})`}
        </div>
      </section>

      {/* Who owes what */}
      <section className="mt-4 rounded-card bg-surface-1 p-4">
        <h2 className="mb-3 text-base">{payer ? "Who owes what" : "Each person"}</h2>
        <ul className="space-y-1">
          {bill.people.map((person) => {
            const isPayer = payer?.id === person.id;
            const share = settlement.shares.find((s) => s.personId === person.id);
            const subline = isPayer
              ? `Paid the bill · collects ${money(framing.collects)}`
              : payer
                ? `owes ${payer.name}`
                : null;
            return (
              <li key={person.id} className="flex items-center gap-3 py-2">
                <Avatar
                  avatar={person.avatar}
                  color={person.color}
                  isPayer={isPayer}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-text">{person.name || "—"}</p>
                  {subline && (
                    <p className="truncate text-xs text-text-secondary">{subline}</p>
                  )}
                </div>
                <span
                  className={
                    "tabular text-lg font-bold " +
                    (share?.isOverridden ? "text-accent-gold" : "text-text")
                  }
                >
                  {money(share?.final ?? 0)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Breakdown */}
      <section className="mt-4 rounded-card bg-surface-1 p-4 text-sm">
        <h2 className="mb-3 text-base">How it adds up</h2>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-text-secondary">Subtotal</span>
          <span className="tabular text-text">{money(settlement.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between py-0.5">
          <span className="text-text-secondary">
            {settlement.upliftFactor >= 1
              ? `Tax & service (×${settlement.upliftFactor.toFixed(3)})`
              : `Discount (×${settlement.upliftFactor.toFixed(3)})`}
          </span>
          <span className="tabular text-text">
            {upliftAmount >= 0 ? "+" : "−"}
            {money(Math.abs(upliftAmount))}
          </span>
        </div>
        <div className="my-2 h-px bg-white/5" />
        <div className="flex items-center justify-between py-0.5">
          <span className="font-semibold text-text">Total</span>
          <span className="tabular text-base font-bold text-text">
            {money(settlement.total)} EGP
          </span>
        </div>
      </section>
    </AppShell>
  );
}
