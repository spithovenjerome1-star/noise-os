import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/server/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  if ((await db.user.count()) === 0) redirect("/setup");
  return (
    <AuthFrame title="Sign in to NOISE OS" subtitle="Your studio, in one place.">
      <LoginForm />
    </AuthFrame>
  );
}

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm animate-pop">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-5 flex size-10 items-center justify-center rounded-xl bg-fg text-sm font-black tracking-tighter text-bg">N</span>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[13px] text-muted">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
