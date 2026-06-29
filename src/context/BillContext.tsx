import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Assignment, Bill, Item, Person } from "../core/index.ts";

/*
  Session state for the whole bill (spec §5). Lives in memory only — no
  persistence (a later step encodes it into the shareable URL).

  Step 3 populates items/subtotal/total. people/assignments/payerId are carried
  here from the start so Steps 4–5 add reducer cases without reshaping state.
*/

function newId(): string {
  // crypto.randomUUID exists in modern browsers and Node 22.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export function emptyBill(): Bill {
  return {
    currency: "EGP",
    items: [],
    subtotal: 0,
    total: 0,
    people: [],
    assignments: [],
    payerId: null,
  };
}

export function blankItem(partial: Partial<Item> = {}): Item {
  return { id: newId(), name: "", unitPrice: 0, qty: 1, ...partial };
}

/** Fields the review screen / OCR fill. */
export type BillDraft = Pick<Bill, "items" | "subtotal" | "total">;

type Action =
  | { type: "RESET" }
  | { type: "LOAD_DRAFT"; draft: BillDraft }
  | { type: "ADD_ITEM"; item?: Partial<Item> }
  | { type: "UPDATE_ITEM"; id: string; patch: Partial<Omit<Item, "id">> }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "SET_SUBTOTAL"; value: number }
  | { type: "SET_TOTAL"; value: number }
  // Reserved for Steps 4–5 so consumers can dispatch ahead of feature work.
  | { type: "SET_PEOPLE"; people: Person[] }
  | { type: "SET_ASSIGNMENTS"; assignments: Assignment[] }
  | { type: "SET_PAYER"; payerId: string | null };

function reducer(state: Bill, action: Action): Bill {
  switch (action.type) {
    case "RESET":
      return emptyBill();
    case "LOAD_DRAFT":
      return {
        ...state,
        items: action.draft.items,
        subtotal: action.draft.subtotal,
        total: action.draft.total,
      };
    case "ADD_ITEM":
      return { ...state, items: [...state.items, blankItem(action.item)] };
    case "UPDATE_ITEM":
      return {
        ...state,
        items: state.items.map((it) =>
          it.id === action.id ? { ...it, ...action.patch } : it,
        ),
      };
    case "REMOVE_ITEM":
      return { ...state, items: state.items.filter((it) => it.id !== action.id) };
    case "SET_SUBTOTAL":
      return { ...state, subtotal: action.value };
    case "SET_TOTAL":
      return { ...state, total: action.value };
    case "SET_PEOPLE":
      return { ...state, people: action.people };
    case "SET_ASSIGNMENTS":
      return { ...state, assignments: action.assignments };
    case "SET_PAYER":
      return { ...state, payerId: action.payerId };
    default:
      return state;
  }
}

interface BillContextValue {
  bill: Bill;
  reset: () => void;
  loadDraft: (draft: BillDraft) => void;
  addItem: (item?: Partial<Item>) => void;
  updateItem: (id: string, patch: Partial<Omit<Item, "id">>) => void;
  removeItem: (id: string) => void;
  setSubtotal: (value: number) => void;
  setTotal: (value: number) => void;
  setPeople: (people: Person[]) => void;
  setAssignments: (assignments: Assignment[]) => void;
  setPayer: (payerId: string | null) => void;
}

const BillContext = createContext<BillContextValue | null>(null);

export function BillProvider({ children }: { children: ReactNode }) {
  const [bill, dispatch] = useReducer(reducer, undefined, emptyBill);

  const value = useMemo<BillContextValue>(
    () => ({
      bill,
      reset: () => dispatch({ type: "RESET" }),
      loadDraft: (draft) => dispatch({ type: "LOAD_DRAFT", draft }),
      addItem: (item) => dispatch({ type: "ADD_ITEM", item }),
      updateItem: (id, patch) => dispatch({ type: "UPDATE_ITEM", id, patch }),
      removeItem: (id) => dispatch({ type: "REMOVE_ITEM", id }),
      setSubtotal: (value) => dispatch({ type: "SET_SUBTOTAL", value }),
      setTotal: (value) => dispatch({ type: "SET_TOTAL", value }),
      setPeople: (people) => dispatch({ type: "SET_PEOPLE", people }),
      setAssignments: (assignments) =>
        dispatch({ type: "SET_ASSIGNMENTS", assignments }),
      setPayer: (payerId) => dispatch({ type: "SET_PAYER", payerId }),
    }),
    [bill],
  );

  return <BillContext.Provider value={value}>{children}</BillContext.Provider>;
}

export function useBill(): BillContextValue {
  const ctx = useContext(BillContext);
  if (!ctx) throw new Error("useBill must be used within <BillProvider>");
  return ctx;
}
