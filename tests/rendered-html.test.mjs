import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the phase 5D simulator workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ja">/i);
  assert.match(html, /<title>分配金・配当シミュレーター<\/title>/i);
  assert.match(html, /配当・分配シミュレーション/);
  assert.match(html, /条件を入力/);
  assert.match(html, /銘柄情報/);
  assert.match(html, /投資条件/);
  assert.match(html, /将来の想定/);
  assert.match(html, /口座・税/);
  assert.match(html, /入力した条件で結果を見る/);
  assert.match(html, /1年目の手取り配当/);
  assert.match(html, /配当と資産の推移/);
  assert.match(html, /年間手取り配当/);
  assert.match(html, /資産の推移/);
  assert.match(html, /配当の受取と再投資/);
  assert.match(html, /年次データ/);
  assert.ok(
    html.indexOf("配当と資産の推移") < html.indexOf("累計投資への配当利回り"),
    "単一銘柄のグラフは補助指標より先に表示する",
  );
  assert.match(html, /目標を逆算/);
  assert.match(html, /将来を試算/);
  assert.match(html, /銘柄を比較/);
  assert.match(html, /試算を保存/);
  assert.match(html, /保存済み/);
  assert.match(html, /端末保存/);
  assert.match(html, /書き出す/);
  assert.match(html, /読み込む/);
  assert.match(html, /課税口座（外国税控除あり）/);
  assert.match(html, /現在価格/);
  assert.match(html, /配当の年間変化/);
  assert.match(html, /価格の年間変化/);
  assert.match(html, /value="1000000"/);
  assert.doesNotMatch(html, />商品種別</);
  assert.doesNotMatch(html, />通貨</);
  assert.doesNotMatch(html, /USD（米ドル）|現在為替|為替スプレッド/);
  assert.doesNotMatch(html, />開始日<|減配イベントを追加|購入手数料を設定する|端数株を購入する|期末に売却する/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps the specification and project boundaries in the repository", async () => {
  const [spec, agents, page, simulator, comparison, savePanel, targetResults, layout, packageJson] = await Promise.all([
    readFile(new URL("../docs/product-spec.md", import.meta.url), "utf8"),
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/simulator.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/comparison-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/workspace-save-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/target-results.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(spec, /^# 分配金・配当シミュレーター 詳細設計書/m);
  assert.match(spec, /LIFECompassとは別の独立Webアプリ/);
  assert.match(agents, /計算ロジックはUIから分離/);
  assert.match(packageJson, /"name": "distribution-dividend-simulator"/);
  assert.match(packageJson, /"typecheck": "tsc --noEmit"/);
  assert.match(page, /DividendSimulator/);
  assert.match(simulator, /目標配当/);
  assert.match(simulator, /プラン 3/);
  assert.match(comparison, /年間手取り配当/);
  assert.match(comparison, /総合順位や購入推奨ではなく/);
  assert.match(savePanel, /試算を保存/);
  assert.match(savePanel, /onRestore/);
  assert.match(savePanel, /onDelete/);
  assert.match(savePanel, /onExport/);
  assert.match(savePanel, /onImport/);
  assert.match(targetResults, /今、必要な投資額/);
  assert.match(targetResults, /期間内に届かない/);
  assert.match(layout, /lang="ja"/);

  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
  await assert.rejects(access(new URL("../drizzle.config.ts", import.meta.url)));
  assert.doesNotMatch(packageJson, /drizzle|react-loading-skeleton|tailwind/i);
});
