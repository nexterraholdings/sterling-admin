import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ring-1 ring-inset transition disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30 hover:bg-emerald-500/25",
        destructive: "bg-rose-500/10 text-rose-300 ring-rose-500/30 hover:bg-rose-500/20",
        outline: "border border-zinc-700 bg-zinc-900 text-zinc-300 ring-0 hover:bg-zinc-800",
        secondary: "bg-secondary text-secondary-foreground ring-zinc-700 hover:bg-zinc-700",
        ghost: "ring-0 text-zinc-300 hover:bg-zinc-800",
        link: "ring-0 text-emerald-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-full px-3 text-xs",
        lg: "h-10 rounded-full px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
