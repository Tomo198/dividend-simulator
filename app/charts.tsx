"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

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

const WIDTH = 760;
const HEIGHT = 280;
const PADDING = { top: 18, right: 18, bottom: 38, left: 72 };
const Y_TICK_COUNT = 5;

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
  const values = data.flatMap((point) => series.map((item) => Number(point[item.key]) || 0));
  const maximum = getNiceMaximum(Math.max(...values, 1));
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + plotWidth * (data.length <= 1 ? 0 : index / (data.length - 1));
  const y = (value: number) => PADDING.top + plotHeight * (1 - value / maximum);
  const xAxisIndexes = getXAxisIndexes(data.length);
  const yAxisValues = Array.from(
    { length: Y_TICK_COUNT + 1 },
    (_, index) => maximum * (1 - index / Y_TICK_COUNT),
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
    const ratio = Math.min(1, Math.max(0, (localPoint.x - PADDING.left) / plotWidth));
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
    <figure className="chart-card">
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
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {yAxisValues.map((value) => (
            <g key={value}>
              <line
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y(value)}
                y2={y(value)}
                className="chart-grid-line"
              />
              <text
                x={PADDING.left - 9}
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
                y1={PADDING.top}
                y2={HEIGHT - PADDING.bottom}
                className="chart-grid-line chart-grid-line-vertical"
              />
              <text
                x={x(index)}
                y={HEIGHT - 10}
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
                y1={PADDING.top}
                y2={HEIGHT - PADDING.bottom}
                className="chart-selection-line"
              />
              {series.map((item) => (
                <circle
                  key={item.key}
                  cx={x(selectedIndex)}
                  cy={y(Number(selectedPoint[item.key]) || 0)}
                  r="5"
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
