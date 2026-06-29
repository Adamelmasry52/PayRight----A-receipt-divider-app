import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Minus,
  Plus,
  Warning,
} from "@phosphor-icons/react";
import type { Assignment, Item, SplitMode } from "../../core/index.ts";
import {
  assignmentsForItem,
  findUnassignedItems,
  isFullyAssigned,
  itemMode,
  lineTotal,
  setPersonValue,
  switchMode,
  tapSharer,
  validateItemFractions,
} from "../../core/index.ts";
import { useBill } from "../../context/BillContext.tsx";
import { useRouter } from "../../router.tsx";
import { AppShell } from "../../components/AppShell.tsx";
import { Avatar } from "../../components/Avatar.tsx";
import { Button } from "../../components/ui/Button.tsx";
import { DecimalInput } from "../../components/ui/DecimalInput.tsx";
import { Segmented } from "../../components/ui/Segmented.tsx";

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: "whole", label: "Whole" },
  { value: "equal", label: "Equal" },
  { value: "quantity", label: "Qty" },
  { value: "percent", label: "%" },
];

export function AssignScreen() {
  const { bill, setAssignments } = useBill();
  const { navigate } = useRouter();

  const peopleIds = bill.people.map((p) => p.id);
  const [activeItemId, setActiveItemId] = useState<string | null>(
    bill.items[0]?.id ?? null,
  );
  // Remembered segmented selection per item (matters before any sharer exists).
  const [pendingModes, setPendingModes] = useState<Record<string, SplitMode>>({});

  const effMode = (itemId: string): SplitMode =>
    itemMode(bill.assignments, itemId) ?? pendingModes[itemId] ?? "equal";

  const valueFor = (itemId: string, personId: string): number =>
    assignmentsForItem(bill.assignments, itemId).find((a) => a.personId === personId)
      ?.value ?? 0;

  const sumValues = (itemId: string): number =>
    assignmentsForItem(bill.assignments, itemId).reduce((s, a) => s + a.value, 0);

  // --- mutations (all via core helpers) ---
  const selectMode = (itemId: string, mode: SplitMode) => {
    setPendingModes((p) => ({ ...p, [itemId]: mode }));
    setAssignments(switchMode(bill.assignments, itemId, mode, peopleIds));
  };

  const onChip = (itemId: string, personId: string) => {
    const next = tapSharer(bill.assignments, itemId, personId);
    setAssignments(next);
    setPendingModes((p) => ({ ...p, [itemId]: itemMode(next, itemId) ?? "equal" }));
  };

  const onQty = (itemId: string, personId: string, k: number) =>
    setAssignments(
      setPersonValue(bill.assignments, itemId, personId, "quantity", k),
    );

  const onPct = (itemId: string, personId: string, pct: number) =>
    setAssignments(
      setPersonValue(bill.assignments, itemId, personId, "percent", pct),
    );

  const unassigned = findUnassignedItems(bill);
  const fully = isFullyAssigned(bill);

  return (
    <AppShell
      footer={
        <Button
          variant="primary"
          className="w-full"
          disabled={!fully}
          onClick={() => navigate("/summary")}
        >
          {fully ? "Continue to summary" : `${unassigned.length} item${unassigned.length === 1 ? "" : "s"} left`}
          <ArrowRight weight="bold" size={20} />
        </Button>
      }
    >
      {/* Header + progress */}
      <header className="mb-4">
        <button
          type="button"
          onClick={() => navigate("/people")}
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
          <span className="text-success-text">3 · Assign</span>
          <span>›</span>
          <span>4 · Settle</span>
        </div>
        <h1 className="mt-2 text-2xl">Assign items</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Tap people to share an item. The first tap assigns the whole item; tap
          more to split equally.
        </p>
      </header>

      {/* Assignment progress */}
      <div
        className={
          "mb-4 flex items-center gap-2 rounded-md p-3 text-sm font-semibold " +
          (fully
            ? "bg-success/15 text-success-text"
            : "bg-surface-1 text-text-secondary")
        }
      >
        {fully ? (
          <>
            <CheckCircle weight="fill" size={18} />
            All {bill.items.length} items assigned
          </>
        ) : (
          <>
            <Warning weight="fill" size={18} className="text-danger" />
            {unassigned.length} of {bill.items.length} items still need assigning
          </>
        )}
      </div>

      {/* Item list */}
      <ul className="space-y-2">
        {bill.items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            active={activeItemId === item.id}
            onToggle={() =>
              setActiveItemId((cur) => (cur === item.id ? null : item.id))
            }
            mode={effMode(item.id)}
            assignments={assignmentsForItem(bill.assignments, item.id)}
            people={bill.people}
            payerId={bill.payerId}
            valueFor={valueFor}
            sum={sumValues(item.id)}
            onSelectMode={(m) => selectMode(item.id, m)}
            onChip={(pid) => onChip(item.id, pid)}
            onQty={(pid, k) => onQty(item.id, pid, k)}
            onPct={(pid, pct) => onPct(item.id, pid, pct)}
          />
        ))}
      </ul>
    </AppShell>
  );
}

