"use client";

import { useId } from "react";

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
}

const WIDTH = 760;
const HEIGHT = 280;
const PADDING = { top: 24, right: 18, bottom: 34, left: 18 };

export function LineChart({ title, description, data, series, formatValue }: LineChartProps) {
  const titleId = useId();
  const descriptionId = useId();
  const values = data.flatMap((point) => series.map((item) => Number(point[item.key]) || 0));
  const maximum = Math.max(...values, 1);
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + plotWidth * (data.length <= 1 ? 0 : index / (data.length - 1));
  const y = (value: number) => PADDING.top + plotHeight * (1 - value / maximum);

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
      <div className="chart-frame">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
            <line
              key={ratio}
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={PADDING.top + plotHeight * ratio}
              y2={PADDING.top + plotHeight * ratio}
              className="chart-grid-line"
            />
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
          <text x={PADDING.left} y={15} className="chart-axis-label">{formatValue(maximum)}</text>
          <text x={PADDING.left} y={HEIGHT - 8} className="chart-axis-label">{data[0]?.label}</text>
          <text x={WIDTH - PADDING.right} y={HEIGHT - 8} textAnchor="end" className="chart-axis-label">
            {data.at(-1)?.label}
          </text>
        </svg>
      </div>
      <p className="sr-only">
        最終年：{series.map((item) => `${item.label} ${formatValue(Number(data.at(-1)?.[item.key]) || 0)}`).join("、")}。
      </p>
    </figure>
  );
}
