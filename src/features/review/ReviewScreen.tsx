import { ArrowLeft, ArrowRight, Plus, Warning, Receipt } from "@phosphor-icons/react";
import { useMemo } from "react";
import { validateBillDraft } from "../../core/index.ts";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { DecimalInput } from "../../components/ui/DecimalInput.tsx";
import { ItemRow } from "./ItemRow.tsx";

export function ReviewScreen() {
  const { bill, addItem, updateItem, removeItem, setSubtotal, setTotal } = useBill();
  const { navigate } = useRouter();

  const v = useMemo(
    () =>
      validateBillDraft({
        items: bill.items,
        subtotal: bill.subtotal,
        total: bill.total,
      }),
    [bill.items, bill.subtotal, bill.total],
  );

  const issueFor = (id: string) =>
    v.itemIssues.find((i) => i.itemId === id)?.problems ?? [];

  const fmt = (n: number) => n.toFixed(2);

  return (
    <AppShell
      footer={
        <Button
          variant="primary"
          className="w-full"
          disabled={!v.canContinue}
          onClick={() => navigate("/people")}
        >
          Continue to people
          <ArrowRight weight="bold" size={20} />
        </Button>
      }
    >
      {/* Header + progress */}
      <header className="mb-5">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
        >
          <ArrowLeft weight="bold" size={16} />
          Back
        </button>
        <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
          <span className="text-success-text">1 · Review</span>
          <span>›</span>
          <span>2 · People</span>
          <span>›</span>
          <span>3 · Assign</span>
          <span>›</span>
          <span>4 · Settle</span>
        </div>
        <h1 className="mt-2 text-2xl">Review the bill</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Check each item, then confirm the subtotal and total.
        </p>
      </header>

      {/* Item list */}
      {bill.items.length === 0 ? (
        <div className="rounded-card bg-surface-1 p-8 text-center">
          <Receipt
            weight="duotone"
            size={40}
            className="mx-auto mb-3 text-text-muted"
          />
          <p className="text-sm text-text-secondary">No items yet.</p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => addItem()}
          >
            <Plus weight="bold" size={18} />
            Add the first item
          </Button>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {bill.items.map((item, i) => {
              const problems = issueFor(item.id);
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={i}
                  priceInvalid={problems.includes("price")}
                  qtyInvalid={problems.includes("qty")}
                  onChange={(patch) => updateItem(item.id, patch)}
                  onRemove={() => removeItem(item.id)}
                />
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => addItem()}
            className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/15 text-sm font-semibold text-text-secondary hover:border-white/30 hover:text-text"
          >
            <Plus weight="bold" size={18} />
            Add item
          </button>
        </>
      )}

      {/* Totals */}
      <section className="mt-5 rounded-card bg-surface-1 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">Items add up to</span>
          <span className="tabular text-base font-semibold text-text">
            {fmt(v.itemSum)}
          </span>
        </div>

        <div className="my-3 h-px bg-white/5" />

        {/* Subtotal */}
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="subtotal" className="text-sm text-text-secondary">
            Subtotal (S)
          </label>
          <DecimalInput
            id="subtotal"
            value={bill.subtotal}
            onChange={setSubtotal}
            aria-label="Subtotal"
            placeholder="0.00"
            invalid={!v.subtotalPositive && bill.items.length > 0}
            className="tabular w-32 text-right"
          />
        </div>

        {/* Subtotal helpers / discrepancy */}
        {bill.items.length > 0 && !v.subtotalMatchesItems && (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-danger/10 p-3 text-sm text-danger">
            <Warning weight="fill" size={18} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              {!v.subtotalPositive ? (
                <p>Enter the subtotal, or use the items total below.</p>
              ) : (
                <p>
                  Subtotal is{" "}
                  <span className="tabular font-semibold">
                    {v.discrepancy > 0 ? "+" : ""}
                    {fmt(v.discrepancy)}
                  </span>{" "}
                  off the items ({fmt(v.itemSum)}).
                </p>
              )}
              <button
                type="button"
                onClick={() => setSubtotal(v.itemSum)}
                className="mt-1 font-semibold text-success-text underline-offset-2 hover:underline"
              >
                Match to items ({fmt(v.itemSum)})
              </button>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <label htmlFor="total" className="text-sm text-text-secondary">
            Total (T)
          </label>
          <DecimalInput
            id="total"
            value={bill.total}
            onChange={setTotal}
            aria-label="Total"
            placeholder="0.00"
            invalid={!v.totalPositive && bill.items.length > 0}
            className="tabular w-32 text-right text-lg"
          />
        </div>

        {/* Uplift transparency */}
        {v.upliftFactor !== null && v.totalPositive && (
          <p className="mt-3 text-xs text-text-muted">
            {v.upliftFactor === 1 ? (
              <>No tax or service — total matches the subtotal.</>
            ) : v.upliftFactor > 1 ? (
              <>
                Tax &amp; service spread proportionally · ×
                <span className="tabular">{v.upliftFactor.toFixed(3)}</span>
              </>
            ) : (
              <>
                Overall discount spread proportionally · ×
                <span className="tabular">{v.upliftFactor.toFixed(3)}</span>
              </>
            )}
          </p>
        )}
      </section>
    </AppShell>
  );
}
