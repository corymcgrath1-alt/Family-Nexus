import React from "react";
import {
  useGetLibraryInsights,
  useListLibraryInsightDefinitions,
  type LibraryCategoryCountMap,
  type LibrarySensitivityCountMap,
} from "@workspace/api-client-react";
import {
  Archive,
  BarChart3,
  ChevronDown,
  Database,
  Eye,
  Home,
  Library,
  Lock,
  RefreshCw,
  Share2,
  UserRound,
} from "lucide-react";

const request = { credentials: "include" as const };

const summaryMetrics = [
  { key: "visibleItems", label: "Visible items", icon: Eye },
  { key: "ownedItems", label: "Owned by me", icon: UserRound },
  { key: "sharedWithMe", label: "Shared with me", icon: Share2 },
  { key: "householdItems", label: "Household items", icon: Home },
  { key: "archivedItems", label: "Archived items", icon: Archive },
] as const;

function readableLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function InsightsPage() {
  const insightsQuery = useGetLibraryInsights({ request });
  const definitionsQuery = useListLibraryInsightDefinitions({ request });

  if (insightsQuery.isPending || definitionsQuery.isPending) {
    return <InsightsLoading />;
  }

  if (insightsQuery.isError || definitionsQuery.isError) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
        <header className="mb-6 flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="font-serif text-3xl text-foreground">Insights</h1>
            <p className="text-sm text-muted-foreground">
              Current-state Family Library statistics
            </p>
          </div>
        </header>
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 p-5"
        >
          <h2 className="font-medium text-destructive">
            Insights are unavailable
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lighthouse could not validate the governed definitions or calculate
            this private snapshot.
          </p>
          <button
            type="button"
            onClick={() => {
              void insightsQuery.refetch();
              void definitionsQuery.refetch();
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-secondary"
          >
            <RefreshCw className="h-4 w-4" /> Retry
          </button>
        </div>
      </main>
    );
  }

  const insights = insightsQuery.data;
  const definitions = definitionsQuery.data.definitions;
  const empty = insights.metrics.visibleItems.value === 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 p-4 md:p-8">
      <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h1 className="font-serif text-3xl text-foreground md:text-4xl">
              Insights
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Exact current-state counts for Family Library records visible to
            you. Another adult&apos;s private records are not included.
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 md:items-end">
          <span className="rounded-sm bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">
            Deterministic — no AI
          </span>
          <time
            dateTime={insights.calculatedAt}
            className="text-xs text-muted-foreground"
          >
            Calculated {new Date(insights.calculatedAt).toLocaleString()}
          </time>
        </div>
      </header>

      {empty && (
        <section className="rounded-md border border-border bg-muted/30 px-5 py-6">
          <div className="flex items-start gap-3">
            <Library className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-medium">No visible Library items yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every registered category and sensitivity class is shown below
                with an exact zero count.
              </p>
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="mb-3 text-base font-semibold">
          Current snapshot
        </h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {summaryMetrics.map(({ key, label, icon: Icon }) => (
            <div
              key={key}
              data-testid={`insight-${key}`}
              className="min-w-0 rounded-md border border-border bg-card p-4"
            >
              <Icon className="mb-3 h-4 w-4 text-muted-foreground" />
              <p className="text-2xl font-semibold tabular-nums">
                {insights.metrics[key].value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Breakdown
          title="Category breakdown"
          testId="insight-category-breakdown"
          values={insights.metrics.byCategory.values}
          total={insights.metrics.visibleItems.value}
        />
        <Breakdown
          title="Sensitivity breakdown"
          testId="insight-sensitivity-breakdown"
          values={insights.metrics.bySensitivity.values}
          total={insights.metrics.visibleItems.value}
        />
      </div>

      <section className="border-t border-border pt-6">
        <details className="group rounded-md border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex items-center gap-2">
              <Database className="h-4 w-4" /> How this is calculated
            </span>
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="space-y-5 border-t border-border px-4 py-5 text-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <Boundary
                icon={Lock}
                title="Private actor scope"
                text="Only rows readable by your authenticated, transaction-scoped PostgreSQL RLS context are counted."
              />
              <Boundary
                icon={Database}
                title="Exact database arithmetic"
                text={insights.coverage.explanation}
              />
              <Boundary
                icon={Eye}
                title="Unknown source completeness"
                text={insights.uncertainty.interpretationWarning}
              />
            </div>
            <p className="rounded-md bg-muted/40 p-3 text-muted-foreground">
              The Library is user-controlled, so these counts do not measure
              whether it represents your entire real life. No universal person
              or household score exists, and no observation history is stored
              for this view.
            </p>
            <div>
              <h3 className="mb-2 font-medium">Governed definitions</h3>
              <ul className="divide-y divide-border border-y border-border">
                {definitions.map((definition) => (
                  <li
                    key={definition.definitionKey}
                    className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-mono text-xs">
                      {definition.definitionKey}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Formula {definition.formulaVersion}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </section>
    </main>
  );
}

function Breakdown({
  title,
  values,
  total,
  testId,
}: {
  title: string;
  values: LibraryCategoryCountMap | LibrarySensitivityCountMap;
  total: number;
  testId: string;
}) {
  return (
    <section aria-label={title} data-testid={testId}>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <div className="divide-y divide-border border-y border-border">
        {Object.entries(values).map(([key, value]) => (
          <div
            key={key}
            data-testid={`insight-dimension-${key}`}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-2.5"
          >
            <div className="min-w-0">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="truncate text-sm">{readableLabel(key)}</span>
                <span className="text-xs text-muted-foreground">
                  {total === 0 ? 0 : Math.round((value / total) * 100)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${total === 0 ? 0 : (value / total) * 100}%`,
                  }}
                />
              </div>
            </div>
            <span className="w-8 text-right text-sm font-medium tabular-nums">
              {value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Boundary({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div>
      <Icon className="mb-2 h-4 w-4 text-primary" />
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function InsightsLoading() {
  return (
    <main
      aria-label="Loading Insights"
      className="mx-auto w-full max-w-6xl flex-1 animate-pulse space-y-8 p-4 md:p-8"
    >
      <div className="h-16 max-w-xl rounded-md bg-muted" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {summaryMetrics.map(({ key }) => (
          <div key={key} className="h-28 rounded-md bg-muted" />
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="h-72 rounded-md bg-muted" />
        <div className="h-72 rounded-md bg-muted" />
      </div>
    </main>
  );
}
