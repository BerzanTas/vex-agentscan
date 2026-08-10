import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentPageView } from "../../../components/AgentPageView";
import { fetchAgentPage } from "../../../lib/api";

export const dynamic = "force-dynamic";

type AgentProfilePageProps = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: AgentProfilePageProps): Promise<Metadata> {
  const agent = await fetchAgentPage((await params).name);
  if (agent === null) return { title: "Agent not found - AgentScan" };
  return {
    title: `${agent.name} - AgentScan`,
    description: `Aggregate view of the verified activity of Vex agent ${agent.name}`,
  };
}

export default async function AgentProfilePage({ params }: AgentProfilePageProps) {
  const agent = await fetchAgentPage((await params).name);
  if (agent === null) notFound();

  return <AgentPageView agent={agent} />;
}
