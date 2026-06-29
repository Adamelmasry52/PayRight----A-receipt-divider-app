import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Plus,
  Trash,
  UsersThree,
} from "@phosphor-icons/react";
import { addPerson, removePerson, renamePerson, togglePayer } from "../../core/index.ts";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";
import { Avatar } from "../../components/Avatar.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { TextInput } from "../../components/ui/TextInput.tsx";

export function PeopleScreen() {
  const { bill, setPeople, setPayer } = useBill();
  const { navigate } = useRouter();
  const [draftName, setDraftName] = useState("");

  const people = bill.people;

  const handleAdd = () => {
    const name = draftName.trim();
    if (!name) return;
    setPeople(addPerson(people, name));
    setDraftName("");
  };

  const handleRemove = (id: string) => {
    setPeople(removePerson(people, id));
    if (bill.payerId === id) setPayer(null); // freed payer slot
  };

  return (
    <AppShell
      footer={
        <Button
          variant="primary"
          className="w-full"
          disabled={people.length === 0}
          onClick={() => navigate("/assign")}
        >
          Continue to assign
          <ArrowRight weight="bold" size={20} />
        </Button>
      }
    >
      {/* Header + progress */}
      <header className="mb-5">
        <button
          type="button"
          onClick={() => navigate("/review")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text"
        >
          <ArrowLeft weight="bold" size={16} />
          Back
        </button>
        <div className="flex items-center gap-2 text-xs font-semibold text-text-muted">
          <span>1 · Review</span>
          <span>›</span>
          <span className="text-success-text">2 · People</span>
          <span>›</span>
          <span>3 · Assign</span>
          <span>›</span>
          <span>4 · Settle</span>
        </div>
        <h1 className="mt-2 text-2xl">Who's splitting?</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Add everyone at the table. Tap the crown to mark who paid (optional).
        </p>
      </header>

      {/* Add person */}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          handleAdd();
        }}
      >
        <TextInput
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          aria-label="New person name"
          placeholder="Add a name…"
          className="flex-1"
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" disabled={!draftName.trim()}>
          <Plus weight="bold" size={20} />
          Add
        </Button>
      </form>

      {/* People list */}
      {people.length === 0 ? (
        <div className="mt-5 rounded-card bg-surface-1 p-8 text-center">
          <UsersThree
            weight="duotone"
            size={40}
            className="mx-auto mb-3 text-text-muted"
          />
          <p className="text-sm text-text-secondary">No one added yet.</p>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {people.map((person, i) => {
            const isPayer = bill.payerId === person.id;
            return (
              <li
                key={person.id}
                className="flex items-center gap-3 rounded-md bg-surface-1 p-3"
              >
                <Avatar
                  avatar={person.avatar}
                  color={person.color}
                  isPayer={isPayer}
                  size={44}
                />
                <TextInput
                  value={person.name}
                  aria-label={`Name of person ${i + 1}`}
                  onChange={(e) =>
                    setPeople(renamePerson(people, person.id, e.target.value))
                  }
                  className="min-w-0 flex-1 bg-transparent px-1"
                />
                <button
                  type="button"
                  onClick={() => setPayer(togglePayer(bill.payerId, person.id))}
                  aria-label={isPayer ? "Clear payer" : "Mark as payer"}
                  aria-pressed={isPayer}
                  className={
                    "grid size-11 shrink-0 place-items-center rounded-md transition-colors " +
                    (isPayer
                      ? "bg-accent-gold/20 text-accent-gold"
                      : "text-text-muted hover:bg-white/5 hover:text-text")
                  }
                >
                  <Crown weight={isPayer ? "fill" : "regular"} size={20} />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(person.id)}
                  aria-label={`Remove person ${i + 1}`}
                  className="grid size-11 shrink-0 place-items-center rounded-md text-text-muted hover:bg-white/5 hover:text-danger"
                >
                  <Trash weight="bold" size={20} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
