import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Accessible form error. Uses SelectableText-style semantics: the message is
 * selectable and announced to screen readers via role="alert".
 */
export function FormError({
  message,
  className,
}: {
  message: string | null | undefined;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p role="alert" className={cn("select-text text-sm font-medium text-red-400", className)}>
      {message}
    </p>
  );
}
