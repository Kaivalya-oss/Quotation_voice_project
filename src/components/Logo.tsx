import { Link } from "@tanstack/react-router";
import { AudioLines } from "lucide-react";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
        <AudioLines className="size-5" />
      </span>
      {!compact && (
        <span className="font-display text-lg font-semibold tracking-tight">
          Voice<span className="text-primary">Quote</span> AI
        </span>
      )}
    </Link>
  );
}
