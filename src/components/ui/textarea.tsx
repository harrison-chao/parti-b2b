import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded-xl border border-input bg-white/75 px-3 py-2 text-sm shadow-sm transition-all placeholder:text-muted-foreground focus-visible:border-primary/40 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";
