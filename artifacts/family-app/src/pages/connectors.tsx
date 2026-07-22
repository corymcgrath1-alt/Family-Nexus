import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  Clock3,
  Link2,
  Lock,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import {
  beginGoogleCalendarAuthorization,
  confirmConnectorConsent,
  discoverConnectorResources,
  pauseConnectorConnection,
  resumeConnectorConnection,
  revokeConnectorConnection,
  runConnectorSync,
  updateConnectorResources,
  useListConnectorConnections,
  useListConnectorDefinitions,
  useListConnectorResources,
} from "@workspace/api-client-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type RetentionChoice = "retain" | "archive" | "delete";

export default function ConnectorsPage() {
  const definitions = useListConnectorDefinitions();
  const connections = useListConnectorConnections();
  const requestedConnection = new URLSearchParams(window.location.search).get("connection");
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(requestedConnection);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showRevoke, setShowRevoke] = useState(false);
  const [retentionChoice, setRetentionChoice] = useState<RetentionChoice>("retain");

  const activeConnections = useMemo(
    () => (connections.data ?? []).filter((connection) => connection.state !== "archived"),
    [connections.data],
  );
  const connection = activeConnections.find((candidate) => candidate.id === selectedConnectionId) ?? activeConnections[0] ?? null;
  const resources = useListConnectorResources(connection?.id ?? "missing", {
    query: { enabled: Boolean(connection), queryKey: ["connector-resources", connection?.id ?? "missing"] },
  });
  const google = definitions.data?.find((definition) => definition.connectorKey === "google.calendar");

  useEffect(() => {
    if (connection && selectedConnectionId !== connection.id) setSelectedConnectionId(connection.id);
  }, [connection, selectedConnectionId]);

  useEffect(() => {
    if (resources.data) setSelectedResourceIds(resources.data.filter((resource) => resource.selected).map((resource) => resource.providerResourceId));
  }, [resources.data]);

  async function action(name: string, operation: () => Promise<void>) {
    setBusy(name);
    setError("");
    setSuccess("");
    try {
      await operation();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Connector action failed.");
    } finally {
      setBusy("");
    }
  }

  function refreshAll() {
    return Promise.all([connections.refetch(), resources.refetch()]);
  }

  const startAuthorization = () => action("authorize", async () => {
    const result = await beginGoogleCalendarAuthorization({ redirectPath: "/connectors" });
    window.location.assign(result.authorizationUrl);
  });

  const discover = () => connection && action("discover", async () => {
    await discoverConnectorResources(connection.id);
    await resources.refetch();
    setSuccess("Calendars discovered. Nothing is selected automatically.");
  });

  const saveSelection = () => connection && action("selection", async () => {
    await updateConnectorResources(connection.id, { resourceIds: selectedResourceIds });
    await refreshAll();
    setConsentConfirmed(false);
    setSuccess("Calendar selection saved. Confirm Lighthouse consent to activate imports.");
  });

  const confirmConsent = () => connection && action("consent", async () => {
    await confirmConnectorConsent(connection.id, {
      confirmed: true,
      purpose: "Import selected calendar events into my private Lighthouse records.",
      consentTextVersion: "google-calendar-consent.v1",
    });
    await refreshAll();
    setConsentConfirmed(false);
    setSuccess("Lighthouse import consent recorded. The connection is ready to sync.");
  });

  const sync = () => connection && action("sync", async () => {
    const run = await runConnectorSync(connection.id);
    await connections.refetch();
    setSuccess(`Sync complete: ${run.createdCount} created, ${run.updatedCount} updated, ${run.tombstonedCount} archived.`);
  });

  const pauseOrResume = () => connection && action("state", async () => {
    if (connection.state === "paused") await resumeConnectorConnection(connection.id);
    else await pauseConnectorConnection(connection.id);
    await connections.refetch();
  });

  const revoke = () => connection && action("revoke", async () => {
    await revokeConnectorConnection(connection.id, { disposition: retentionChoice });
    await connections.refetch();
    setShowRevoke(false);
    setSuccess("Connection revoked. No later synchronization can run.");
  });

  const isPendingConsent = connection?.state === "pending_authorization" || (connection?.state === "paused" && !connection.hasActiveConsent);
  const canSync = connection && ["active", "degraded"].includes(connection.state) && connection.hasActiveConsent;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-7">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary text-primary-foreground flex items-center justify-center"><Link2 className="w-5 h-5" /></div>
          <div>
            <h1 className="font-serif text-3xl">Connectors</h1>
            <p className="text-sm text-muted-foreground">Bring selected external records into your private Lighthouse Passport.</p>
          </div>
        </div>
      </header>

      <section className="grid md:grid-cols-3 gap-3" aria-label="Connector privacy boundary">
        <Boundary icon={ShieldCheck} title="Explicit consent" text="Google authorization and Lighthouse import consent are separate decisions." />
        <Boundary icon={CalendarDays} title="Selected calendars only" text="Newly discovered calendars are never imported automatically." />
        <Boundary icon={Lock} title="Private by default" text="Imported events are not visible to another adult unless you share a record later." />
      </section>

      {(error || success) && (
        <div role={error ? "alert" : "status"} className={`rounded-md border p-3 text-sm ${error ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-primary/30 bg-primary/5 text-primary"}`}>
          {error || success}
        </div>
      )}

      {definitions.isLoading || connections.isLoading ? (
        <div className="py-12 text-sm text-muted-foreground">Loading connector status...</div>
      ) : !google ? (
        <div role="alert" className="py-12 text-sm text-destructive">The Google Calendar connector definition is unavailable.</div>
      ) : (
        <section className="rounded-lg border border-border bg-card" data-testid="google-calendar-connector">
          <div className="p-4 md:p-5 border-b border-border flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex gap-3 min-w-0">
              <div className="w-10 h-10 rounded-md bg-[#4285F4]/10 text-[#246FDB] flex items-center justify-center shrink-0"><CalendarDays className="w-5 h-5" /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-serif text-2xl">{google.displayName}</h2>
                  <StateLabel state={connection?.state ?? "not_connected"} />
                </div>
                <p className="text-sm text-muted-foreground mt-1">{google.documentation.summary}</p>
                {connection?.providerAccountLabel && <p className="text-sm mt-2">Connected account: <span className="font-medium">{connection.providerAccountLabel}</span></p>}
              </div>
            </div>
            {!connection || connection.state === "revoked" ? (
              <button onClick={startAuthorization} disabled={Boolean(busy)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {busy === "authorize" ? "Preparing..." : "Authorize Google"}
              </button>
            ) : null}
          </div>

          <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
            <div className="p-4 md:p-5 space-y-6 lg:border-r border-border">
              <div>
                <h3 className="text-sm font-semibold mb-2">Requested permissions</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><Check className="w-4 h-4 text-primary mt-0.5" /> Identify the Google account using its stable account ID and email label.</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-primary mt-0.5" /> Read the list of calendars available to that account.</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-primary mt-0.5" /> Read events from calendars you explicitly select.</li>
                </ul>
                <p className="mt-3 text-xs text-muted-foreground">No calendar write, Gmail, Contacts, Drive, or attachment permission is requested.</p>
              </div>

              {connection && connection.state !== "revoked" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Calendar selection</h3>
                      <p className="text-xs text-muted-foreground">Discovery does not opt a calendar into import.</p>
                    </div>
                    <button onClick={discover} disabled={Boolean(busy)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">
                      <RefreshCw className="w-4 h-4" /> Discover
                    </button>
                  </div>

                  {resources.isLoading ? <p className="text-sm text-muted-foreground">Loading calendars...</p> : (resources.data?.length ?? 0) === 0 ? (
                    <div className="border border-dashed border-border rounded-md p-4 text-sm text-muted-foreground">Discover calendars after completing Google authorization.</div>
                  ) : (
                    <fieldset className="space-y-2">
                      <legend className="sr-only">Calendars to import</legend>
                      {resources.data?.map((resource) => (
                        <label key={resource.id} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={selectedResourceIds.includes(resource.providerResourceId)}
                            disabled={resource.accessStatus !== "available" || Boolean(busy)}
                            onChange={(event) => setSelectedResourceIds(event.target.checked
                              ? [...selectedResourceIds, resource.providerResourceId]
                              : selectedResourceIds.filter((id) => id !== resource.providerResourceId))}
                          />
                          <span className="min-w-0"><span className="font-medium block">{resource.displayName}</span><span className="text-xs text-muted-foreground capitalize">{resource.accessStatus.replaceAll("_", " ")}</span></span>
                        </label>
                      ))}
                      <button onClick={saveSelection} disabled={!selectedResourceIds.length || Boolean(busy)} className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-50">
                        Save calendar selection
                      </button>
                    </fieldset>
                  )}
                </div>
              )}

              {connection && isPendingConsent && selectedResourceIds.length > 0 && (
                <div className="border-t border-border pt-5 space-y-3" data-testid="connector-consent-step">
                  <h3 className="text-sm font-semibold">Lighthouse import consent</h3>
                  <p className="text-sm text-muted-foreground">I authorize Lighthouse to import current event data from the selected calendars for personal organization. Imported records become private records owned by my Passport. This does not authorize access for another adult.</p>
                  <label className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-0.5" checked={consentConfirmed} onChange={(event) => setConsentConfirmed(event.target.checked)} />
                    <span>I understand the purpose, private default, one-year past and one-year future initial window, and revocation choices.</span>
                  </label>
                  <button onClick={confirmConsent} disabled={!consentConfirmed || Boolean(busy)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Confirm Lighthouse consent</button>
                </div>
              )}
            </div>

            <aside className="p-4 md:p-5 space-y-5" aria-label="Connection operations">
              <div>
                <h3 className="text-sm font-semibold mb-3">Synchronization</h3>
                <dl className="space-y-3 text-sm">
                  <StatusRow label="Last attempted" value={formatTime(connection?.lastAttemptedSyncAt)} />
                  <StatusRow label="Last successful" value={formatTime(connection?.lastSuccessfulSyncAt)} />
                  <StatusRow label="Imported last run" value={connection?.latestSyncRun ? String(connection.latestSyncRun.createdCount) : "None"} />
                  <StatusRow label="Changed last run" value={connection?.latestSyncRun ? String(connection.latestSyncRun.updatedCount + connection.latestSyncRun.tombstonedCount) : "None"} />
                </dl>
              </div>

              {connection && connection.state !== "revoked" && (
                <div className="space-y-2">
                  <button onClick={sync} disabled={!canSync || Boolean(busy)} className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                    <RefreshCw className={`w-4 h-4 ${busy === "sync" ? "animate-spin" : ""}`} /> Sync now
                  </button>
                  {connection.hasActiveConsent && ["active", "degraded", "paused"].includes(connection.state) && (
                    <button onClick={pauseOrResume} disabled={Boolean(busy)} className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-50">
                      {connection.state === "paused" ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                      {connection.state === "paused" ? "Resume sync" : "Pause sync"}
                    </button>
                  )}
                  <button onClick={() => setShowRevoke(true)} disabled={Boolean(busy)} className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/5 disabled:opacity-50">
                    <Unplug className="w-4 h-4" /> Revoke connection
                  </button>
                </div>
              )}

              {connection?.latestSyncRun?.errorSummary && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5" /><span>{connection.latestSyncRun.errorSummary}</span></div>
                </div>
              )}
            </aside>
          </div>
        </section>
      )}

      {connection && (
        <AlertDialog open={showRevoke} onOpenChange={setShowRevoke}>
          <AlertDialogContent className="space-y-4">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-serif text-2xl">Revoke Google Calendar</AlertDialogTitle>
              <AlertDialogDescription>Future provider access and synchronization stop immediately. Choose what happens to eligible imported records.</AlertDialogDescription>
            </AlertDialogHeader>
            <fieldset className="space-y-2">
              <legend className="sr-only">Imported record disposition</legend>
              <RetentionOption value="retain" current={retentionChoice} onChange={setRetentionChoice} icon={Lock} title="Retain imported records" text="Keep records as private Lighthouse copies detached from Google." />
              <RetentionOption value="archive" current={retentionChoice} onChange={setRetentionChoice} icon={Clock3} title="Archive imported records" text="Archive source-backed records while preserving corrected or legally held records." />
              <RetentionOption value="delete" current={retentionChoice} onChange={setRetentionChoice} icon={Trash2} title="Delete eligible imported records" text="Soft-delete uncorrected records and remove connector source objects, mappings, and checkpoints." />
            </fieldset>
            <p className="text-xs text-muted-foreground">User-corrected, detached, or legally held records are not silently deleted.</p>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <button onClick={revoke} disabled={Boolean(busy)} className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50">Revoke and apply choice</button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function Boundary({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return <div className="border border-border rounded-lg p-4"><Icon className="w-5 h-5 text-primary mb-3" /><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs text-muted-foreground mt-1">{text}</p></div>;
}

function StateLabel({ state }: { state: string }) {
  return <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-medium capitalize text-secondary-foreground">{state.replaceAll("_", " ")}</span>;
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}

function formatTime(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

function RetentionOption({ value, current, onChange, icon: Icon, title, text }: { value: RetentionChoice; current: RetentionChoice; onChange: (value: RetentionChoice) => void; icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return <label className={`flex gap-3 rounded-md border p-3 text-sm ${current === value ? "border-primary bg-primary/5" : "border-border"}`}><input type="radio" name="retention" value={value} checked={current === value} onChange={() => onChange(value)} className="mt-1" /><Icon className="w-4 h-4 mt-0.5 shrink-0" /><span><span className="font-medium block">{title}</span><span className="text-xs text-muted-foreground">{text}</span></span></label>;
}
