import React, { useEffect, useState } from "react";
import type {
  ConnectorCatalogResponse,
  ConnectorDefinition,
} from "@workspace/api-client-react";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Eye,
  Shield,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type PrivacySummary = {
  members?: Array<{
    id: number;
    displayName: string;
    avatarInitials: string;
    color: string;
    role: string;
  }>;
  protections?: string[];
  limitations?: string[];
  visibilitySummary?: {
    privateCount: number;
    aiOnlyCount: number;
    sharedCount: number;
  } | null;
  principle?: string;
};

export default function PrivacyPage() {
  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [catalog, setCatalog] = useState<ConnectorCatalogResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch("/privacy/summary") as Promise<PrivacySummary>,
      apiFetch("/connectors/catalog") as Promise<ConnectorCatalogResponse>,
    ])
      .then(([privacySummary, connectorCatalog]) => {
        setSummary(privacySummary);
        setCatalog(connectorCatalog);
      })
      .catch(() => {
        setSummary(null);
        setCatalog(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 md:p-10 max-w-3xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-32 bg-muted rounded-xl" />
        <div className="h-48 bg-muted rounded-xl" />
      </div>
    );
  }

  const unavailableConnectors =
    catalog?.connectors.filter(
      (connector) => connector.status !== "available",
    ) ?? [];

  return (
    <div className="flex-1 p-6 md:p-10 max-w-3xl mx-auto w-full space-y-8">
      <header className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-serif text-foreground">Privacy</h1>
          <p className="text-muted-foreground text-sm">
            How Lighthouse protects your household data.
          </p>
        </div>
      </header>

      {summary?.members && summary.members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" /> Household Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {summary.members.map((member) => (
                <div key={member.id} className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ backgroundColor: member.color ?? "#4A7C59" }}
                  >
                    {member.avatarInitials}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{member.displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {member.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
            <Shield className="w-4 h-4" /> What Lighthouse Protects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary?.protections && summary.protections.length > 0 ? (
            <ul className="space-y-2">
              {summary.protections.map((protection) => (
                <li key={protection} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{protection}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Session-based authentication protects your account access.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-700">
            <AlertTriangle className="w-4 h-4" /> What This Version Does Not Yet
            Protect
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary?.limitations && summary.limitations.length > 0 ? (
            <ul className="space-y-2">
              {summary.limitations.map((limitation) => (
                <li
                  key={limitation}
                  className="flex items-start gap-2 text-sm text-amber-800"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{limitation}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2 text-sm text-amber-800">
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  No end-to-end encryption; do not store banking credentials,
                  identity documents, or unreviewed medical data.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Binary document storage is not available.</span>
              </li>
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-4 h-4" /> Data Entry Paths
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataPath
            title="Manual Family Library entry"
            description="Create an individual Library record directly. New records are private unless you deliberately choose another access level."
          />
          <DataPath
            title="Manual Library JSON import/export"
            description="Transfer one library-item.v1 record at a time. Imports create a new private copy and restore no prior sharing grants."
          />
          {unavailableConnectors.map((connector) => (
            <ConnectorPath key={connector.id} connector={connector} />
          ))}
          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            Lighthouse is not suitable for banking credentials, identity
            documents, or unreviewed medical data. No listed path authorizes
            collection from another adult.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4" /> Your Visibility
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {summary?.visibilitySummary ? (
            <>
              <p>
                <span className="font-medium">
                  {summary.visibilitySummary.privateCount}
                </span>{" "}
                profile preference
                {summary.visibilitySummary.privateCount !== 1
                  ? "s are"
                  : " is"}{" "}
                private.
              </p>
              <p>
                <span className="font-medium">
                  {summary.visibilitySummary.aiOnlyCount}
                </span>{" "}
                available only to your own Lighthouse assistance context.
              </p>
              <p>
                <span className="font-medium">
                  {summary.visibilitySummary.sharedCount}
                </span>{" "}
                deliberately shared or eligible for a sharing context.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Manage your profile visibility in the Together Profiles section.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="w-4 h-4" /> Insight boundaries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {[
              "Insight results are private to the requesting user.",
              "Only currently visible Family Library records are counted.",
              "Counts are exact for the database snapshot, not a claim that the Library represents real-world completeness.",
              "No AI or model is involved.",
              "No cross-adult comparison is produced.",
              "No signal observation or insight-view history is persisted in this release.",
            ].map((boundary) => (
              <li key={boundary} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{boundary}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {summary?.principle && (
        <blockquote className="border-l-4 border-primary pl-5 py-2 italic text-foreground/80 text-base leading-relaxed bg-primary/5 rounded-r-xl">
          &quot;{summary.principle}&quot;
        </blockquote>
      )}
    </div>
  );
}

function DataPath({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border pb-4 last:border-0 last:pb-0">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{title}</h3>
          <span className="rounded-sm bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
            Available
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ConnectorPath({ connector }: { connector: ConnectorDefinition }) {
  const prohibited = connector.status === "prohibited";
  const statusClass = prohibited
    ? "bg-red-100 text-red-800"
    : connector.status === "unsupported"
      ? "bg-slate-100 text-slate-700"
      : "bg-amber-100 text-amber-800";

  return (
    <div
      data-testid={`connector-row-${connector.id}`}
      data-connector-status={connector.status}
      className="flex items-start gap-3 border-b border-border pb-4 last:border-0 last:pb-0"
    >
      {prohibited ? (
        <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
      ) : (
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{connector.displayName}</h3>
          <span
            className={`rounded-sm px-2 py-1 text-xs font-medium capitalize ${statusClass}`}
          >
            {connector.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {connector.unavailableReason}
        </p>
      </div>
    </div>
  );
}
