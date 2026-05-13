// Info not in variants.jsx — standard circle-i analog (hairline, matches design weight)
import React from "react";
import Svg, { Circle, Line } from "react-native-svg";

import { tokens } from "~/styles/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Info({
  size = 24,
  color = tokens.color.ink,
  strokeWidth = 1.6,
}: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="12" cy="12" r="9" />
      <Line x1="12" y1="11" x2="12" y2="17" />
      <Line x1="12" y1="7.5" x2="12.01" y2="7.5" strokeWidth={2.4} />
    </Svg>
  );
}
