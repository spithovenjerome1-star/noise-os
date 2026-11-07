import { requireUser } from "@/server/auth";
import { PageHeader } from "@/components/ui/misc";

export default async function Dashboard() {
  const user = await requireUser();
  return <PageHeader title={`Good day, ${user.name.split(" ")[0]}`} description="Dashboard is being built." />;
}
