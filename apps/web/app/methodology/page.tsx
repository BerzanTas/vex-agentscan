import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Methodology — AgentScan",
  description: "How AgentScan verifies, counts and retains Vex agent activity data",
};

function SectionHeading({ children }: { children: string }) {
  return <h2 className="mt-10 mb-4 text-lg text-text-primary">{children}</h2>;
}

function SubHeading({ children }: { children: string }) {
  return <h3 className="mt-6 mb-3 text-sm text-text-secondary">{children}</h3>;
}

function Paragraph({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-text-secondary">{children}</p>;
}

function BulletList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mb-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-text-secondary">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

export default function MethodologyPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-2xl text-text-primary">Methodology</h1>

      <SectionHeading>What the numbers mean</SectionHeading>
      <BulletList
        items={[
          "Only activities verified on-chain enter the statistics.",
          <>
            <strong className="text-text-primary">Volume</strong> is the sum of the estimated USD
            input value of verified activities, booked on the UTC day of the agent-reported
            confirmation time. For bridges only the deposit leg counts — one operation, one volume,
            never double-counted.
          </>,
          <>
            <strong className="text-text-primary">Daily transactions</strong> is the number of
            verified activities booked on that day.
          </>,
          <>
            <strong className="text-text-primary">Active agents</strong> is the number of unique
            agents with at least one verified activity in the window; the dashboard card uses the
            last 7 days.
          </>,
          "Backfilled history is booked on its original confirmation dates, so charts reflect real agent history rather than the date AgentScan launched.",
          "All USD values are estimates supplied by the reporting client at quote time and are marked “est.” everywhere; they are never settlement prices.",
        ]}
      />

      <SectionHeading>Feed and detail visibility</SectionHeading>
      <BulletList
        items={[
          "Verified activities are always visible.",
          "Pending rows, failed rows and rows without a transaction hash are shown only for agents that already have at least one verified activity.",
          "Public data never contains agent identifiers; each activity is addressed by an opaque random publicId. Network names and explorer links come from the server's own chain registry.",
        ]}
      />

      <SectionHeading>On-chain verification</SectionHeading>
      <Paragraph>
        Every confirmed activity that carries a transaction hash is checked against the network it
        declares, in three steps:
      </Paragraph>
      <ol className="mb-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-text-secondary">
        <li>Existence and success — the transaction exists on the declared chain and did not revert.</li>
        <li>Semantic match — the actual token transfers agree with the declared executed amounts.</li>
        <li>
          Time match — the block timestamp agrees with the declared confirmation time within a few
          minutes&apos; tolerance.
        </li>
      </ol>

      <SubHeading>verified_full vs verified_basic</SubHeading>
      <BulletList
        items={[
          <>
            <span className="font-mono text-success">verified_full</span> — all three checks passed.
            Applies to ERC-20 legs on EVM networks, where transfer deltas from the receipt logs are
            compared with the declared amounts.
          </>,
          <>
            <span className="font-mono text-success">verified_basic</span> — existence and time
            checks passed; the amount check is not yet available for this leg type. Applies to
            native-asset legs and Solana legs in the current version.
          </>,
        ]}
      />
      <Paragraph>
        A negative verdict requires a proven mismatch: a transaction missing after the indexing
        window, a revert cited as success, or mismatched amounts or timestamps. &quot;Cannot verify
        right now&quot; — an RPC outage, a network outside the registry, delayed indexing — is
        retried with backoff and never counted against an agent. The server never invents outcomes:
        an activity&apos;s status changes only on the reporting agent&apos;s own events.
      </Paragraph>

      <SectionHeading>Data retention</SectionHeading>
      <BulletList
        items={[
          <>
            <strong className="text-text-primary">Consent revocation:</strong> when an agent revokes
            consent, all of its raw events and activity rows are deleted from the live system after
            a short delay, within at most 72 hours. Daily aggregates carry no identifiers and are
            retained as an irreversible historical approximation.
          </>,
          <>
            <strong className="text-text-primary">Backups:</strong> encrypted database backups
            expire automatically after at most 30 days; restoring a backup re-runs the purge, so
            revoked data cannot resurface in the live system.
          </>,
          <>
            <strong className="text-text-primary">Access logs:</strong> server access logs
            containing IP addresses are retained for at most 30 days and used solely to respond to
            abuse; IP addresses are never joined with agent identifiers in any analytical data.
          </>,
          "Ingest credentials are stored only as SHA-256 hashes, and authorization headers are redacted from all logs.",
        ]}
      />
    </article>
  );
}
