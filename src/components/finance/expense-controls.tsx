"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExpenseDialog, RecurringDialog, type ExpenseData, type RecurringData, type VatOpt } from "./expense-dialog";

type Opt = { value: string; label: string };
type Common = { clients: Opt[]; projects: Opt[]; vatRates: VatOpt[]; defaultVatBp: number; today: string };

/** Opens the expense dialog from the URL (?new=1 or ?expense=<id>). */
export function ExpenseUrlDialog({ expense, openNew, ...common }: Common & { expense?: ExpenseData; openNew: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const open = openNew || Boolean(expense);
  const close = () => {
    const next = new URLSearchParams(sp.toString());
    next.delete("new");
    next.delete("expense");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  if (!open) return null;
  return <ExpenseDialog key={expense?.id ?? "new"} expense={expense} open onOpenChange={(o) => !o && close()} {...common} />;
}

export function NewExpenseButton() {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  return (
    <Button
      variant="primary"
      onClick={() => {
        const next = new URLSearchParams(sp.toString());
        next.set("new", "1");
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}
    >
      <Plus /> Add expense
    </Button>
  );
}

export function EditExpenseLink({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const next = new URLSearchParams(sp.toString());
        next.set("expense", id);
        router.replace(`${pathname}?${next}`, { scroll: false });
      }}
    >
      {children}
    </button>
  );
}

export function NewRecurringButton({ vatRates, today }: { vatRates: VatOpt[]; today: string }) {
  return (
    <RecurringDialog
      vatRates={vatRates}
      today={today}
      trigger={
        <Button variant="primary">
          <Repeat /> New recurring expense
        </Button>
      }
    />
  );
}

export function EditRecurringButton({ item, vatRates, today }: { item: RecurringData; vatRates: VatOpt[]; today: string }) {
  return (
    <RecurringDialog
      item={item}
      vatRates={vatRates}
      today={today}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label="Edit recurring expense">
          <Pencil />
        </Button>
      }
    />
  );
}
