import { useId } from 'react';

interface SparklineBoxProps {
  values: number[];
}

export function SparklineBox({ values }: SparklineBoxProps) {
  const gradId = useId();
  if (values.length < 2) {
    return null;
  }

  const width = 180;
  const height = 34;
  const pad = 2;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal || 1;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = height - pad - ((v - minVal) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polyline = points.join(' ');
  const area = `${pad},${height - pad} ${polyline} ${width - pad},${height - pad}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: '30px', display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8f73ff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#8f73ff" stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradId})`} />
      <polyline
        fill="none"
        stroke="#8f73ff"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={polyline}
      />
    </svg>
  );
}
