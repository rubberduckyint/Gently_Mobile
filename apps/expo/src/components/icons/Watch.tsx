import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { tokens } from "~/styles/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Watch({
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
      <Rect x="7" y="6" width="10" height="12" rx="2.4" />
      <Path d="M9 6V3.5h6V6M9 18v2.5h6V18" />
      <Circle cx="12" cy="12" r="1.2" fill={color} stroke="none" />
    </Svg>
  );
}
