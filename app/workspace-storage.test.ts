import { describe, expect, it } from "vitest";
import { createInitialComparisonWorkspace } from "./compare-model";
import { INITIAL_FORM_VALUES } from "./simulator-model";
import {
  createEmptyNamedWorkspaceCollection,
  createWorkspaceBackup,
  deleteNamedWorkspace,
  mergeWorkspaceBackup,
  parseNamedWorkspaceCollection,
  parseSavedWorkspace,
  parseWorkspaceBackup,
  serializeNamedWorkspaceCollection,
  serializeWorkspace,
  serializeWorkspaceBackup,
  upsertNamedWorkspace,
  type SavedWorkspaceV1,
} from "./workspace-storage";

const workspace: SavedWorkspaceV1 = {
  schemaVersion: 1,
  savedAt: "2026-07-15T00:00:00.000Z",
  activeMode: "compare",
  single: INITIAL_FORM_VALUES,
  comparison: createInitialComparisonWorkspace(),
};

describe("workspace storage schema", () => {
  it("単体・目標・比較の入力を1件の保存データとして往復する", () => {
    expect(parseSavedWorkspace(serializeWorkspace(workspace))).toEqual(workspace);
  });

  it("壊れたJSONと未対応スキーマを読み込まない", () => {
    expect(parseSavedWorkspace("{" )).toBeNull();
    expect(parseSavedWorkspace(JSON.stringify({ ...workspace, schemaVersion: 2 }))).toBeNull();
    expect(parseSavedWorkspace(JSON.stringify({ ...workspace, activeMode: "unknown" }))).toBeNull();
  });

  it("比較件数、ID、入力形状を検証する", () => {
    expect(parseSavedWorkspace(JSON.stringify({
      ...workspace,
      comparison: { ...workspace.comparison, assets: [workspace.comparison.assets[0]] },
    }))?.comparison.assets).toHaveLength(1);
    expect(parseSavedWorkspace(JSON.stringify({
      ...workspace,
      comparison: { ...workspace.comparison, assets: [] },
    }))).toBeNull();
    expect(parseSavedWorkspace(JSON.stringify({
      ...workspace,
      comparison: {
        ...workspace.comparison,
        assets: [workspace.comparison.assets[0], workspace.comparison.assets[0]],
      },
    }))).toBeNull();
    expect(parseSavedWorkspace(JSON.stringify({
      ...workspace,
      single: { ...workspace.single, currentPrice: 10_000 },
    }))).toBeNull();
  });
});

describe("named workspace collection", () => {
  it("複数の名前付き試算を更新日時の新しい順に保存して往復する", () => {
    const older = { ...workspace, savedAt: "2026-07-15T00:00:00.000Z" };
    const newer = {
      ...workspace,
      savedAt: "2026-07-16T00:00:00.000Z",
      single: { ...workspace.single, assetName: "増配ETF" },
    };
    const first = upsertNamedWorkspace(createEmptyNamedWorkspaceCollection(), " 高配当ETF ", older, "save-1");
    const second = upsertNamedWorkspace(first, "増配ETF", newer, "save-2");

    expect(second.items.map((item) => item.name)).toEqual(["増配ETF", "高配当ETF"]);
    expect(parseNamedWorkspaceCollection(serializeNamedWorkspaceCollection(second))).toEqual(second);
  });

  it("同じ保存名はIDを維持して上書きする", () => {
    const first = upsertNamedWorkspace(createEmptyNamedWorkspaceCollection(), "長期試算", workspace, "save-1");
    const updatedWorkspace = {
      ...workspace,
      savedAt: "2026-07-17T00:00:00.000Z",
      activeMode: "single" as const,
      single: { ...workspace.single, initialInvestmentJpy: "3000000" },
    };
    const second = upsertNamedWorkspace(first, "長期試算", updatedWorkspace, "unused-id");

    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).toBe("save-1");
    expect(second.items[0].workspace.single.initialInvestmentJpy).toBe("3000000");
  });

  it("保存名の必須・文字数とコレクションの重複を検証する", () => {
    expect(() => upsertNamedWorkspace(createEmptyNamedWorkspaceCollection(), "   ", workspace, "save-1"))
      .toThrow("1〜40文字");
    expect(() => upsertNamedWorkspace(createEmptyNamedWorkspaceCollection(), "a".repeat(41), workspace, "save-1"))
      .toThrow("1〜40文字");
    const duplicate = {
      schemaVersion: 1,
      items: [
        { id: "same", name: "試算A", workspace },
        { id: "same", name: "試算B", workspace },
      ],
    };
    expect(parseNamedWorkspaceCollection(JSON.stringify(duplicate))).toBeNull();
  });

  it("削除は対象の保存項目だけを一覧から除く", () => {
    const first = upsertNamedWorkspace(createEmptyNamedWorkspaceCollection(), "試算A", workspace, "save-1");
    const second = upsertNamedWorkspace(first, "試算B", workspace, "save-2");
    const deleted = deleteNamedWorkspace(second, "save-1");

    expect(deleted.items.map((item) => item.name)).toEqual(["試算B"]);
    expect(second.items).toHaveLength(2);
  });
});

