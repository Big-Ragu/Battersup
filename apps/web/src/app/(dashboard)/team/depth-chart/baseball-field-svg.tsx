'use client';

import { FIELD_POSITION_COORDS } from '@batters-up/shared';

interface BaseballFieldSVGProps {
  children?: React.ReactNode;
}

export function BaseballFieldSVG({ children }: BaseballFieldSVGProps) {
  return (
    <svg
      viewBox="0 0 500 500"
      className="w-full max-w-[600px]"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Outfield grass */}
      <path
        d="M 250 460 L 10 200 Q 10 10 250 10 Q 490 10 490 200 Z"
        fill="#4ade80"
        stroke="#22c55e"
        strokeWidth="2"
      />

      {/* Infield dirt */}
      <path
        d="M 250 420 L 120 290 L 250 200 L 380 290 Z"
        fill="#d4a574"
        stroke="#b8956a"
        strokeWidth="1.5"
      />

      {/* Base paths */}
      <line x1="250" y1="400" x2="370" y2="290" stroke="white" strokeWidth="2" />
      <line x1="370" y1="290" x2="250" y2="200" stroke="white" strokeWidth="2" />
      <line x1="250" y1="200" x2="130" y2="290" stroke="white" strokeWidth="2" />
      <line x1="130" y1="290" x2="250" y2="400" stroke="white" strokeWidth="2" />

      {/* Home plate */}
      <polygon
        points="250,405 243,400 243,395 257,395 257,400"
        fill="white"
        stroke="#666"
        strokeWidth="0.5"
      />

      {/* First base */}
      <rect x="364" y="284" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 370 290)" />

      {/* Second base */}
      <rect x="244" y="194" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 250 200)" />

      {/* Third base */}
      <rect x="124" y="284" width="12" height="12" fill="white" stroke="#666" strokeWidth="0.5" transform="rotate(45 130 290)" />

      {/* Pitcher's mound */}
      <circle cx="250" cy="305" r="8" fill="#d4a574" stroke="#b8956a" strokeWidth="1" />
      <rect x="246" y="303" width="8" height="2" fill="white" />

      {/* Foul lines extended */}
      <line x1="250" y1="405" x2="10" y2="200" stroke="white" strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="250" y1="405" x2="490" y2="200" stroke="white" strokeWidth="1.5" strokeDasharray="4 4" />

      {/* Position markers (circles behind the drop zones) */}
      {Object.entries(FIELD_POSITION_COORDS).map(([pos, coords]) => (
        <circle
          key={pos}
          cx={coords.x}
          cy={coords.y}
          r="30"
          fill="rgba(255,255,255,0.15)"
          stroke="rgba(255,255,255,0.3)"
          strokeWidth="1"
        />
      ))}

      {/* foreignObject overlays for React drop zones */}
      {children}
    </svg>
  );
}
