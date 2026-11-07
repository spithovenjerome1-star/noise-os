import { Link2Off } from "lucide-react";

export function InactiveLink({ businessName, email }: { businessName: string; email?: string | null }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-20 text-center animate-in">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
        <Link2Off className="size-5 text-muted" />
      </div>
      <h1 className="text-lg font-semibold tracking-tight">This link is no longer active</h1>
      <p className="mt-2 text-[13px] text-muted">
        It may have expired or been replaced. Please ask {businessName} for a new link{email ? <> at <a className="underline" href={`mailto:${email}`}>{email}</a></> : ""}.
      </p>
    </div>
  );
}
