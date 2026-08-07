import type { Metadata } from "next";
import { VerificationPanels } from "../../components/VerificationPanels";
import { fetchVerificationStats } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verification — AgentScan",
  description: "How Vex agent activity is checked on chain, and on which networks",
};

export default async function VerificationPage() {
  const stats = await fetchVerificationStats();

  return (
    <section className="section-enter flex flex-col gap-6">
      <h1 className="text-2xl text-text-primary">Verification</h1>
      <VerificationPanels stats={stats} />
    </section>
  );
}
