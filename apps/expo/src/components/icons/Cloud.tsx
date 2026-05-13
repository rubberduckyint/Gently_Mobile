import React from "react";
import Svg, { Path } from "react-native-svg";

import { tokens } from "~/styles/tokens";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Cloud({
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
      <Path d="M7 17h10a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.7-1A3.8 3.8 0 0 0 7 17z" />
    </Svg>
  );
}
