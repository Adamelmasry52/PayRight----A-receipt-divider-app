import { ArrowLeft, ListChecks } from "@phosphor-icons/react";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";
import { Avatar } from "../../components/Avatar.tsx";

/*
  Placeholder for Step 4b (assign items to people, all split modes). Reads the
  confirmed people from context to prove the setup carried over.
*/
export function AssignScreen() {
  const { bill } = useBill();
  const { navigate } = useRouter();

  return (
    <AppShell>
      <button
        type="button"
        onClick={() => navigate("/people")}
        className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft weight="bold" size={16} />
        Back to people
      </button>

      <div className="rounded-card bg-surface-1 p-8 text-center">
        <ListChecks
          weight="duotone"
          size={44}
          className="mx-auto mb-3 text-accent-teal"
        />
        <h1 className="text-2xl">Assign — coming next</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Step 4b will assign items to people here.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {bill.people.map((p) => (
            <div key={p.id} className="flex flex-col items-center gap-1">
              <Avatar
                avatar={p.avatar}
                color={p.color}
                isPayer={bill.payerId === p.id}
                size={48}
              />
              <span className="max-w-16 truncate text-xs text-text-secondary">
                {p.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
