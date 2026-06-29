/*
  Canonical data model (spec §5). Pure types — no React, no runtime code.
  `upliftFactor`, per-person shares, `totalPaid`, and validation status are
  COMPUTED (see split.ts), never stored on the Bill.
*/

export type SplitMode = "whole" | "equal" | "quantity" | "percent";

export interface Item {
  id: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface Person {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isPayer: boolean;
}

/** `value` carries the mode-specific number: k of qty for "quantity", pct for "percent". */
export interface Assignment {
  itemId: string;
  personId: string;
  mode: SplitMode;
  value: number;
}

export interface Bill {
  currency: "EGP";
  items: Item[];
  subtotal: number; // confirmed
  total: number; // confirmed printed grand total (incl. tax + service)
  people: Person[];
  assignments: Assignment[];
  payerId: string | null;
}
