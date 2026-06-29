import { useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  PencilSimple,
  XCircle,
} from "@phosphor-icons/react";
import type { Person, Settlement } from "../../core/index.ts";
import { isFullyAssigned, settleUp, whoOwesPayer } from "../../core/index.ts";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";
import { Avatar } from "../../components/Avatar.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { DecimalInput } from "../../components/ui/DecimalInput.tsx";

const money = (n: number) => n.toFixed(2);

export function SummaryScreen() {
  const { bill } = useBill();
  const { navigate } = useRouter();

  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const ready = bill.items.length > 0 && isFullyAssigned(bill);

  const settlement = useMemo<Settlement | null>(() => {
    if (!ready) return null;
    return settleUp(bill, { overrides });
  }, [bill, overrides, ready]);

  if (!settlement) {
    return (
      <AppShell>
        <button
          type="button"
          onClick={() => navigate("/assign")}
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
        >
          <ArrowLeft weight="bold" size={16} />
          Back to assign
        </button>
        <div className="rounded-card bg-surface-1 p-8 text-center text-text-secondary">
          Finish assigning every item first, then come back to settle up.
        </div>
      </AppShell>
    );
  }

  const payer = bill.people.find((p) => p.id === bill.payerId) ?? null;
  const framing = whoOwesPayer(settlement, bill.payerId);
  const shareOf = (id: string) =>
    settlement.shares.find((s) => s.personId === id)!;

  const hasOverrides = Object.keys(overrides).length > 0;
  const shortfall = Math.round((settlement.total - settlement.totalPaid) * 100) / 100;
  const upliftAmount = Math.round((settlement.total - settlement.subtotal) * 100) / 100;

  const setOverride = (id: string, value: number) =>
    setOverrides((o) => ({ ...o, [id]: value }));
  const resetOne = (id: string) =>
    setOverrides((o) => {
      const next = { ...o };
      delete next[id];
      return next;
    });

  return (
    <AppShell
      footer={
        <Button variant="primary" className="w-full" onClick={() => navigate("/share")}>
          Share this split
          <ArrowRight weight="bold" size={20} />
        </Button>
      }
    >
      {/* Header */}
      <header className="mb-4">
        <button
          type="button"
          onClick={() => navigate("/assign")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
        >
          <ArrowLeft weight="bold" size={16} />
          Back
        </button>
        <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
          <span>1 · Review</span>
          <span>›</span>
          <span>2 · People</span>
          <span>›</span>
          <span>3 · Assign</span>
          <span>›</span>
          <span className="text-success-text">4 · Settle</span>
        </div>
        <h1 className="mt-2 text-2xl">Settle up</h1>
      </header>

      {/* Settle hero card — the focal green/red signal */}
      <section
        className={
          "rounded-card p-5 " +
          (settlement.isCovered ? "bg-surface-1" : "bg-surface-1 ring-2 ring-danger")
        }
      >
        <p className="text-sm font-semibold text-text-secondary">Total to settle</p>
        <p className="tabular mt-1 text-5xl font-bold text-text">
          {money(settlement.total)}{" "}
          <span className="text-2xl text-text-muted">EGP</span>
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

        {!settlement.isCovered && (
          <p className="mt-2 text-xs text-danger">
            A manual override dropped the total below the bill.
          </p>
        )}
      </section>

      {/* Who owes what */}
      <section className="mt-4 rounded-card bg-surface-1 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base">{payer ? "Who owes what" : "Each person"}</h2>
          {hasOverrides && (
            <button
              type="button"
              onClick={() => setOverrides({})}
              className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-text"
            >
              <ArrowCounterClockwise weight="bold" size={14} />
              Reset all
            </button>
          )}
        </div>

        <ul className="space-y-1">
          {bill.people.map((person) => (
            <PersonShareRow
              key={person.id}
              person={person}
              isPayer={payer?.id === person.id}
              payerName={payer?.name ?? null}
              share={shareOf(person.id)}
              collects={payer?.id === person.id ? framing.collects : null}
              editing={editingId === person.id}
              onEdit={() => setEditingId(person.id)}
              onDoneEditing={() => setEditingId(null)}
              onOverride={(v) => setOverride(person.id, v)}
              onReset={() => resetOne(person.id)}
            />
          ))}
        </ul>
      </section>

      {/* Breakdown transparency */}
      <section className="mt-4 rounded-card bg-surface-1 p-4 text-sm">
        <h2 className="mb-3 text-base">How it adds up</h2>
        <Row label="Subtotal" value={money(settlement.subtotal)} muted />
        <Row
          label={
            settlement.upliftFactor >= 1
              ? `Tax & service (×${settlement.upliftFactor.toFixed(3)})`
              : `Discount (×${settlement.upliftFactor.toFixed(3)})`
          }
          value={`${upliftAmount >= 0 ? "+" : "−"}${money(Math.abs(upliftAmount))}`}
          muted
        />
        <div className="my-2 h-px bg-white/5" />
        <Row label="Total" value={`${money(settlement.total)} EGP`} />
      </section>
    </AppShell>
  );
}

// ----------------------------------------------------------------------------

function Row({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className={muted ? "text-text-secondary" : "font-semibold text-text"}>
        {label}
      </span>
      <span
        className={
          "tabular " + (muted ? "text-text" : "text-base font-bold text-text")
        }
      >
        {value}
      </span>
    </div>
  );
}

interface PersonShareRowProps {
  person: Person;
  isPayer: boolean;
  payerName: string | null;
  share: { final: number; isOverridden: boolean };
  collects: number | null;
  editing: boolean;
  onEdit: () => void;
  onDoneEditing: () => void;
  onOverride: (value: number) => void;
  onReset: () => void;
}

function PersonShareRow({
  person,
  isPayer,
  payerName,
  share,
  collects,
  editing,
  onEdit,
  onDoneEditing,
  onOverride,
  onReset,
}: PersonShareRowProps) {
  const subline = isPayer
    ? collects !== null
      ? `Paid the bill · collects ${money(collects)}`
      : "Paid the bill"
    : payerName
      ? `owes ${payerName}`
      : null;

  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar avatar={person.avatar} color={person.color} isPayer={isPayer} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text">{person.name || "—"}</p>
        {subline && (
          <p className="truncate text-xs text-text-secondary">{subline}</p>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-1">
          <DecimalInput
            value={share.final}
            onChange={onOverride}
            aria-label={`Edit ${person.name}'s share`}
            className="tabular w-24 text-right"
          />
          <button
            type="button"
            onClick={onDoneEditing}
            aria-label="Done editing"
            className="grid size-10 place-items-center rounded-md text-success-text hover:bg-white/5"
          >
            <Check weight="bold" size={18} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          {share.isOverridden && (
            <button
              type="button"
              onClick={onReset}
              aria-label={`Reset ${person.name}'s share`}
              className="grid size-9 place-items-center rounded-md text-accent-gold hover:bg-white/5"
              title="Edited — reset to computed"
            >
              <ArrowCounterClockwise weight="bold" size={15} />
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${person.name}'s share`}
            className="group flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-white/5"
          >
            <span
              className={
                "tabular text-lg font-bold " +
                (share.isOverridden ? "text-accent-gold" : "text-text")
              }
            >
              {money(share.final)}
            </span>
            <PencilSimple
              weight="bold"
              size={14}
              className="text-text-muted group-hover:text-text"
            />
          </button>
        </div>
      )}
    </li>
  );
}
