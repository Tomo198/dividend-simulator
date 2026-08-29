"use client";

import { useEffect, useId, useState, type KeyboardEvent, type PointerEvent } from "react";

export interface ChartPoint {
  label: string;
  [key: string]: string | number;
}

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

interface LineChartProps {
  title: string;
  description: string;
  data: ChartPoint[];
  series: ChartSeries[];
  formatValue: (value: number) => string;
  formatDetailValue?: (value: number) => string;
}

interface ChartLayout {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  yTickCount: number;
}

export interface ChartRenderConfig extends ChartLayout {
  layoutName: "desktop" | "mobile";
  xAxisIndexes: number[];
}

const DESKTOP_LAYOUT: ChartLayout = {
  width: 760,
  height: 280,
  padding: { top: 18, right: 18, bottom: 38, left: 72 },
  yTickCount: 5,
};
const MOBILE_LAYOUT: ChartLayout = {
  width: 420,
  height: 300,
  padding: { top: 18, right: 14, bottom: 42, left: 66 },
  yTickCount: 4,
};
const MOBILE_CHART_QUERY = "(max-width: 640px)";

function getNiceMaximum(value: number): number {
  if (!(value > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const niceNormalized = [1, 2, 5, 10].find((candidate) => candidate >= normalized) ?? 10;
  return niceNormalized * magnitude;
}

function getXAxisIndexes(length: number): number[] {
  if (length <= 0) return [];
  if (length <= 6) return Array.from({ length }, (_, index) => index);

  const roughStep = length / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const candidates = [1, 2, 5, 10].map((candidate) => candidate * magnitude);
  const step = candidates.reduce((closest, candidate) => (
    Math.abs(candidate - roughStep) < Math.abs(closest - roughStep) ? candidate : closest
  ));
  const years = new Set([1]);
  for (let year = step; year < length; year += step) years.add(year);
  years.add(length);
  return [...years].sort((a, b) => a - b).map((year) => year - 1);
}

function getMobileXAxisIndexes(length: number): number[] {
  if (length <= 0) return [];
  if (length <= 4) return Array.from({ length }, (_, index) => index);
  const lastIndex = length - 1;
  return [0, Math.round(lastIndex / 3), Math.round(lastIndex * 2 / 3), lastIndex];
}

export function getChartRenderConfig(isMobile: boolean, dataLength: number): ChartRenderConfig {
  const layout = isMobile ? MOBILE_LAYOUT : DESKTOP_LAYOUT;
  return {
    ...layout,
    layoutName: isMobile ? "mobile" : "desktop",
    xAxisIndexes: isMobile ? getMobileXAxisIndexes(dataLength) : getXAxisIndexes(dataLength),
  };
}

function useMobileChartLayout(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_CHART_QUERY);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export function LineChart({
  title,
  description,
  data,
  series,
  formatValue,
  formatDetailValue = formatValue,
}: LineChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const isMobileLayout = useMobileChartLayout();
  const {
    width,
    height,
    padding,
    yTickCount,
    layoutName,
    xAxisIndexes,
  } = getChartRenderConfig(isMobileLayout, data.length);
  const values = data.flatMap((point) => series.map((item) => Number(point[item.key]) || 0));
  const maximum = getNiceMaximum(Math.max(...values, 1));
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + plotWidth * (data.length <= 1 ? 0 : index / (data.length - 1));
  const y = (value: number) => padding.top + plotHeight * (1 - value / maximum);
  const yAxisValues = Array.from(
    { length: yTickCount + 1 },
    (_, index) => maximum * (1 - index / yTickCount),
  );
  const selectedIndex = activeIndex === null || data.length === 0
    ? null
    : Math.min(activeIndex, data.length - 1);
  const selectedPoint = selectedIndex === null ? null : data[selectedIndex];

  const selectPoint = (event: PointerEvent<HTMLDivElement>) => {
    const svg = event.currentTarget.querySelector("svg");
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix || data.length === 0) return;
    const pointer = svg.createSVGPoint();
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    const localPoint = pointer.matrixTransform(matrix.inverse());
    const ratio = Math.min(1, Math.max(0, (localPoint.x - padding.left) / plotWidth));
    setActiveIndex(Math.round(ratio * (data.length - 1)));
    event.currentTarget.focus();
  };

  const moveSelection = (event: KeyboardEvent<HTMLDivElement>) => {
    if (data.length === 0) return;
    const current = selectedIndex ?? data.length - 1;
    let next = current;
    if (event.key === "ArrowLeft") next = Math.max(0, current - 1);
    else if (event.key === "ArrowRight") next = Math.min(data.length - 1, current + 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = data.length - 1;
    else return;
    event.preventDefault();
    setActiveIndex(next);
  };

  return (
    <figure
      className={`chart-card${isMobileLayout ? " chart-card-mobile" : ""}`}
      data-chart-layout={layoutName}
    >
      <figcaption>
        <div>
          <h3 id={titleId}>{title}</h3>
          <p id={descriptionId}>{description}</p>
        </div>
        <ul className="chart-legend" aria-label="系列">
          {series.map((item) => (
            <li key={item.key}>
              <span style={{ backgroundColor: item.color }} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
      </figcaption>
      <div
        className="chart-frame"
        tabIndex={0}
        aria-label={`${title}。タップまたはクリックして年ごとの数値を確認できます。`}
        onPointerDown={selectPoint}
        onKeyDown={moveSelection}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {yAxisValues.map((value) => (
            <g key={value}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y(value)}
                y2={y(value)}
                className="chart-grid-line"
              />
              <text
                x={padding.left - 9}
                y={y(value) + 4}
                textAnchor="end"
                className="chart-axis-label"
              >
                {formatValue(value)}
              </text>
            </g>
          ))}
          {xAxisIndexes.map((index) => (
            <g key={index}>
              <line
                x1={x(index)}
                x2={x(index)}
                y1={padding.top}
                y2={height - padding.bottom}
                className="chart-grid-line chart-grid-line-vertical"
              />
              <text
                x={x(index)}
                y={height - 10}
                textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
                className="chart-axis-label"
              >
                {data[index]?.label}
              </text>
            </g>
          ))}
          {series.map((item) => {
            const points = data
              .map((point, index) => `${x(index)},${y(Number(point[item.key]) || 0)}`)
              .join(" ");
            return (
              <polyline
                key={item.key}
                points={points}
                fill="none"
                stroke={item.color}
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {selectedIndex !== null && selectedPoint && (
            <g className="chart-selection" aria-hidden="true">
              <line
                x1={x(selectedIndex)}
                x2={x(selectedIndex)}
                y1={padding.top}
                y2={height - padding.bottom}
                className="chart-selection-line"
              />
              {series.map((item) => (
                <circle
                  key={item.key}
                  cx={x(selectedIndex)}
                  cy={y(Number(selectedPoint[item.key]) || 0)}
                  r={isMobileLayout ? 7 : 5}
                  fill={item.color}
                  className="chart-selection-dot"
                />
              ))}
            </g>
          )}
        </svg>
      </div>
      <p className="chart-interaction-hint">グラフをタップ・クリックして各年の数値を確認できます。キーボードは左右キーで移動できます。</p>
      {selectedPoint && (
        <div className="chart-point-detail" role="status" aria-live="polite">
          <strong>{selectedPoint.label}</strong>
          <dl>
            {series.map((item) => (
              <div key={item.key}>
                <dt><span style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}</dt>
                <dd>{formatDetailValue(Number(selectedPoint[item.key]) || 0)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <p className="sr-only">
        最終年：{series.map((item) => `${item.label} ${formatValue(Number(data.at(-1)?.[item.key]) || 0)}`).join("、")}。
      </p>
    </figure>
  );
}
