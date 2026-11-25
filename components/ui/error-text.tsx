// An error message: crimson, with an alert icon so it isn't told by colour
// alone, announced when it appears (role="alert").

import type { ReactNode } from "react";
import { AlertIcon } from "@/components/icons";

export function ErrorText({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} role="alert" className={`flex items-start gap-2 text-sm font-medium text-danger ${className}`}>
      <AlertIcon size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
