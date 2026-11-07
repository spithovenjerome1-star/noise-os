"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type FormCtx = { errors: Record<string, string>; pending: boolean };
const Ctx = React.createContext<FormCtx>({ errors: {}, pending: false });
export const useFormCtx = () => React.useContext(Ctx);

/** Field-level error for a named input inside an ActionForm. */
export function useFieldError(name: string) {
  return useFormCtx().errors[name];
}

/**
 * Form bound to a server action returning ActionResult.
 * Shows toasts, surfaces field errors, refreshes server data on success.
 */
export function ActionForm<T>({
  action,
  children,
  onSuccess,
  successMessage,
  className,
  resetOnSuccess,
  refresh = true,
}: {
  action: (fd: FormData) => Promise<ActionResult<T>>;
  children: React.ReactNode;
  onSuccess?: (data: T | undefined) => void;
  successMessage?: string | false;
  className?: string;
  resetOnSuccess?: boolean;
  refresh?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const ref = React.useRef<HTMLFormElement>(null);

  return (
    <Ctx.Provider value={{ errors, pending }}>
      <form
        ref={ref}
        className={className}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const r = await action(fd);
            if (r.ok) {
              setErrors({});
              if (successMessage !== false) toast.success(r.message ?? successMessage ?? "Saved");
              if (resetOnSuccess) ref.current?.reset();
              if (refresh) router.refresh();
              onSuccess?.(r.data);
            } else {
              setErrors(r.fieldErrors ?? {});
              toast.error(r.error);
            }
          });
        }}
      >
        {children}
      </form>
    </Ctx.Provider>
  );
}

export function SubmitButton({ children = "Save", ...props }: ButtonProps) {
  const { pending } = useFormCtx();
  return (
    <Button type="submit" variant="primary" loading={pending} {...props}>
      {children}
    </Button>
  );
}

/** A dialog containing an ActionForm. Closes on success. */
export function FormDialog<T>({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel = "Save",
  wide,
  open: controlledOpen,
  onOpenChange,
  onSuccess,
  successMessage,
  danger,
}: {
  trigger?: React.ReactNode;
  title: string;
  description?: string;
  action: (fd: FormData) => Promise<ActionResult<T>>;
  children: React.ReactNode;
  submitLabel?: string;
  wide?: boolean;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  onSuccess?: (data: T | undefined) => void;
  successMessage?: string;
  danger?: React.ReactNode;
}) {
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = controlledOpen ?? innerOpen;
  const setOpen = onOpenChange ?? setInnerOpen;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent title={title} description={description} wide={wide}>
        <ActionForm
          action={action}
          successMessage={successMessage}
          onSuccess={(d) => {
            setOpen(false);
            onSuccess?.(d);
          }}
        >
          <div className="flex flex-col gap-4">{children}</div>
          <DialogFooter className={danger ? "justify-between" : undefined}>
            {danger}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <SubmitButton>{submitLabel}</SubmitButton>
            </div>
          </DialogFooter>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}

/** Run a server action from a button (with optional confirmation). */
export function ActionButton<T>({
  action,
  confirm,
  children,
  successMessage,
  onSuccess,
  ...props
}: Omit<ButtonProps, "onClick" | "action"> & {
  action: () => Promise<ActionResult<T>>;
  confirm?: string;
  successMessage?: string | false;
  onSuccess?: (d: T | undefined) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <Button
      type="button"
      loading={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (r.ok) {
            if (successMessage !== false) toast.success(r.message ?? successMessage ?? "Done");
            router.refresh();
            onSuccess?.(r.data);
          } else toast.error(r.error);
        });
      }}
      {...props}
    >
      {children}
    </Button>
  );
}
