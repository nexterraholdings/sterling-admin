import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { getCurrentAdmin } from "@/app/dashboard/lib/dal";
import { Toaster } from "@/components/ui/sonner";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();

  return (
    <>
      <DashboardShell admin={admin}>{children}</DashboardShell>
      <Toaster position="top-right" />
    </>
  );
}
