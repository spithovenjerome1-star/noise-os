"use client";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const items = [
    { k: "light", icon: Sun, label: "Light" },
    { k: "dark", icon: Moon, label: "Dark" },
    { k: "system", icon: Monitor, label: "System" },
  ];
  return (
    <div className="inline-flex rounded-md border border-border bg-surface-2 p-0.5" role="radiogroup" aria-label="Theme">
      {items.map(({ k, icon: Icon, label }) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={mounted && theme === k}
          aria-label={label}
          onClick={() => setTheme(k)}
          className={cn("flex size-6 items-center justify-center rounded text-subtle transition-colors hover:text-fg", mounted && theme === k && "bg-surface text-fg shadow-card")}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
