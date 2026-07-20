import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Download,
  EyeOff,
  FileClock,
  History,
  Library,
  Lock,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Member = {
  id: number;
  displayName: string;
  role: "adult" | "child";
  avatarInitials: string;
  color: string;
};

type ShareGrant = {
  id: number;
  granteeUserId: number;
  permission: string;
  purpose: string;
  createdAt: string;
  revokedAt: string | null;
  expiresAt: string | null;
};

type LibraryItem = {
  id: number;
  ownerUserId: number;
  ownerKind: string;
  visibility: "private" | "shared" | "household";
  category: string;
  title: string;
  body: string | null;
  sourceType: string;
  sourceLabel: string | null;
  effectiveDate: string | null;
  sensitivity: "standard" | "personal" | "sensitive" | "restricted";
  retentionPolicy: string;
  status: "active" | "archived" | "deleted";
  version: number;
  grants: ShareGrant[];
  createdAt: string;
  updatedAt: string;
};

type AuditEvent = {
  id: number;
  actorUserId: number;
  eventType: string;
  summary: string;
  createdAt: string;
};

type LibraryStats = {
  visibleItems: number;
  ownedItems: number;
  sharedWithMe: number;
  householdItems: number;
  byCategory: Record<string, number>;
  bySensitivity: Record<string, number>;
};

const categoryOptions = [
  ["note", "Note"],
  ["document-reference", "Document reference"],
  ["instruction", "Instruction"],
  ["decision", "Decision"],
  ["memory", "Memory"],
  ["medical-reference", "Medical reference"],
  ["household-record", "Household record"],
  ["vehicle-record", "Vehicle record"],
  ["career-record", "Career record"],
  ["other", "Other"],
] as const;

const initialForm = {
  title: "",
  category: "note",
  body: "",
  visibility: "private",
  shareWithUserIds: [] as number[],
  sourceType: "manual",
  sourceLabel: "",
  provenanceNote: "",
  effectiveDate: "",
  sensitivity: "personal",
  retentionPolicy: "keep-until-archived",
};

function labelFor(value: string, options: readonly (readonly [string, string])[]) {
  return options.find(([key]) => key === value)?.[1] ?? value;
}

