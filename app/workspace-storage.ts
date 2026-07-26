import { validateSimulationInput } from "@/src/domain/dividend-simulator";
import {
  buildComparisonInputs,
  createInitialComparisonWorkspace,
  type CompareWorkspaceValues,
} from "./compare-model";
import {
  buildSimulationInput,
  INITIAL_FORM_VALUES,
  type SimulatorFormValues,
} from "./simulator-model";

export const WORKSPACE_STORAGE_KEY = "distribution-dividend-simulator:workspace:v1";
export const NAMED_WORKSPACES_STORAGE_KEY = "distribution-dividend-simulator:named-workspaces:v1";
export const WORKSPACE_BACKUP_FORMAT = "distribution-dividend-simulator-backup";
export const MAX_WORKSPACE_NAME_LENGTH = 40;
export type WorkspaceMode = "single" | "target" | "compare";

export interface SavedWorkspaceV1 {
  schemaVersion: 1;
  savedAt: string;
  activeMode: WorkspaceMode;
  single: SimulatorFormValues;
  comparison: CompareWorkspaceValues;
}

export interface NamedWorkspaceV1 {
  id: string;
  name: string;
  workspace: SavedWorkspaceV1;
}

export interface NamedWorkspaceCollectionV1 {
  schemaVersion: 1;
  items: NamedWorkspaceV1[];
}

export interface WorkspaceBackupV1 {
  format: typeof WORKSPACE_BACKUP_FORMAT;
  schemaVersion: 1;
  exportedAt: string;
  items: NamedWorkspaceV1[];
}

const comparisonShape = createInitialComparisonWorkspace();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesShape(value: unknown, shape: object): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  return Object.entries(shape as Record<string, unknown>)
    .every(([key, example]) => typeof value[key] === typeof example);
}

function isNumericStringInRange(
  value: string,
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
  integerOnly = false,
): boolean {
  if (value.trim() === "") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    && parsed >= minimum
    && parsed <= maximum
    && (!integerOnly || Number.isInteger(parsed));
}

function isPositiveNumericString(value: string): boolean {
  return isNumericStringInRange(value, 0) && Number(value) > 0;
}

export function isSimulatorFormValues(value: unknown): value is SimulatorFormValues {
  if (!matchesShape(value, INITIAL_FORM_VALUES)) return false;
  const enumsAreValid = ["foreignCredit", "noForeignCredit", "nisa", "custom"].includes(String(value.taxTreatment))
    && ["netOfExpense", "grossBeforeExpense"].includes(String(value.returnBasis))
    && ["afterForeignTax", "grossDividend"].includes(String(value.domesticTaxBaseMode))
    && ["monthly", "annual"].includes(String(value.targetPeriod))
    && ["gross", "net"].includes(String(value.targetBasis));
  if (!enumsAreValid) return false;

  const form = value as unknown as SimulatorFormValues;
  const years = Number(form.years);
  return validateSimulationInput(buildSimulationInput(form)).length === 0
    && isNumericStringInRange(form.initialYieldPercent, 0)
    && isPositiveNumericString(form.targetAmount)
    && isNumericStringInRange(form.targetDeadlineYears, 1, years, true)
    && [
      form.contributionPlanA,
      form.contributionPlanB,
      form.contributionPlanC,
    ].every((amount) => isNumericStringInRange(amount, 0));
}

export function isCompareWorkspaceValues(value: unknown): value is CompareWorkspaceValues {
  if (!isRecord(value) || !["sameInvestment", "sameTarget"].includes(String(value.mode))) return false;
  if (!matchesShape(value.common, comparisonShape.common)) return false;
  if (!Array.isArray(value.assets) || value.assets.length < 1 || value.assets.length > 3) return false;
  if (!value.assets.every((asset) => matchesShape(asset, comparisonShape.assets[0]))) return false;
  const ids = value.assets.map((asset) => String((asset as Record<string, unknown>).id));
  const validTaxValues = ["foreignCredit", "noForeignCredit", "nisa", "custom"];
  const validReturnValues = ["netOfExpense", "grossBeforeExpense"];
  const validTaxBaseValues = ["afterForeignTax", "grossDividend"];
  const enumsAreValid = value.assets.every((asset) => {
      const row = asset as Record<string, unknown>;
      return validTaxValues.includes(String(row.taxTreatment))
        && validReturnValues.includes(String(row.returnBasis))
        && validTaxBaseValues.includes(String(row.domesticTaxBaseMode));
    });
  if (new Set(ids).size !== ids.length || !enumsAreValid) return false;

  const comparison = value as unknown as CompareWorkspaceValues;
  return isPositiveNumericString(comparison.common.targetMonthlyJpy)
    && comparison.assets.every((asset) => isNumericStringInRange(asset.initialYieldPercent, 0))
    && buildComparisonInputs(comparison)
      .every(({ input }) => validateSimulationInput(input).length === 0);
}

export function serializeWorkspace(workspace: SavedWorkspaceV1): string {
  return JSON.stringify(workspace);
}

function isSavedWorkspaceV1(value: unknown): value is SavedWorkspaceV1 {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== 1
    || typeof value.savedAt !== "string"
    || Number.isNaN(Date.parse(value.savedAt))
  ) return false;
  if (!["single", "target", "compare"].includes(String(value.activeMode))) return false;
  return isSimulatorFormValues(value.single) && isCompareWorkspaceValues(value.comparison);
}

export function parseSavedWorkspace(raw: string | null): SavedWorkspaceV1 | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isSavedWorkspaceV1(value) ? value : null;
  } catch {
    return null;
  }
}

