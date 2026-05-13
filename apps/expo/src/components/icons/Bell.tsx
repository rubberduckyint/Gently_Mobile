import React from "react";
import Svg, { Path } from "react-native-svg";

import { tokens } from "~/styles/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Bell({
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
      <Path d="M6 16h12l-1.4-2V11a4.6 4.6 0 0 0-9.2 0v3L6 16z" />
      <Path d="M10.5 19a1.6 1.6 0 0 0 3 0" />
    </Svg>
  );
}
