import {
  LayoutDashboard, Bell, Users, Clapperboard, Package, FileText, CheckSquare, CalendarDays, Receipt, Wallet, BarChart3, CalendarCheck, Store, Library, Camera, Upload, Settings,
} from "lucide-react";
import type { Capability } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; cap?: Capability; shortcut?: string };

export const NAV: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { href: "/", label: "Today", icon: LayoutDashboard, shortcut: "G D" },
      { href: "/notifications", label: "Inbox", icon: Bell, shortcut: "G I" },
    ],
  },
  {
    title: "Work",
    items: [
      { href: "/clients", label: "Clients", icon: Users, shortcut: "G C" },
      { href: "/videos", label: "Production", icon: Clapperboard, shortcut: "G V" },
      { href: "/packages", label: "Packages", icon: Package, shortcut: "G P" },
      { href: "/scripts", label: "Scripts", icon: FileText, shortcut: "G S" },
      { href: "/tasks", label: "Tasks", icon: CheckSquare, shortcut: "G T" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, shortcut: "G K" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/invoices", label: "Invoices", icon: Receipt, cap: "finance:view", shortcut: "G N" },
      { href: "/expenses", label: "Expenses", icon: Wallet, cap: "finance:view", shortcut: "G E" },
      { href: "/analytics", label: "Analytics", icon: BarChart3, cap: "analytics:view", shortcut: "G A" },
    ],
  },
  {
    title: "Studio",
    items: [
      { href: "/bookings", label: "Bookings", icon: CalendarCheck, shortcut: "G B" },
      { href: "/services", label: "Services & site", icon: Store, cap: "settings:manage" },
      { href: "/library", label: "Creative library", icon: Library },
      { href: "/equipment", label: "Equipment", icon: Camera },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/import", label: "Import", icon: Upload, cap: "data:import" },
      { href: "/settings", label: "Settings", icon: Settings, cap: "settings:manage" },
    ],
  },
];

export const QUICK_ACTIONS: { label: string; href: string; keywords?: string; cap?: Capability }[] = [
  { label: "Add client", href: "/clients?new=1", keywords: "new customer" },
  { label: "Create video", href: "/videos?new=1", keywords: "new production" },
  { label: "Write script", href: "/scripts?new=1", keywords: "new script" },
  { label: "Schedule shoot", href: "/calendar?new=shoot", keywords: "filming event" },
  { label: "Create task", href: "/tasks?new=1", keywords: "todo" },
  { label: "Record invoice", href: "/invoices/new", keywords: "bill", cap: "finance:edit" },
  { label: "Add expense", href: "/expenses?new=1", keywords: "cost receipt", cap: "finance:edit" },
  { label: "New package", href: "/packages?new=1", keywords: "retainer bundle", cap: "clients:edit" },
];
