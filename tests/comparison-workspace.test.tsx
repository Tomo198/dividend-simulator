import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createComparisonAsset, createInitialComparisonWorkspace } from "@/app/compare-model";
import { ComparisonWorkspace } from "@/app/comparison-workspace";

describe("ComparisonWorkspace", () => {
  it("2銘柄の共通条件、全比較指標、2グラフ、条件別ハイライトを表示する", () => {
    const html = renderToStaticMarkup(
      <ComparisonWorkspace value={createInitialComparisonWorkspace()} onChange={() => {}} onOpenSingle={() => {}} />,
    );

    expect(html).toContain("2銘柄を比較");
    expect(html).toContain("投資額をそろえる");
    expect(html).toContain("目標配当をそろえる");
    expect(html).toContain("10年目の手取り配当");
    expect(html).toContain("累計受取配当");
    expect(html).toContain("年率収益（入出金込み）");
    expect(html).toContain("1口価値維持率");
    expect(html).toContain("期限内に必要な毎月積立");
    expect(html).toContain("年間手取り配当");
    expect(html).toContain("受取配当込み資産");
    expect(html).toContain("4つの条件で比較");
    expect(html).toContain("総合順位や購入推奨ではなく");
  });

  it("1銘柄だけでも詳しく試算し、比較順位を表示しない", () => {
    const workspace = createInitialComparisonWorkspace();
    workspace.assets = [workspace.assets[0]];
    const html = renderToStaticMarkup(
      <ComparisonWorkspace value={workspace} onChange={() => {}} onOpenSingle={() => {}} />,
    );

    expect(html).toContain("1銘柄を確認");
    expect(html).toContain("1銘柄モード");
    expect(html).toContain("詳しく見る");
    expect(html).toContain("配当・資産・目標");
    expect(html).toContain("配当と資産の推移");
    expect(html).not.toContain("比較ポイント");
    expect(html).not.toContain("4つの条件で比較");
    expect(html).not.toContain("主な違い");
  });

  it("最大3銘柄を同じ表に表示する", () => {
    const workspace = createInitialComparisonWorkspace();
    workspace.assets.push(createComparisonAsset(2));
    const html = renderToStaticMarkup(
      <ComparisonWorkspace value={workspace} onChange={() => {}} onOpenSingle={() => {}} />,
    );

    expect(html).toContain("サンプルETF");
    expect(html).toContain("配当成長サンプル");
    expect(html).toContain("高配当サンプル");
    expect(html).not.toContain("＋ 銘柄を追加");
  });
});
