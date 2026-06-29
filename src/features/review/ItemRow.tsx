import { Minus, Plus, Trash } from "@phosphor-icons/react";
import type { Item } from "../../core/index.ts";
import { lineTotal } from "../../core/index.ts";
import { DecimalInput } from "../../components/ui/DecimalInput.tsx";
import { TextInput } from "../../components/ui/TextInput.tsx";

interface ItemRowProps {
  item: Item;
  index: number;
  priceInvalid: boolean;
  qtyInvalid: boolean;
  onChange: (patch: Partial<Omit<Item, "id">>) => void;
  onRemove: () => void;
}

export function ItemRow({
  item,
  index,
  priceInvalid,
  qtyInvalid,
  onChange,
  onRemove,
}: ItemRowProps) {
  const setQty = (next: number) => onChange({ qty: Math.max(1, next) });

  return (
    <li className="rounded-md bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <TextInput
          value={item.name}
          aria-label={`Item ${index + 1} name`}
          placeholder="Item name"
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove item ${index + 1}`}
          className="grid size-11 shrink-0 place-items-center rounded-md text-text-muted hover:bg-white/5 hover:text-danger"
        >
          <Trash weight="bold" size={20} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {/* Quantity stepper — large tap targets */}
        <div
          className={
            "flex items-center rounded-md bg-surface-2 " +
            (qtyInvalid ? "ring-2 ring-danger" : "")
          }
        >
          <button
            type="button"
            onClick={() => setQty(item.qty - 1)}
            disabled={item.qty <= 1}
            aria-label={`Decrease quantity of item ${index + 1}`}
            className="grid size-11 place-items-center rounded-md text-text-secondary disabled:opacity-40 hover:text-text"
          >
            <Minus weight="bold" size={18} />
          </button>
          <span
            className="tabular w-7 text-center text-base"
            aria-label={`Quantity of item ${index + 1}`}
          >
            {item.qty}
          </span>
          <button
            type="button"
            onClick={() => setQty(item.qty + 1)}
            aria-label={`Increase quantity of item ${index + 1}`}
            className="grid size-11 place-items-center rounded-md text-text-secondary hover:text-text"
          >
            <Plus weight="bold" size={18} />
          </button>
        </div>

        <span className="text-text-muted">×</span>

        <DecimalInput
          value={item.unitPrice}
          onChange={(unitPrice) => onChange({ unitPrice })}
          aria-label={`Unit price of item ${index + 1}`}
          placeholder="0.00"
          invalid={priceInvalid}
          className="tabular w-24 text-right"
        />

        <span className="ml-auto text-sm text-text-muted">=</span>
        <span className="tabular w-24 text-right text-base font-semibold text-text">
          {lineTotal(item).toFixed(2)}
        </span>
      </div>
    </li>
  );
}
