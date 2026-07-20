import React from "react";
import { useListFamilyMembers, useGetMemberProfile } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Shield, Eye, Lock, Edit3 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ProfilesTab() {
  const { data: members, isLoading: membersLoading } = useListFamilyMembers();

  if (membersLoading) return <div className="p-6">Loading profiles...</div>;

  if (!members || members.length === 0) {
    return (
      <div className="p-10 text-center border border-dashed border-border rounded-2xl bg-card/50 max-w-md mx-auto mt-10">
        <p className="text-muted-foreground text-sm">No profiles found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10 pt-0 max-w-4xl mx-auto space-y-8">
      <div className="bg-secondary/30 border border-secondary rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Profiles help tailor experience recommendations. Personal preferences are kept private by default.
          What you see of others is governed by their sharing settings.
        </p>
      </div>

      <div className="grid gap-6">
        {members.map((member: any) => (
          <ProfileCard key={member.id} member={member} />
        ))}
      </div>
    </div>
  );
}

function ProfileCard({ member }: { member: any }) {
  const { user } = useAuth();
  const isMe = user?.id === member.id;
  const isAdultViewer = user?.role === 'adult';

  const { data: profile, isLoading } = useGetMemberProfile(member.id, {
    query: { enabled: !!member.id, queryKey: ["profile", member.id] }
  });

  if (isLoading) return <div className="h-40 bg-muted rounded-xl animate-pulse" />;

  if (!profile) {
    return (
      <div className="border border-border bg-card rounded-2xl p-6 text-center text-muted-foreground text-sm">
        Profile not filled in yet for {member.displayName ?? member.id}.
      </div>
    );
  }

  return (
    <div className="border border-border bg-card rounded-2xl overflow-hidden shadow-sm">
      <div className="bg-muted p-6 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-serif text-white"
            style={{ backgroundColor: member.color ?? '#4A7C59' }}
          >
            {member.avatarInitials ?? (member.displayName?.[0]?.toUpperCase() ?? '?')}
          </div>
          <div>
            <h3 className="text-2xl font-serif text-foreground">{member.displayName ?? member.id}</h3>
            <p className="text-sm text-muted-foreground">{isMe ? "Your Profile" : "Family Member"}</p>
          </div>
        </div>
        {isMe && (
          <button className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80">
            <Edit3 className="w-4 h-4" /> Edit Profile
          </button>
        )}
      </div>

      <div className="p-6 grid sm:grid-cols-2 gap-x-8 gap-y-6">
        <PreferenceSection title="Interests" items={profile.interests} isMe={isMe} isAdult={isAdultViewer} />
        <PreferenceSection title="Dislikes" items={profile.dislikes} isMe={isMe} isAdult={isAdultViewer} />

        <div className="sm:col-span-2 grid sm:grid-cols-3 gap-6 pt-4 border-t border-border text-sm">
          <div>
            <span className="text-muted-foreground block mb-1">Energy Level</span>
            <span className="font-medium capitalize">{profile.activityLevel}</span>
          </div>
          <div>
            <span className="text-muted-foreground block mb-1">Crowd Tolerance</span>
            <span className="font-medium capitalize">{profile.crowdTolerance}</span>
          </div>
          <div>
            <span className="text-muted-foreground block mb-1">Surprise Comfort</span>
            <span className="font-medium capitalize">{profile.surpriseComfort?.replace('-', ' ')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreferenceSection({ title, items, isMe, isAdult }: { title: string; items: any[]; isMe: boolean; isAdult: boolean }) {
  if (!items || items.length === 0) return null;

  const visibleItems = items.filter(item => {
    if (isMe) return true;
    if (item.visibility === 'share-exact') return true;
    if (item.visibility === 'share-summary' && isAdult) return true;
    return false;
  });

  const hiddenCount = items.length - visibleItems.length;

  return (
    <div>
      <h4 className="font-medium text-foreground mb-3">{title}</h4>
      <div className="flex flex-wrap gap-2">
        {visibleItems.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/50 text-secondary-foreground border border-secondary text-xs">
            {item.visibility === 'share-summary' ? <span className="opacity-70">(Summary) </span> : null}
            {item.value}
            {isMe && <PrivacyIcon visibility={item.visibility} />}
          </span>
        ))}
      </div>
      {!isMe && hiddenCount > 0 && (
        <p className="text-xs text-muted-foreground mt-2 italic flex items-center gap-1">
          <Lock className="w-3 h-3" /> +{hiddenCount} private preference{hiddenCount !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

function PrivacyIcon({ visibility }: { visibility: string }) {
  if (visibility === 'private') return <span title="Private"><Lock className="w-3 h-3 text-muted-foreground ml-1" /></span>;
  if (visibility === 'ai-only') return <span className="text-[10px] ml-1 opacity-50 font-mono">🤖</span>;
  if (visibility === 'share-summary') return <span title="Summary only"><Eye className="w-3 h-3 text-muted-foreground ml-1 opacity-50" /></span>;
  return <span title="Shared exact"><Eye className="w-3 h-3 text-muted-foreground ml-1" /></span>;
}
