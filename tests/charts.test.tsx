import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getChartRenderConfig, LineChart, type ChartPoint } from "@/app/charts";

describe("LineChart", () => {
  it("X軸・Y軸の中間目盛りと途中年を選ぶ操作案内を表示する", () => {
    const data: ChartPoint[] = Array.from({ length: 20 }, (_, index) => ({
      label: `${index + 1}年`,
      dividend: (index + 1) * 10_000,
    }));
    const html = renderToStaticMarkup(
      <LineChart
        title="年間手取り配当"
        description="各年の税引後配当"
        data={data}
        series={[{ key: "dividend", label: "手取り配当", color: "#0b7a55" }]}
        formatValue={(value) => `${Math.round(value / 10_000)}万円`}
      />,
    );

    expect(html).toContain("1年");
    expect(html).toContain("5年");
    expect(html).toContain("10年");
    expect(html).toContain("15年");
    expect(html).toContain("20年");
    expect(html.match(/chart-axis-label/g)?.length).toBeGreaterThanOrEqual(11);
    expect(html).toContain("タップまたはクリックして年ごとの数値を確認できます");
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('data-chart-layout="desktop"');
    expect(html).toContain('viewBox="0 0 760 280"');
  });

  it("PCとスマートフォンで描画比率と目盛り密度を切り替える", () => {
    const desktop = getChartRenderConfig(false, 20);
    const mobile = getChartRenderConfig(true, 20);

    expect(desktop).toMatchObject({
      layoutName: "desktop",
      width: 760,
      height: 280,
      yTickCount: 5,
    });
    expect(desktop.xAxisIndexes).toEqual([0, 4, 9, 14, 19]);

    expect(mobile).toMatchObject({
      layoutName: "mobile",
      width: 420,
      height: 300,
      yTickCount: 4,
    });
    expect(mobile.xAxisIndexes).toEqual([0, 6, 13, 19]);
  });
});
