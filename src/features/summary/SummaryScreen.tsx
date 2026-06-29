import { ArrowLeft, Coins } from "@phosphor-icons/react";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";

/*
  Placeholder for Step 5 (summary / settle-up with the green/red check).
  Reads the assigned bill from context to prove the assignment carried over.
*/
export function SummaryScreen() {
  const { bill } = useBill();
  const { navigate } = useRouter();

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

      <div className="rounded-card bg-surface-1 p-8 text-center">
        <Coins weight="duotone" size={44} className="mx-auto mb-3 text-accent-gold" />
        <h1 className="text-2xl">Settle up — coming next</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Step 5 will compute each person's share here.
        </p>

        <dl className="mt-6 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-muted">People</dt>
            <dd className="tabular text-text">{bill.people.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Items</dt>
            <dd className="tabular text-text">{bill.items.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Assignments</dt>
            <dd className="tabular text-text">{bill.assignments.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Total</dt>
            <dd className="tabular text-text">{bill.total.toFixed(2)} EGP</dd>
          </div>
        </dl>
      </div>
    </AppShell>
  );
}