export function createEmptyNamedWorkspaceCollection(): NamedWorkspaceCollectionV1 {
  return { schemaVersion: 1, items: [] };
}

export function normalizeWorkspaceName(name: string): string {
  return name.trim();
}

function assertValidWorkspaceName(name: string): string {
  const normalized = normalizeWorkspaceName(name);
  if (normalized.length < 1 || normalized.length > MAX_WORKSPACE_NAME_LENGTH) {
    throw new RangeError(`保存名は1〜${MAX_WORKSPACE_NAME_LENGTH}文字で入力してください。`);
  }
  return normalized;
}

function isNamedWorkspaceV1(value: unknown): value is NamedWorkspaceV1 {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0) return false;
  if (typeof value.name !== "string") return false;
  const normalizedName = normalizeWorkspaceName(value.name);
  if (normalizedName !== value.name || normalizedName.length < 1 || normalizedName.length > MAX_WORKSPACE_NAME_LENGTH) {
    return false;
  }
  return isSavedWorkspaceV1(value.workspace);
}

export function serializeNamedWorkspaceCollection(collection: NamedWorkspaceCollectionV1): string {
  return JSON.stringify(collection);
}

export function parseNamedWorkspaceCollection(raw: string | null): NamedWorkspaceCollectionV1 | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.items)) return null;
    if (!value.items.every(isNamedWorkspaceV1)) return null;
    const ids = value.items.map((item) => item.id);
    const names = value.items.map((item) => item.name);
    if (new Set(ids).size !== ids.length || new Set(names).size !== names.length) return null;
    return {
      schemaVersion: 1,
      items: [...(value.items as NamedWorkspaceV1[])]
        .sort((a, b) => b.workspace.savedAt.localeCompare(a.workspace.savedAt)),
    };
  } catch {
    return null;
  }
}

export function upsertNamedWorkspace(
  collection: NamedWorkspaceCollectionV1,
  name: string,
  workspace: SavedWorkspaceV1,
  idForNewItem: string,
): NamedWorkspaceCollectionV1 {
  const normalizedName = assertValidWorkspaceName(name);
  if (!isSavedWorkspaceV1(workspace)) {
    throw new RangeError("入力条件を確認してください。");
  }
  const existing = collection.items.find((item) => item.name === normalizedName);
  if (!existing && idForNewItem.length === 0) throw new RangeError("保存IDが必要です。");
  const nextItem: NamedWorkspaceV1 = {
    id: existing?.id ?? idForNewItem,
    name: normalizedName,
    workspace,
  };
  return {
    schemaVersion: 1,
    items: [nextItem, ...collection.items.filter((item) => item.id !== nextItem.id)]
      .sort((a, b) => b.workspace.savedAt.localeCompare(a.workspace.savedAt)),
  };
}

export function deleteNamedWorkspace(
  collection: NamedWorkspaceCollectionV1,
  id: string,
): NamedWorkspaceCollectionV1 {
  return {
    schemaVersion: 1,
    items: collection.items.filter((item) => item.id !== id),
  };
}

export function createWorkspaceBackup(
  collection: NamedWorkspaceCollectionV1,
  exportedAt: string,
): WorkspaceBackupV1 {
  return {
    format: WORKSPACE_BACKUP_FORMAT,
    schemaVersion: 1,
    exportedAt,
    items: [...collection.items],
  };
}

export function serializeWorkspaceBackup(backup: WorkspaceBackupV1): string {
  return JSON.stringify(backup, null, 2);
}

export function parseWorkspaceBackup(raw: string): WorkspaceBackupV1 | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value)) return null;
    if (value.format !== WORKSPACE_BACKUP_FORMAT || value.schemaVersion !== 1) return null;
    if (typeof value.exportedAt !== "string" || Number.isNaN(Date.parse(value.exportedAt))) return null;
    if (!Array.isArray(value.items) || !value.items.every(isNamedWorkspaceV1)) return null;
    const items = value.items as NamedWorkspaceV1[];
    const ids = items.map((item) => item.id);
    const names = items.map((item) => item.name);
    if (new Set(ids).size !== ids.length || new Set(names).size !== names.length) return null;
    return {
      format: WORKSPACE_BACKUP_FORMAT,
      schemaVersion: 1,
      exportedAt: value.exportedAt,
      items: [...items],
    };
  } catch {
    return null;
  }
}

function uniqueImportedId(preferredId: string, usedIds: Set<string>): string {
  if (!usedIds.has(preferredId)) return preferredId;
  let suffix = 2;
  while (usedIds.has(`${preferredId}-${suffix}`)) suffix += 1;
  return `${preferredId}-${suffix}`;
}

export function mergeWorkspaceBackup(
  collection: NamedWorkspaceCollectionV1,
  backup: WorkspaceBackupV1,
): NamedWorkspaceCollectionV1 {
  const items = [...collection.items];
  const usedIds = new Set(items.map((item) => item.id));

  backup.items.forEach((imported) => {
    const existingIndex = items.findIndex((item) => item.name === imported.name);
    if (existingIndex >= 0) {
      items[existingIndex] = { ...imported, id: items[existingIndex].id };
      return;
    }
    const id = uniqueImportedId(imported.id, usedIds);
    usedIds.add(id);
    items.push({ ...imported, id });
  });

  return {
    schemaVersion: 1,
    items: items.sort((a, b) => b.workspace.savedAt.localeCompare(a.workspace.savedAt)),
  };
}
