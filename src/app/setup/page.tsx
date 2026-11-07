import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AuthFrame } from "../login/page";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Set up" };

export default async function SetupPage() {
  if ((await db.user.count()) > 0) redirect("/login");
  return (
    <AuthFrame title="Welcome to NOISE OS" subtitle="Create the owner account. You can invite your team later.">
      <SetupForm />
    </AuthFrame>
  );
}
