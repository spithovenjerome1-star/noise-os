"use client";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/fields";
import { setupAction } from "@/server/session-actions";

export function SetupForm() {
  const router = useRouter();
  return (
    <ActionForm action={setupAction} onSuccess={() => router.replace("/")} refresh={false} className="flex flex-col gap-3">
      <TextField name="businessName" label="Business name" defaultValue="NOISE" />
      <TextField name="name" label="Your name" autoComplete="name" autoFocus />
      <TextField name="email" type="email" label="Email" autoComplete="email" />
      <TextField name="password" type="password" label="Password" autoComplete="new-password" hint="At least 10 characters." />
      <SubmitButton size="lg" className="mt-2 w-full">Create account</SubmitButton>
    </ActionForm>
  );
}
