"use client"

import * as React from "react"
import * as SeparatorPrimitive from "@radix-ui/react-separator"

import { cn } from "~/lib/utils"

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px",
        className
      )}
      {...props}
    />
  )
}

interface SeparatorWithLabelProps extends React.ComponentProps<typeof Separator> {
  label?: string;
}

export function SeparatorWithLabel({ label, className, ...props }: SeparatorWithLabelProps) {
  return (
    <div className={cn("relative flex items-center", className)}>
      <Separator {...props} className="flex-1" />
      {label && (
        <span className="mx-4 text-xs text-muted-foreground whitespace-nowrap">
          {label}
        </span>
      )}
      <Separator {...props} className="flex-1" />
    </div>
  );
}

export { Separator }
