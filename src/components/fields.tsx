"use client";
// Inputs that automatically show their server-side validation error inside an ActionForm.
import * as React from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { useFieldError } from "./form";
import { cn } from "@/lib/utils";

type Common = { name: string; label?: React.ReactNode; hint?: React.ReactNode; className?: string };

export function TextField({ name, label, hint, className, ...props }: Common & React.InputHTMLAttributes<HTMLInputElement>) {
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id}>
      <Input id={id} name={name} aria-invalid={Boolean(error)} {...props} />
    </Field>
  );
}

export function MoneyField({ name, label = "Amount", hint, className, defaultValue, ...props }: Common & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue"> & { defaultValue?: string | number | null }) {
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id}>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-subtle">€</span>
        <Input id={id} name={name} inputMode="decimal" className="tabular pl-6" placeholder="0.00" aria-invalid={Boolean(error)} defaultValue={defaultValue ?? ""} {...props} />
      </div>
    </Field>
  );
}

export function TextAreaField({ name, label, hint, className, ...props }: Common & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id}>
      <Textarea id={id} name={name} aria-invalid={Boolean(error)} {...props} />
    </Field>
  );
}

export function SelectField({
  name,
  label,
  hint,
  className,
  options,
  placeholder,
  ...props
}: Common & React.SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const error = useFieldError(name);
  const id = `f-${name}`;
  return (
    <Field label={label} error={error} hint={hint} className={className} htmlFor={id}>
      <Select id={id} name={name} aria-invalid={Boolean(error)} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

export function CheckboxField({ name, label, hint, className, defaultChecked }: Common & { defaultChecked?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-[13px]", className)}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-border accent-[var(--fg)]" />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Row({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  return <div className={cn("grid grid-cols-1 gap-3", cols === 2 && "sm:grid-cols-2", cols === 3 && "sm:grid-cols-3", cols === 4 && "sm:grid-cols-2 md:grid-cols-4")}>{children}</div>;
}
