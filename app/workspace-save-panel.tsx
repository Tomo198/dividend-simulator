"use client";

import { MAX_WORKSPACE_NAME_LENGTH, type NamedWorkspaceV1 } from "./workspace-storage";

interface WorkspaceSavePanelProps {
  name: string;
  items: NamedWorkspaceV1[];
  status: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onRestore: (item: NamedWorkspaceV1) => void;
  onDelete: (item: NamedWorkspaceV1) => void;
  onExport: () => void;
  onImport: (file: File) => void;
}

function modeLabel(item: NamedWorkspaceV1): string {
  if (item.workspace.activeMode === "single") return "将来試算";
  if (item.workspace.activeMode === "target") return "目標逆算";
  return `${item.workspace.comparison.assets.length}銘柄比較`;
}

function formatSavedAt(savedAt: string): string {
  const date = new Date(savedAt);
  return Number.isNaN(date.getTime()) ? "保存日時不明" : date.toLocaleString("ja-JP");
}

export function WorkspaceSavePanel({
  name,
  items,
  status,
  onNameChange,
  onSave,
  onRestore,
  onDelete,
  onExport,
  onImport,
}: WorkspaceSavePanelProps) {
  const normalizedName = name.trim();
  const canSave = normalizedName.length > 0 && normalizedName.length <= MAX_WORKSPACE_NAME_LENGTH;

  return (
    <section className="workspace-save-panel" aria-labelledby="workspace-save-title">
      <form
        className="workspace-save-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave();
        }}
      >
        <div className="workspace-save-copy">
          <strong id="workspace-save-title">試算を保存</strong>
          <span>この端末に保存します。同名は上書きされます。</span>
        </div>
        <label className="workspace-save-name">
          <span className="sr-only">保存名</span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.currentTarget.value)}
            placeholder="例：高配当ETF 20年"
            maxLength={MAX_WORKSPACE_NAME_LENGTH}
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={!canSave}>保存</button>
      </form>

      <div className="workspace-save-footer">
        <p role="status" aria-live="polite">{status}</p>
        <details className="saved-workspace-list">
          <summary>
            <span>保存済み</span>
            <strong>{items.length}件</strong>
          </summary>
          <div className="saved-workspace-body">
            <div className="workspace-backup-section">
              <div>
                <strong>バックアップ</strong>
                <span>JSONで保存・復元できます。</span>
              </div>
              <div className="workspace-backup-actions">
                <button type="button" onClick={onExport} disabled={items.length === 0}>書き出す</button>
                <label className="workspace-backup-import">
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) onImport(file);
                      event.currentTarget.value = "";
                    }}
                  />
                  <span>読み込む</span>
                </label>
              </div>
            </div>
            {items.length === 0 ? (
              <p className="saved-workspace-empty">保存した試算はありません。</p>
            ) : (
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{modeLabel(item)}・{formatSavedAt(item.workspace.savedAt)}</span>
                    </div>
                    <div className="saved-workspace-actions">
                      <button type="button" onClick={() => onRestore(item)}>開く</button>
                      <button type="button" className="saved-workspace-delete" onClick={() => onDelete(item)}>削除</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </div>
    </section>
  );
}