export default function LibraryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(initialForm);
  const [shareTarget, setShareTarget] = useState("");
  const [correction, setCorrection] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const adults = useMemo(
    () => members.filter((member) => member.role === "adult" && member.id !== user?.id),
    [members, user?.id],
  );

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const selectedActiveGrants = selected?.grants.filter((grant) => {
    if (grant.revokedAt) return false;
    return !grant.expiresAt || new Date(grant.expiresAt) > new Date();
  }) ?? [];
  const isOwner = !!selected && selected.ownerUserId === user?.id;

  const accessExplanation = useMemo(() => {
    if (form.visibility === "private") return "Only you can access this item. It will not appear in household search for other adults.";
    if (form.visibility === "household") return "Adult members of this household can access this household item. It is not a private vault record.";
    const names = adults
      .filter((adult) => form.shareWithUserIds.includes(adult.id))
      .map((adult) => adult.displayName);
    return names.length
      ? `Only you and ${names.join(", ")} can access this item after saving.`
      : "Choose the adult members who should receive access.";
  }, [adults, form.shareWithUserIds, form.visibility]);

  const load = useCallback(async (search: string) => {
    setIsLoading(true);
    setError("");
    try {
      const qs = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const [nextItems, nextMembers, nextStats] = await Promise.all([
        apiFetch(`/library/items${qs}`) as Promise<LibraryItem[]>,
        apiFetch("/family-members") as Promise<Member[]>,
        apiFetch("/library/stats") as Promise<LibraryStats>,
      ]);
      setItems(nextItems);
      setMembers(nextMembers);
      setStats(nextStats);
      setSelectedId((current) => current && nextItems.some((item) => item.id === current) ? current : nextItems[0]?.id ?? null);
    } catch (err: any) {
      setError(err.message ?? "Could not load Library");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load("");
  }, [load]);

  useEffect(() => {
    const id = window.setTimeout(() => load(query), 250);
    return () => window.clearTimeout(id);
  }, [load, query]);

  useEffect(() => {
    if (!selected) {
      setAuditEvents([]);
      setCorrection("");
      return;
    }
    setCorrection(selected.body ?? "");
    apiFetch(`/library/items/${selected.id}/audit`)
      .then((events) => setAuditEvents(events as AuditEvent[]))
      .catch(() => setAuditEvents([]));
  }, [selected?.id]);

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    const verifySelectedAccess = async () => {
      try {
        const verified = await apiFetch(`/library/items/${selectedId}`) as LibraryItem;
        if (cancelled) return;
        setItems((current) => current.map((item) => (item.id === verified.id ? verified : item)));
      } catch (err: any) {
        if (cancelled || err.status !== 404) return;
        setAuditEvents([]);
        setItems((current) => current.filter((item) => item.id !== selectedId));
        setSelectedId(null);
        await load(query);
      }
    };

    const handleFocus = () => {
      void verifySelectedAccess();
    };
    const handleVisibilityChange = () => {
      if (!document.hidden) void verifySelectedAccess();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load, query, selectedId]);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const created = await apiFetch("/library/items", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          body: form.body || null,
          sourceLabel: form.sourceLabel || null,
          provenanceNote: form.provenanceNote || null,
          effectiveDate: form.effectiveDate || null,
        }),
      }) as LibraryItem;
      setForm(initialForm);
      setSelectedId(created.id);
      await load(query);
    } catch (err: any) {
      setError(err.message ?? "Could not save item");
    } finally {
      setIsSaving(false);
    }
  }

  async function shareSelected() {
    if (!selected || !shareTarget) return;
    await apiFetch(`/library/items/${selected.id}/share`, {
      method: "POST",
      body: JSON.stringify({ granteeUserId: Number(shareTarget), purpose: "library_share" }),
    });
    setShareTarget("");
    await load(query);
  }

  async function revokeGrant(grant: ShareGrant) {
    if (!selected) return;
    await apiFetch(`/library/items/${selected.id}/revoke`, {
      method: "POST",
      body: JSON.stringify({ grantId: grant.id }),
    });
    await load(query);
  }

  async function patchSelected(patch: Record<string, unknown>) {
    if (!selected) return;
    const updated = await apiFetch(`/library/items/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }) as LibraryItem;
    setSelectedId(updated.id);
    await load(query);
  }

  async function deleteSelected() {
    if (!selected) return;
    const ok = window.confirm("Delete this Library item? Future access will be revoked and the audit trail will remain.");
    if (!ok) return;
    await apiFetch(`/library/items/${selected.id}`, { method: "DELETE" });
    setSelectedId(null);
    await load(query);
  }

  async function exportSelected() {
    if (!selected) return;
    const data = await apiFetch(`/library/items/${selected.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `lighthouse-library-item-${selected.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (user?.role === "child") {
    return (
      <div className="flex-1 p-6 md:p-10 flex flex-col items-center justify-center text-center max-w-md mx-auto">
        <Lock className="w-10 h-10 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-serif mb-2">Library is adult-only for now</h1>
        <p className="text-sm text-muted-foreground">Dependent access needs guardian, age, safety, and privacy rules before it is enabled.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Library className="w-8 h-8 text-primary" />
            <h1 className="text-3xl md:text-4xl font-serif text-foreground">Family Library</h1>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Save knowledge, decisions, instructions, references, and memories with explicit ownership and sharing.
          </p>
        </div>
        <button
          onClick={() => load(query)}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Visible" value={stats?.visibleItems ?? 0} />
        <Metric label="Owned by me" value={stats?.ownedItems ?? 0} />
        <Metric label="Shared with me" value={stats?.sharedWithMe ?? 0} />
        <Metric label="Household" value={stats?.householdItems ?? 0} />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[390px_minmax(0,1fr)] gap-6">
        <section className="space-y-4">
          <form onSubmit={createItem} className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              <h2 className="font-serif text-xl">New item</h2>
            </div>

            <Field label="Title">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="School pickup instructions"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {categoryOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Sensitivity">
                <select
                  value={form.sensitivity}
                  onChange={(e) => setForm({ ...form, sensitivity: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="standard">Standard</option>
                  <option value="personal">Personal</option>
                  <option value="sensitive">Sensitive</option>
                  <option value="restricted">Restricted</option>
                </select>
              </Field>
            </div>

            <div className="block space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Ownership and access</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["private", "Private"],
                  ["shared", "Selected"],
                  ["household", "Household"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setForm({ ...form, visibility: value, shareWithUserIds: value === "shared" ? form.shareWithUserIds : [] })}
                    className={cn(
                      "rounded-md border px-2 py-2 text-xs font-medium",
                      form.visibility === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-secondary",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.visibility === "shared" && (
              <div className="space-y-2">
                {adults.map((adult) => (
                  <label key={adult.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.shareWithUserIds.includes(adult.id)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...form.shareWithUserIds, adult.id]
                          : form.shareWithUserIds.filter((id) => id !== adult.id);
                        setForm({ ...form, shareWithUserIds: next });
                      }}
                    />
                    {adult.displayName}
                  </label>
                ))}
              </div>
            )}

            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-primary/90 flex gap-2">
              {form.visibility === "private" ? <EyeOff className="w-4 h-4 shrink-0" /> : <Users className="w-4 h-4 shrink-0" />}
              <span>{accessExplanation}</span>
            </div>

            <Field label="Details">
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Add the useful thing future-you should not have to reconstruct."
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Source">
                <input
                  value={form.sourceLabel}
                  onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Email, manual note"
                />
              </Field>
              <Field label="Effective date">
                <input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </Field>
            </div>

            <Field label="Retention">
              <select
                value={form.retentionPolicy}
                onChange={(e) => setForm({ ...form, retentionPolicy: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="keep-until-archived">Keep until archived</option>
                <option value="review-annually">Review annually</option>
                <option value="delete-after-date">Delete after date</option>
                <option value="legal-hold">Legal hold</option>
              </select>
            </Field>

            <button
              disabled={isSaving}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save Library item"}
            </button>
          </form>
        </section>

        <section className="space-y-4 min-w-0">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search Library"
              placeholder="Search items you are authorized to see"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>

          {isLoading ? (
            <div className="rounded-lg border border-border bg-card p-8 text-sm text-muted-foreground">Loading Library...</div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <FileClock className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
              <h2 className="font-serif text-xl mb-1">No visible Library items</h2>
              <p className="text-sm text-muted-foreground">Create a private, shared, or household item to start the durable family memory.</p>
            </div>
          ) : (
            <div className="grid xl:grid-cols-[minmax(260px,340px)_minmax(0,1fr)] gap-4">
              <div className="space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    data-testid="library-item-card"
                    className={cn(
                      "w-full rounded-lg border p-3 text-left transition-colors",
                      selected?.id === item.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-secondary/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-sm line-clamp-2">{item.title}</span>
                      <AccessBadge item={item} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                      <span>{labelFor(item.category, categoryOptions)}</span>
                      <span>Version {item.version}</span>
                      {item.status === "archived" && <span>Archived</span>}
                    </div>
                  </button>
                ))}
              </div>

              {selected && (
                <div data-testid="library-selected-detail" className="rounded-lg border border-border bg-card p-4 md:p-5 space-y-5 min-w-0">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <AccessBadge item={selected} />
                        <span className="rounded-full bg-secondary px-2 py-1 text-xs text-secondary-foreground">{selected.sensitivity}</span>
                        {selected.status === "archived" && <span className="rounded-full bg-muted px-2 py-1 text-xs">Archived</span>}
                      </div>
                      <h2 className="font-serif text-2xl">{selected.title}</h2>
                      <p className="text-xs text-muted-foreground mt-1">
                        {labelFor(selected.category, categoryOptions)} | Updated {new Date(selected.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isOwner && (
                        <button onClick={exportSelected} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-secondary" title="Export JSON" aria-label="Export JSON">
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      {isOwner && selected.status !== "archived" && (
                        <button onClick={() => patchSelected({ status: "archived" })} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-secondary" title="Archive" aria-label="Archive item">
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      {isOwner && selected.status === "archived" && (
                        <button onClick={() => patchSelected({ status: "active" })} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-secondary" title="Restore" aria-label="Restore item">
                          <Undo2 className="w-4 h-4" />
                        </button>
                      )}
                      {isOwner && (
                        <button onClick={deleteSelected} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border text-destructive hover:bg-destructive/10" title="Delete" aria-label="Delete item">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div data-testid="library-selected-body" className="rounded-md bg-muted/40 p-4 text-sm whitespace-pre-wrap min-h-24">
                    {selected.body || "No details recorded."}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <Info label="Source" value={selected.sourceLabel || selected.sourceType} />
                    <Info label="Effective date" value={selected.effectiveDate || "Not set"} />
                    <Info label="Retention" value={selected.retentionPolicy} />
                    <Info label="Owner" value={selected.ownerUserId === user?.id ? "You" : memberName(members, selected.ownerUserId)} />
                  </div>

                  {isOwner && selected.visibility !== "household" && (
                    <div className="rounded-md border border-border p-3 space-y-3">
                      <h3 className="text-sm font-medium flex items-center gap-2"><Share2 className="w-4 h-4" /> Sharing</h3>
                      {selectedActiveGrants.length > 0 ? (
                        <div className="space-y-2">
                          {selectedActiveGrants.map((grant) => (
                            <div key={grant.id} className="flex items-center justify-between gap-3 text-sm">
                              <span>{memberName(members, grant.granteeUserId)}</span>
                              <button onClick={() => revokeGrant(grant)} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary">
                                Revoke
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No active sharing grants.</p>
                      )}
                      <div className="flex gap-2">
                        <select aria-label="Share with adult" value={shareTarget} onChange={(e) => setShareTarget(e.target.value)} className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                          <option value="">Select adult</option>
                          {adults.map((adult) => <option key={adult.id} value={adult.id}>{adult.displayName}</option>)}
                        </select>
                        <button onClick={shareSelected} disabled={!shareTarget} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
                          Share
                        </button>
                      </div>
                    </div>
                  )}

                  {isOwner && (
                    <div className="rounded-md border border-border p-3 space-y-3">
                      <h3 className="text-sm font-medium">Correction</h3>
                      <textarea
                        value={correction}
                        onChange={(e) => setCorrection(e.target.value)}
                        aria-label="Correction body"
                        rows={4}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => patchSelected({ body: correction })}
                        className="rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary"
                      >
                        Save correction
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2"><History className="w-4 h-4" /> Audit history</h3>
                    {auditEvents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Audit history is available to the owner or household context.</p>
                    ) : (
                      <div className="space-y-2">
                        {auditEvents.map((event) => (
                          <div key={event.id} className="rounded-md bg-muted/40 px-3 py-2 text-xs">
                            <div className="font-medium">{event.summary}</div>
                            <div className="text-muted-foreground">{event.eventType} by {memberName(members, event.actorUserId)} on {new Date(event.createdAt).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-2xl font-serif">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function AccessBadge({ item }: { item: LibraryItem }) {
  const icon = item.visibility === "private" ? <Lock className="w-3 h-3" /> : item.visibility === "shared" ? <Share2 className="w-3 h-3" /> : <Users className="w-3 h-3" />;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-[11px] font-medium capitalize text-secondary-foreground">
      {icon}
      {item.visibility}
    </span>
  );
}

function memberName(members: Member[], id: number) {
  return members.find((member) => member.id === id)?.displayName ?? `Member ${id}`;
}
