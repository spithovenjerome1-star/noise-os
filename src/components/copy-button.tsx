"use client";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

export function CopyButton({ text, label = "Copy", toastMessage = "Copied to clipboard", ...props }: { text: string | (() => string); label?: string; toastMessage?: string } & Omit<ButtonProps, "onClick">) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
          setDone(true);
          toast.success(toastMessage);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Couldn't access the clipboard");
        }
      }}
      {...props}
    >
      {done ? <Check /> : <Copy />}
      {label}
    </Button>
  );
}
