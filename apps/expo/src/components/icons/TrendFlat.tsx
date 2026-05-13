import React from "react";
import Svg, { Path } from "react-native-svg";

import { tokens } from "~/styles/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function TrendFlat({
  size = 24,
  color = tokens.color.ink,
  strokeWidth = 2.2,
}: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M5 14h16" />
      <Path d="M17 10l4 4-4 4" />
    </Svg>
  );
}
