import React, { useState } from "react";
import { useParams } from "wouter";
import { useGetInvitation, useUpdateInvitation, useListPlanningTasks, useUpdatePlanningTask } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Check, Calendar as CalendarIcon, Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export default function InvitationDetailPage() {
  const params = useParams();
  const { user } = useAuth();
  const [rsvpNote, setRsvpNote] = useState("");
  const [showRsvpText, setShowRsvpText] = useState(false);
  const [actionType, setActionType] = useState<"accepted" | "suggested-change" | "needs-info" | "declined" | null>(null);

  const { data: inv, isLoading } = useGetInvitation(params.id!, {
    query: { enabled: !!params.id, queryKey: ["invitation", params.id] }
  });

  const { data: tasks } = useListPlanningTasks({ invitationId: params.id }, {
    query: { enabled: !!params.id, queryKey: ["tasks", "invitation", params.id] }
  });

  const updateInv = useUpdateInvitation();
  const updateTask = useUpdatePlanningTask();

  if (isLoading) return <div className="p-10 text-center animate-pulse">Loading invitation...</div>;
  if (!inv) return <div className="p-10 text-center">Invitation not found</div>;

  // inviterId and inviteeIds are integers from the API
  const isInviter = user?.id !== undefined && Number(inv.inviterId) === user.id;
  const isInvitee = user?.id !== undefined && (
    Array.isArray(inv.inviteeIds)
      ? inv.inviteeIds.some((id: unknown) => Number(id) === user.id)
      : false
  );
  const isSurprise = inv.isSurprise && !isInviter && inv.detailLevel === 'hidden';

  const handleRsvp = () => {
    if (!actionType) return;
    updateInv.mutate({
      id: inv.id,
      data: {
        status: actionType,
        rsvpResponse: actionType,
        rsvpNote: rsvpNote
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto w-full p-6 md:p-10 space-y-8 pb-20">
      <div className="flex items-center mb-2">
        <button onClick={() => window.history.back()} className="text-sm text-muted-foreground flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Main Card */}
      <div className="bg-card border border-border rounded-3xl overflow-hidden shadow-xl">
        <div className={cn(
          "p-8 md:p-12 relative overflow-hidden",
          isSurprise ? "bg-primary/20 text-primary-foreground" : "bg-muted"
        )}>
          {isSurprise && <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-overlay"></div>}

          <div className="relative z-10 flex flex-col items-center text-center">
            <div className="flex items-center gap-2 mb-6">
              <span className="px-3 py-1 rounded-full bg-background/50 backdrop-blur-md text-xs font-bold uppercase tracking-wider text-foreground border border-border/10">
                Invitation
              </span>
              <span className={cn(
                "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
                inv.status === 'pending' ? "bg-amber-500/20 text-amber-700 border-amber-500/30" :
                inv.status === 'accepted' ? "bg-emerald-500/20 text-emerald-700 border-emerald-500/30" :
                "bg-background/50 text-foreground border-border/10"
              )}>
                {inv.status}
              </span>
            </div>

            <h1 className={cn("text-4xl md:text-5xl font-serif mb-4", isSurprise ? "text-primary" : "text-foreground")}>
              {isSurprise ? "A Surprise Experience" : inv.experienceTitle}
            </h1>

            <p className={cn("text-lg", isSurprise ? "text-primary/80" : "text-muted-foreground")}>
              {isInviter
                ? <span className="font-medium">Your invitation</span>
                : <>From <span className="font-medium">{(inv as any).inviterName ?? inv.inviterId}</span></>
              }
            </p>

            {inv.purpose && (
              <div className={cn(
                "mt-8 p-6 rounded-2xl italic text-lg max-w-lg shadow-sm border",
                isSurprise ? "bg-primary/10 border-primary/20 text-primary" : "bg-background border-border text-foreground/80"
              )}>
                "{inv.purpose}"
              </div>
            )}
          </div>
        </div>

        <div className="p-8 md:p-12">
          <div className="grid md:grid-cols-2 gap-10">
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 border-b border-border pb-2">Timing</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <CalendarIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-foreground">
                        {inv.proposedDate ? new Date(inv.proposedDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : "Sometime soon"}
                      </div>
                      {inv.proposedDateFlexible && <div className="text-sm text-muted-foreground">Flexible timeframe</div>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-foreground">Est. {inv.durationMinutes} minutes</div>
                    </div>
                  </div>
                </div>
              </div>

              {inv.message && (
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 border-b border-border pb-2">Personal Message</h3>
                  <p className="text-foreground leading-relaxed bg-secondary/30 p-4 rounded-xl">"{inv.message}"</p>
                </div>
              )}
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4 border-b border-border pb-2">Logistics to Know</h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded bg-secondary flex items-center justify-center shrink-0 mt-0.5 text-xs">👔</div>
                    <div>
                      <span className="text-sm font-medium block">Dress Guidance</span>
                      <span className="text-sm text-muted-foreground">{inv.dressGuidance || (isSurprise ? "Comfortable / Casual" : "Wear whatever you like")}</span>
                    </div>
                  </li>
                  {inv.childcareNotes && (
                    <li className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5 text-xs">👶</div>
                      <div>
                        <span className="text-sm font-medium block">Childcare</span>
                        <span className="text-sm text-muted-foreground">{inv.childcareNotes}</span>
                      </div>
                    </li>
                  )}
                  {inv.whatToBring && (
                    <li className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded bg-secondary flex items-center justify-center shrink-0 mt-0.5 text-xs">🎒</div>
                      <div>
                        <span className="text-sm font-medium block">What to bring</span>
                        <span className="text-sm text-muted-foreground">{inv.whatToBring}</span>
                      </div>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RSVP Section for Invitee */}
      {isInvitee && !isInviter && inv.status === 'pending' && (
        <div className="bg-card border border-border p-6 rounded-2xl shadow-sm animate-in fade-in slide-in-from-bottom-4">
          <h3 className="font-serif text-xl mb-4">How does this sound?</h3>

          {!showRsvpText ? (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => { setActionType("accepted"); updateInv.mutate({ id: inv.id, data: { status: "accepted", rsvpResponse: "accepted" } }); }}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" /> Yes, let's do it
              </button>
              <button
                onClick={() => { setActionType("suggested-change"); setShowRsvpText(true); }}
                className="px-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-medium hover:bg-secondary/80 transition-colors"
              >
                Suggest another time
              </button>
              <button
                onClick={() => { setActionType("needs-info"); setShowRsvpText(true); }}
                className="px-6 py-3 rounded-xl bg-card border border-border font-medium hover:bg-secondary transition-colors"
              >
                Ask a question
              </button>
              <button
                onClick={() => { setActionType("declined"); setShowRsvpText(true); }}
                className="px-6 py-3 rounded-xl bg-card border border-border text-muted-foreground font-medium hover:bg-rose-50 hover:text-rose-600 transition-colors ml-auto"
              >
                Pass for now
              </button>
            </div>
          ) : (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              <textarea
                value={rsvpNote}
                onChange={e => setRsvpNote(e.target.value)}
                placeholder={
                  actionType === 'suggested-change' ? "When works better for you?" :
                  actionType === 'needs-info' ? "What do you need to know?" :
                  "Leave a note confirming you're interested, just not right now..."
                }
                className="w-full p-4 rounded-xl border border-border bg-background resize-none focus:ring-2 ring-primary/20"
                rows={3}
              />
              <div className="flex gap-3">
                <button
                  onClick={handleRsvp}
                  disabled={updateInv.isPending}
                  className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium"
                >
                  Send Response
                </button>
                <button
                  onClick={() => setShowRsvpText(false)}
                  className="px-6 py-2.5 rounded-xl bg-secondary text-secondary-foreground font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Inviter Workspace / accepted state */}
      {isInviter && inv.status === 'accepted' && (
        <div className="bg-primary/5 border border-primary/20 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-xl text-primary">They said yes!</h3>
              <p className="text-sm text-primary/80">Your invitation was accepted.</p>
            </div>
          </div>

          <div className="bg-card rounded-xl p-5 border border-border mt-4">
            <h4 className="font-medium mb-4">Planning Checklist</h4>

            {tasks && tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((task: any) => (
                  <label key={task.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-secondary/30 cursor-pointer transition-colors group">
                    <input
                      type="checkbox"
                      className="mt-1 accent-primary w-4 h-4"
                      checked={task.completed}
                      onChange={() => updateTask.mutate({ id: task.id, data: { completed: !task.completed } })}
                    />
                    <span className={cn("text-sm transition-colors", task.completed ? "text-muted-foreground line-through" : "text-foreground group-hover:text-primary")}>
                      {task.title}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Planning tasks will appear here.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