describe("JSON workspace backup", () => {
  it("名前付き保存一覧だけをバージョン付きJSONとして往復する", () => {
    const collection = upsertNamedWorkspace(
      createEmptyNamedWorkspaceCollection(),
      "高配当ETF",
      workspace,
      "save-1",
    );
    const backup = createWorkspaceBackup(collection, "2026-07-17T01:00:00.000Z");
    const json = serializeWorkspaceBackup(backup);

    expect(json).toContain('"format": "distribution-dividend-simulator-backup"');
    expect(json).not.toContain('"summary"');
    expect(parseWorkspaceBackup(json)).toEqual(backup);
  });

  it("不正形式、未対応バージョン、不正入力を拒否する", () => {
    const valid = createWorkspaceBackup(
      upsertNamedWorkspace(createEmptyNamedWorkspaceCollection(), "試算A", workspace, "save-1"),
      "2026-07-17T01:00:00.000Z",
    );

    expect(parseWorkspaceBackup("{" )).toBeNull();
    expect(parseWorkspaceBackup(JSON.stringify({ ...valid, format: "unknown" }))).toBeNull();
    expect(parseWorkspaceBackup(JSON.stringify({ ...valid, schemaVersion: 2 }))).toBeNull();
    expect(parseWorkspaceBackup(JSON.stringify({
      ...valid,
      items: [{ ...valid.items[0], workspace: { ...workspace, activeMode: "unknown" } }],
    }))).toBeNull();
  });

  it("既存一覧へ追加し、同名は既存IDを維持して上書きする", () => {
    const existingWorkspace = { ...workspace, savedAt: "2026-07-15T00:00:00.000Z" };
    let collection = upsertNamedWorkspace(
      createEmptyNamedWorkspaceCollection(),
      "同名試算",
      existingWorkspace,
      "existing-id",
    );
    collection = upsertNamedWorkspace(collection, "既存試算", existingWorkspace, "shared-id");
    const importedWorkspace = {
      ...workspace,
      savedAt: "2026-07-17T00:00:00.000Z",
      single: { ...workspace.single, initialInvestmentJpy: "9000000" },
    };
    const backup = createWorkspaceBackup({
      schemaVersion: 1,
      items: [
        { id: "imported-id", name: "同名試算", workspace: importedWorkspace },
        { id: "shared-id", name: "新規試算", workspace: importedWorkspace },
      ],
    }, "2026-07-17T01:00:00.000Z");
    const merged = mergeWorkspaceBackup(collection, backup);

    expect(merged.items).toHaveLength(3);
    expect(merged.items.find((item) => item.name === "同名試算")?.id).toBe("existing-id");
    expect(merged.items.find((item) => item.name === "同名試算")?.workspace.single.initialInvestmentJpy)
      .toBe("9000000");
    expect(merged.items.find((item) => item.name === "新規試算")?.id).toBe("shared-id-2");
    expect(collection.items.find((item) => item.name === "同名試算")?.workspace.single.initialInvestmentJpy)
      .toBe(INITIAL_FORM_VALUES.initialInvestmentJpy);
  });
});
