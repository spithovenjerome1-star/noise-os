"use client";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/fields";
import { loginAction } from "@/server/session-actions";

export function LoginForm() {
  const router = useRouter();
  return (
    <ActionForm action={loginAction} onSuccess={() => router.replace("/")} refresh={false} className="flex flex-col gap-3">
      <TextField name="email" type="email" label="Email" autoComplete="email" autoFocus required />
      <TextField name="password" type="password" label="Password" autoComplete="current-password" required />
      <SubmitButton size="lg" className="mt-2 w-full">Sign in</SubmitButton>
    </ActionForm>
  );
}
