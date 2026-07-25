import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createInitialComparisonWorkspace } from "@/app/compare-model";
import { INITIAL_FORM_VALUES } from "@/app/simulator-model";
import { WorkspaceSavePanel } from "@/app/workspace-save-panel";
import type { NamedWorkspaceV1 } from "@/app/workspace-storage";

const savedItem: NamedWorkspaceV1 = {
  id: "save-1",
  name: "高配当ETF・20年",
  workspace: {
    schemaVersion: 1,
    savedAt: "2026-07-17T00:00:00.000Z",
    activeMode: "compare",
    single: INITIAL_FORM_VALUES,
    comparison: createInitialComparisonWorkspace(),
  },
};

describe("WorkspaceSavePanel", () => {
  it("保存名入力と空の保存一覧を表示する", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSavePanel
        name=""
        items={[]}
        status="まだ名前付き保存はありません"
        onNameChange={() => {}}
        onSave={() => {}}
        onRestore={() => {}}
        onDelete={() => {}}
        onExport={() => {}}
        onImport={() => {}}
      />,
    );

    expect(html).toContain("試算を保存");
    expect(html).toContain("同名は上書きされます");
    expect(html).toContain("保存済み");
    expect(html).toContain("バックアップ");
    expect(html).toContain("書き出す");
    expect(html).toContain("読み込む");
    expect(html).toContain('accept=".json,application/json"');
    expect(html).toContain("0件");
    expect(html).toContain("disabled");
  });

  it("保存項目の名前・モード・復元・削除を表示する", () => {
    const html = renderToStaticMarkup(
      <WorkspaceSavePanel
        name="高配当ETF・20年"
        items={[savedItem]}
        status="保存しました"
        onNameChange={() => {}}
        onSave={() => {}}
        onRestore={() => {}}
        onDelete={() => {}}
        onExport={() => {}}
        onImport={() => {}}
      />,
    );

    expect(html).toContain("高配当ETF・20年");
    expect(html).toContain("2銘柄比較");
    expect(html).toContain("開く");
    expect(html).toContain("削除");
    expect(html).toContain("書き出す");
    expect(html).toContain("読み込む");
    expect(html).not.toContain("disabled");
  });
});
