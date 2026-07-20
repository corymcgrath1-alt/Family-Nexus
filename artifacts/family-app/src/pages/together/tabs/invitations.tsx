import React, { useState } from "react";
import { Link } from "wouter";
import { useListInvitations } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Calendar, Clock, Sparkles, Send, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InvitationsTab() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"received" | "sent">("received");

  const { data: invitations, isLoading } = useListInvitations(
    {},
    { query: { queryKey: ["invitations"] } }
  );

  if (isLoading) return <div className="p-6">Loading invitations...</div>;

  const filtered = invitations?.filter((inv: any) =>
    activeTab === "received"
      ? inv.inviteeIds.includes(user?.id ?? -1)
      : inv.inviterId === user?.id
  ) || [];

  return (
    <div className="p-6 md:p-10 pt-0 max-w-4xl mx-auto space-y-6">
      <div className="flex bg-secondary/50 p-1 rounded-lg w-max mb-6">
        <button
          onClick={() => setActiveTab("received")}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-all",
            activeTab === "received" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Inbox className="w-4 h-4" /> Received
        </button>
        <button
          onClick={() => setActiveTab("sent")}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-all",
            activeTab === "sent" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Send className="w-4 h-4" /> Sent
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 px-4 border border-border border-dashed rounded-2xl bg-card/30">
          <Inbox className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="font-serif text-lg mb-1">No {activeTab} invitations</p>
          <p className="text-muted-foreground text-sm">
            {activeTab === "received"
              ? "When someone invites you to an experience, it will appear here."
              : "Send an invitation from the Discover tab to get started."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((inv: any) => (
            <InvitationCard key={inv.id} invitation={inv} userId={user?.id ?? -1} />
          ))}
        </div>
      )}
    </div>
  );
}

function InvitationCard({ invitation, userId }: { invitation: any; userId: number }) {
  const isSurprise = invitation.isSurprise;
  const isInviter = invitation.inviterId === userId;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'pending': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'declined': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  return (
    <Link href={`/together/invitations/${invitation.id}`}>
      <div className="group border border-border bg-card rounded-xl p-5 hover-elevate transition-all cursor-pointer relative overflow-hidden">
        {isSurprise && !isInviter && (
          <div className="absolute top-0 right-0 w-16 h-16 overflow-hidden">
            <div className="absolute top-2 -right-6 bg-accent text-accent-foreground text-[10px] font-bold uppercase tracking-wider py-1 px-8 rotate-45 flex items-center gap-1 shadow-sm">
              <Sparkles className="w-3 h-3" /> Surprise
            </div>
          </div>
        )}

        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-serif text-xl font-medium text-foreground">
              {isSurprise && !isInviter && invitation.detailLevel === 'hidden'
                ? "Surprise Date"
                : invitation.experienceTitle || "Unknown Experience"}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isInviter
                ? `To: ${Array.isArray(invitation.inviteeIds) ? invitation.inviteeIds.join(', ') : invitation.inviteeIds}`
                : `From: ${invitation.inviterName ?? invitation.inviterId}`}
            </p>
          </div>
          <span className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider", getStatusColor(invitation.status))}>
            {invitation.status.replace('-', ' ')}
          </span>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {invitation.proposedDate && (
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {new Date(invitation.proposedDate).toLocaleDateString()}
              {invitation.proposedDateFlexible && " (Flexible)"}
            </div>
          )}
          {invitation.durationMinutes && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4" />
              {invitation.durationMinutes} mins
            </div>
          )}
        </div>

        {invitation.purpose && (
          <p className="mt-4 text-sm italic text-foreground/80 border-l-2 border-primary/30 pl-3">
            "{invitation.purpose}"
          </p>
        )}
      </div>
    </Link>
  );
}