// ----------------------------------------------------------------------------

interface ItemCardProps {
  item: Item;
  active: boolean;
  onToggle: () => void;
  mode: SplitMode;
  assignments: Assignment[];
  people: { id: string; name: string; avatar: string; color: string }[];
  payerId: string | null;
  valueFor: (itemId: string, personId: string) => number;
  sum: number;
  onSelectMode: (mode: SplitMode) => void;
  onChip: (personId: string) => void;
  onQty: (personId: string, k: number) => void;
  onPct: (personId: string, pct: number) => void;
}

function ItemCard(props: ItemCardProps) {
  const { item, active, onToggle, mode, assignments, people, payerId } = props;

  const isValid = assignments.length > 0 && validateItemFractions(item, assignments);
  const isEmpty = assignments.length === 0;

  // Sharer ids: for qty/percent only those with value > 0 actually share.
  const sharerIds =
    mode === "quantity" || mode === "percent"
      ? assignments.filter((a) => a.value > 0).map((a) => a.personId)
      : assignments.map((a) => a.personId);
  const sharers = people.filter((p) => sharerIds.includes(p.id));

  return (
    <li
      className={
        "rounded-card bg-surface-1 transition-colors " +
        (active ? "ring-2 ring-accent-blue" : "")
      }
    >
      {/* Header (tap to expand) */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-3 text-left"
        aria-expanded={active}
      >
        <StatusDot isEmpty={isEmpty} isValid={isValid} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text">
            {item.name || "Untitled item"}
          </p>
          <ItemSubline
            item={item}
            mode={mode}
            isEmpty={isEmpty}
            isValid={isValid}
            sharers={sharers}
            sum={props.sum}
          />
        </div>
        <span className="tabular shrink-0 text-base font-semibold text-text">
          {lineTotal(item).toFixed(2)}
        </span>
      </button>

      {/* Editor */}
      {active && (
        <div className="border-t border-white/5 p-3">
          <Segmented
            aria-label={`Split mode for ${item.name || "item"}`}
            options={MODE_OPTIONS}
            value={mode}
            onChange={props.onSelectMode}
          />

          {(mode === "whole" || mode === "equal") && (
            <div className="mt-3 flex flex-wrap gap-2">
              {people.map((person) => {
                const selected = sharerIds.includes(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => props.onChip(person.id)}
                    aria-pressed={selected}
                    className={
                      "flex items-center gap-2 rounded-pill py-1.5 pl-1.5 pr-3 text-sm font-semibold transition-colors " +
                      (selected
                        ? "bg-surface-2 text-text ring-2 ring-success"
                        : "bg-surface-2/60 text-text-secondary hover:text-text")
                    }
                  >
                    <Avatar
                      avatar={person.avatar}
                      color={person.color}
                      isPayer={payerId === person.id}
                      size={28}
                    />
                    {person.name || "—"}
                    {selected && (
                      <CheckCircle
                        weight="fill"
                        size={16}
                        className="text-success-text"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {mode === "quantity" && (
            <div className="mt-3 space-y-2">
              {people.map((person) => (
                <PersonRow key={person.id} person={person} payerId={payerId}>
                  <Stepper
                    value={props.valueFor(item.id, person.id)}
                    min={0}
                    max={item.qty}
                    ariaLabel={`Units of ${item.name} for ${person.name}`}
                    onChange={(k) => props.onQty(person.id, k)}
                  />
                </PersonRow>
              ))}
              <RemainderLine
                label="units"
                sum={props.sum}
                target={item.qty}
              />
            </div>
          )}

          {mode === "percent" && (
            <div className="mt-3 space-y-2">
              {people.map((person) => (
                <PersonRow key={person.id} person={person} payerId={payerId}>
                  <div className="flex items-center gap-1">
                    <DecimalInput
                      value={props.valueFor(item.id, person.id)}
                      onChange={(pct) => props.onPct(person.id, pct)}
                      aria-label={`Percent of ${item.name} for ${person.name}`}
                      placeholder="0"
                      className="tabular w-16 text-right"
                    />
                    <span className="text-text-muted">%</span>
                  </div>
                </PersonRow>
              ))}
              <RemainderLine label="%" sum={props.sum} target={100} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function StatusDot({ isEmpty, isValid }: { isEmpty: boolean; isValid: boolean }) {
  if (isEmpty)
    return <span className="size-2.5 shrink-0 rounded-full bg-text-muted" aria-label="Unassigned" />;
  if (isValid)
    return (
      <CheckCircle weight="fill" size={20} className="shrink-0 text-success" aria-label="Fully assigned" />
    );
  return (
    <Warning weight="fill" size={20} className="shrink-0 text-danger" aria-label="Invalid split" />
  );
}

function ItemSubline({
  item,
  mode,
  isEmpty,
  isValid,
  sharers,
  sum,
}: {
  item: Item;
  mode: SplitMode;
  isEmpty: boolean;
  isValid: boolean;
  sharers: { id: string; name: string }[];
  sum: number;
}) {
  if (isEmpty)
    return <p className="text-xs text-text-muted">Tap to assign</p>;

  if (!isValid) {
    const detail =
      mode === "quantity"
        ? `${sum}/${item.qty} units`
        : mode === "percent"
          ? `${sum}/100%`
          : "needs a person";
    return <p className="text-xs font-semibold text-danger">Incomplete · {detail}</p>;
  }

  const names = sharers.map((s) => s.name || "—").join(", ");
  const label =
    mode === "whole"
      ? `All to ${names}`
      : mode === "equal"
        ? `Equal · ${names}`
        : mode === "quantity"
          ? `By units · ${names}`
          : `By % · ${names}`;
  return <p className="truncate text-xs text-success-text">{label}</p>;
}

function PersonRow({
  person,
  payerId,
  children,
}: {
  person: { id: string; name: string; avatar: string; color: string };
  payerId: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar
        avatar={person.avatar}
        color={person.color}
        isPayer={payerId === person.id}
        size={32}
      />
      <span className="min-w-0 flex-1 truncate text-sm text-text">
        {person.name || "—"}
      </span>
      {children}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  ariaLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  ariaLabel: string;
  onChange: (value: number) => void;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center rounded-md bg-surface-2">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label={`Decrease ${ariaLabel}`}
        className="grid size-10 place-items-center rounded-md text-text-secondary disabled:opacity-40 hover:text-text"
      >
        <Minus weight="bold" size={16} />
      </button>
      <span className="tabular w-7 text-center text-base" aria-label={ariaLabel}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label={`Increase ${ariaLabel}`}
        className="grid size-10 place-items-center rounded-md text-text-secondary disabled:opacity-40 hover:text-text"
      >
        <Plus weight="bold" size={16} />
      </button>
    </div>
  );
}

function RemainderLine({
  label,
  sum,
  target,
}: {
  label: string;
  sum: number;
  target: number;
}) {
  const remainder = Math.round((target - sum) * 100) / 100;
  const exact = remainder === 0;
  const over = remainder < 0;
  return (
    <div
      className={
        "flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold " +
        (exact ? "bg-success/15 text-success-text" : "bg-danger/10 text-danger")
      }
    >
      <span className="tabular">
        {sum} / {target} {label}
      </span>
      <span>
        {exact
          ? "balanced"
          : over
            ? `${Math.abs(remainder)} over`
            : `${remainder} left`}
      </span>
    </div>
  );
}
