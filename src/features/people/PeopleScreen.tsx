import { ArrowLeft, UsersThree } from "@phosphor-icons/react";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";

/*
  Placeholder for Step 4 (add people, avatars, accent colors, payer crown).
  It reads the confirmed bill from context to prove the draft carried over.
*/
export function PeopleScreen() {
  const { bill } = useBill();
  const { navigate } = useRouter();

  return (
    <AppShell>
      <button
        type="button"
        onClick={() => navigate("/review")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft weight="bold" size={16} />
        Back to review
      </button>

      <div className="rounded-card bg-surface-1 p-8 text-center">
        <UsersThree
          weight="duotone"
          size={44}
          className="mx-auto mb-3 text-accent-blue"
        />
        <h1 className="text-2xl">People — coming next</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Step 4 will add people, avatars, and the payer here.
        </p>

        <dl className="mt-6 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-muted">Items</dt>
            <dd className="tabular text-text">{bill.items.length}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Subtotal</dt>
            <dd className="tabular text-text">{bill.subtotal.toFixed(2)} EGP</dd>
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
