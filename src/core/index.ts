// Public surface of the core math engine. UI imports from "@/core" (or "../core").
export type {
  SplitMode,
  Item,
  Person,
  Assignment,
  Bill,
} from "./types.ts";

export {
  SplitError,
  type SplitErrorCode,
  lineTotal,
  computeSubtotal,
  upliftFactor,
  assignmentsByItem,
  itemFractions,
  validateItemFractions,
  findUnassignedItems,
  isFullyAssigned,
  computeRawShares,
  settleUp,
  whoOwesPayer,
  type PersonShare,
  type Settlement,
  type SettleOptions,
  type OwedLine,
  type PayerFraming,
} from "./split.ts";

export { ceilMoney, roundMoney, approxEqual, MONEY_EPSILON } from "./rounding.ts";
export { normalizeDigits, parseMoney } from "./parse.ts";
export { parseReceiptLines, type ParsedReceipt } from "./receiptParse.ts";

export {
  encodeBillPayload,
  decodeBillPayload,
  type DecodedBill,
  SHARE_SCHEMA_VERSION,
  SHARE_FRAGMENT_PREFIX,
  MAX_FRAGMENT_CHARS,
} from "./url.ts";

export {
  validateBillDraft,
  type BillDraftInput,
  type BillDraftValidation,
  type ItemIssue,
} from "./validate.ts";

export {
  assignmentsForItem,
  itemMode,
  replaceItemAssignments,
  tapSharer,
  switchMode,
  setPersonValue,
} from "./assign.ts";

export {
  ACCENT_KEYS,
  type AccentKey,
  AVATAR_POOL,
  type AvatarId,
  nextAvatar,
  nextAccent,
  createPerson,
  addPerson,
  renamePerson,
  removePerson,
  togglePayer,
} from "./people.ts";
