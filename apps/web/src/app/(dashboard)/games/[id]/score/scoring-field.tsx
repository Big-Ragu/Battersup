'use client';

import {
  FIELD_POSITION_COORDS,
  SCORING_TO_POSITION,
} from '@batters-up/shared';
import { FIELD_POSITION_ABBREV } from '@batters-up/shared';

interface ScoringFieldProps {
  selectedZone: number | null;
  onZoneClick: (zone: number) => void;
}

export function ScoringField({ selectedZone, onZoneClick }: ScoringFieldProps) {
  // Map scoring numbers (1-9) to FIELD_POSITION_COORDS (keyed by abbreviation)
  const zones = Array.from({ length: 9 }, (_, i) => {
    const num = i + 1;
    const abbrev = SCORING_TO_POSITION[num]; // e.g. "P", "C", "1B"
    const coords = FIELD_POSITION_COORDS[abbrev];
    return {
      num,
      abbrev,
      label: FIELD_POSITION_ABBREV[num], // same as abbrev
      x: coords?.x ?? 0,
      y: coords?.y ?? 0,
    };
  });

  return (
    <svg
      viewBox="0 0 500 500"
      className="w-full max-w-[500px] mx-auto"
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

      {/* Instruction text */}
      <text
        x="250"
        y="475"
        textAnchor="middle"
        fill="#6b7280"
        fontSize="14"
        fontFamily="system-ui, sans-serif"
      >
        Tap a zone to record a play
      </text>

      {/* Clickable zone buttons */}
      {zones.map((zone) => {
        const isSelected = selectedZone === zone.num;
        const r = 28;

        return (
          <g
            key={zone.num}
            onClick={() => onZoneClick(zone.num)}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onZoneClick(zone.num);
              }
            }}
          >
            {/* Selected ring */}
            {isSelected && (
              <circle
                cx={zone.x}
                cy={zone.y}
                r={r + 4}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3"
                className="animate-pulse"
              />
            )}

            {/* Zone circle */}
            <circle
              cx={zone.x}
              cy={zone.y}
              r={r}
              fill={isSelected ? '#3b82f6' : 'rgba(255,255,255,0.85)'}
              stroke={isSelected ? '#2563eb' : 'rgba(0,0,0,0.2)'}
              strokeWidth={isSelected ? 2 : 1.5}
              className="transition-all duration-150"
            />

            {/* Hover overlay (slightly brighter on hover) */}
            <circle
              cx={zone.x}
              cy={zone.y}
              r={r}
              fill="transparent"
              className="hover:fill-blue-200/40 transition-all duration-150"
            />

            {/* Position abbreviation */}
            <text
              x={zone.x}
              y={zone.y - 4}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isSelected ? 'white' : '#1f2937'}
              fontSize="14"
              fontWeight="bold"
              fontFamily="system-ui, sans-serif"
              pointerEvents="none"
            >
              {zone.label}
            </text>

            {/* Scoring number */}
            <text
              x={zone.x}
              y={zone.y + 12}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isSelected ? 'rgba(255,255,255,0.8)' : '#6b7280'}
              fontSize="10"
              fontFamily="system-ui, sans-serif"
              pointerEvents="none"
            >
              {zone.num}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
