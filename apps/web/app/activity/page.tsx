import type { Metadata } from "next";
import { LoadMoreActivity } from "../../components/LoadMoreActivity";
import { fetchActivity } from "../../lib/api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Activity — AgentScan",
  description: "Every verified Vex agent activity, newest first",
};

export default async function ActivityPage() {
  const feed = await fetchActivity();

  return (
    <section className="section-enter flex flex-col gap-6">
      <h1 className="text-2xl text-text-primary">Activity</h1>
      <LoadMoreActivity initialItems={feed.items} initialCursor={feed.nextCursor} />
    </section>
  );
}
