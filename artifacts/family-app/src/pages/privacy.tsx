import React, { useEffect, useState } from 'react';
import { Shield, Lock, AlertTriangle, Eye, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { API_BASE } from '@/lib/api-base';

type PrivacySummary = {
  members?: Array<{ id: number; displayName: string; avatarInitials: string; color: string; role: string }>;
  protections?: string[];
  limitations?: string[];
  privateTraitsCount?: number;
  sharedTraitsCount?: number;
  principle?: string;
};

export default function PrivacyPage() {
  const [summary, setSummary] = useState<PrivacySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/privacy/summary`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => setSummary(data))
      .catch(() => setSummary(null))
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

  return (
    <div className="flex-1 p-6 md:p-10 max-w-3xl mx-auto w-full space-y-8">
      <header className="flex items-center gap-3">
        <Shield className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-3xl font-serif text-foreground">Privacy</h1>
          <p className="text-muted-foreground text-sm">How Lighthouse protects your household data.</p>
        </div>
      </header>

      {/* Members */}
      {summary?.members && summary.members.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" /> Household Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {summary.members.map(m => (
                <div key={m.id} className="flex items-center gap-2">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ backgroundColor: m.color ?? '#4A7C59' }}
                  >
                    {m.avatarInitials}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.displayName}</p>
                    <p className="text-xs text-muted-foreground capitalize">{m.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* What Lighthouse Protects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-emerald-700">
            <Shield className="w-4 h-4" /> What Lighthouse Protects
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary?.protections && summary.protections.length > 0 ? (
            <ul className="space-y-2">
              {summary.protections.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-600 mt-0.5">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Session-based authentication protects your account access.</p>
          )}
        </CardContent>
      </Card>

      {/* Limitations */}
      <Card className="border-amber-200 bg-amber-50/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-700">
            <AlertTriangle className="w-4 h-4" /> What This Version Does Not Yet Protect
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary?.limitations && summary.limitations.length > 0 ? (
            <ul className="space-y-2">
              {summary.limitations.map((l, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="mt-0.5">⚠</span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-2 text-sm text-amber-800">
              <li className="flex items-start gap-2"><span className="mt-0.5">⚠</span><span>No end-to-end encryption — not suitable for highly sensitive data.</span></li>
              <li className="flex items-start gap-2"><span className="mt-0.5">⚠</span><span>Document storage is coming in a future version.</span></li>
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Visibility summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Eye className="w-4 h-4" /> Your Visibility
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {summary?.privateTraitsCount !== undefined ? (
            <>
              <p>You have <span className="font-medium">{summary.privateTraitsCount}</span> trait{summary.privateTraitsCount !== 1 ? 's' : ''} marked <span className="font-medium">Private</span>.</p>
              <p><span className="font-medium">{summary.sharedTraitsCount ?? 0}</span> shared with your household.</p>
            </>
          ) : (
            <p className="text-muted-foreground">Manage your profile visibility in the Together → Profiles section.</p>
          )}
        </CardContent>
      </Card>

      {/* Principle */}
      {summary?.principle && (
        <blockquote className="border-l-4 border-primary pl-5 py-2 italic text-foreground/80 text-base leading-relaxed bg-primary/5 rounded-r-xl">
          "{summary.principle}"
        </blockquote>
      )}
    </div>
  );
}
