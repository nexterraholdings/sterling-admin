import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-zinc-800 text-zinc-300 ring-zinc-700",
        emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/25",
        amber: "bg-amber-500/15 text-amber-300 ring-amber-500/25",
        rose: "bg-rose-500/15 text-rose-300 ring-rose-500/25",
        violet: "bg-violet-500/15 text-violet-300 ring-violet-500/25",
        blue: "bg-blue-500/15 text-blue-300 ring-blue-500/25",
        outline: "text-zinc-300 ring-zinc-700",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
