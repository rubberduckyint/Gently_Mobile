import React from "react";
import Svg, { Path } from "react-native-svg";

import { tokens } from "~/styles/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Check({
  size = 24,
  color = tokens.color.ink,
  strokeWidth = 2.4,
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
      <Path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  );
}
