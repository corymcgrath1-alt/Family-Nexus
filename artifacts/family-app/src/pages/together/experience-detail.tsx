import React, { useState } from "react";
import { Link, useParams, useLocation } from "wouter";
import { useGetExperience, useCreateInvitation } from "@workspace/api-client-react";
import { ArrowLeft, Clock, MapPin, DollarSign, Zap, AlertCircle, ChevronRight, Check, Send, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function ExperienceDetailPage() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const isInviteFlow = searchParams.get("action") === "invite";

  const { user } = useAuth();
  const { data: experience, isLoading } = useGetExperience(params.id!, {
    query: { enabled: !!params.id, queryKey: ["experience", params.id] }
  });

  const [step, setStep] = useState(1);
  const [inviteData, setInviteData] = useState({
    inviteeIds: [] as string[],
    purpose: "",
    proposedDateFlexible: true,
    proposedDate: "",
    detailLevel: "full" as "full" | "partial" | "hidden",
    isSurprise: false,
    message: ""
  });

  const createInvite = useCreateInvitation();

  if (isLoading) return <div className="p-10 text-center animate-pulse">Loading experience...</div>;
  if (!experience) return <div className="p-10 text-center">Experience not found</div>;

  if (isInviteFlow) {
    return (
      <div className="min-h-screen bg-background flex flex-col md:flex-row">
        {/* Left Side - Builder */}
        <div className="flex-1 border-r border-border bg-card p-6 md:p-10 overflow-auto flex flex-col">
          <div className="max-w-xl mx-auto w-full">
            <button onClick={() => window.history.back()} className="text-sm text-muted-foreground flex items-center gap-1 mb-8 hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <h1 className="text-3xl font-serif mb-2">Ask Them Out</h1>
            <p className="text-muted-foreground mb-8">Planning: {experience.title}</p>

            <div className="space-y-8">
              {step === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <h2 className="text-xl font-medium">What's the occasion? <span className="text-muted-foreground text-sm font-normal">(Optional)</span></h2>
                  <input
                    type="text"
                    placeholder="e.g. Celebrating our anniversary, or just because"
                    className="w-full p-4 rounded-xl border border-border bg-background"
                    value={inviteData.purpose}
                    onChange={e => setInviteData({ ...inviteData, purpose: e.target.value })}
                  />
                  <button
                    onClick={() => setStep(2)}
                    className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-medium"
                  >
                    Next Step
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <h2 className="text-xl font-medium">When do you want to go?</h2>

                  <div className="space-y-3">
                    <label className={cn(
                      "flex items-center justify-between p-4 rounded-xl border cursor-pointer",
                      inviteData.proposedDateFlexible ? "border-primary bg-primary/5" : "border-border bg-card"
                    )}>
                      <div>
                        <div className="font-medium text-foreground mb-1">Flexible Date</div>
                        <div className="text-sm text-muted-foreground">Suggest a timeframe rather than an exact day</div>
                      </div>
                      <input type="radio" className="w-5 h-5 accent-primary" checked={inviteData.proposedDateFlexible} onChange={() => setInviteData({ ...inviteData, proposedDateFlexible: true })} />
                    </label>

                    <label className={cn(
                      "flex items-center justify-between p-4 rounded-xl border cursor-pointer",
                      !inviteData.proposedDateFlexible ? "border-primary bg-primary/5" : "border-border bg-card"
                    )}>
                      <div>
                        <div className="font-medium text-foreground mb-1">Exact Date</div>
                        <div className="text-sm text-muted-foreground">Propose a specific day and time</div>
                      </div>
                      <input type="radio" className="w-5 h-5 accent-primary" checked={!inviteData.proposedDateFlexible} onChange={() => setInviteData({ ...inviteData, proposedDateFlexible: false })} />
                    </label>
                  </div>

                  {!inviteData.proposedDateFlexible && (
                    <div className="pt-4 animate-in slide-in-from-top-2">
                      <input type="datetime-local" className="w-full p-4 rounded-xl border border-border bg-background"
                        value={inviteData.proposedDate}
                        onChange={e => setInviteData({ ...inviteData, proposedDate: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="flex gap-4 pt-6">
                    <button onClick={() => setStep(1)} className="px-6 py-4 rounded-xl bg-secondary text-secondary-foreground font-medium">Back</button>
                    <button onClick={() => setStep(3)} className="flex-1 py-4 rounded-xl bg-primary text-primary-foreground font-medium">Next Step</button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <h2 className="text-xl font-medium">How much to reveal?</h2>

                  <div className="space-y-4">
                    {[
                      { id: "full", label: "Full Details", desc: "Show everything: title, location, and description." },
                      { id: "partial", label: "Partial Reveal", desc: "Hide the specific venue but show the activity type." },
                      { id: "hidden", label: "Surprise Mode", desc: "Show only safety info (duration, dress code). Hide the rest." }
                    ].map(opt => (
                      <label key={opt.id} className={cn(
                        "flex items-start gap-4 p-5 rounded-xl border cursor-pointer transition-all",
                        inviteData.detailLevel === opt.id ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card hover:bg-secondary/50"
                      )}>
                        <input type="radio" name="detail" className="w-5 h-5 mt-0.5 accent-primary"
                          checked={inviteData.detailLevel === opt.id}
                          onChange={() => setInviteData({ ...inviteData, detailLevel: opt.id as any, isSurprise: opt.id === "hidden" })}
                        />
                        <div>
                          <div className="font-medium text-foreground mb-1">{opt.label}</div>
                          <div className="text-sm text-muted-foreground">{opt.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div className="pt-6 border-t border-border">
                    <h2 className="text-xl font-medium mb-4">Add a message</h2>
                    <textarea
                      placeholder="Write something nice..."
                      rows={4}
                      className="w-full p-4 rounded-xl border border-border bg-background resize-none"
                      value={inviteData.message}
                      onChange={e => setInviteData({ ...inviteData, message: e.target.value })}
                    />
                  </div>

                  <div className="flex gap-4 pt-6">
                    <button onClick={() => setStep(2)} className="px-6 py-4 rounded-xl bg-secondary text-secondary-foreground font-medium">Back</button>
                    <button
                      onClick={() => {
                        createInvite.mutate({
                          data: {
                            inviterId: user?.id !== undefined ? String(user.id) : '',
                            inviteeIds: inviteData.inviteeIds,
                            experienceId: experience.id,
                            purpose: inviteData.purpose,
                            proposedDate: inviteData.proposedDate || undefined,
                            proposedDateFlexible: inviteData.proposedDateFlexible,
                            detailLevel: inviteData.detailLevel,
                            isSurprise: inviteData.isSurprise,
                            message: inviteData.message,
                          }
                        }, {
                          onSuccess: (res: any) => {
                            setLocation(`/together/invitations/${res.id}`);
                          }
                        });
                      }}
                      disabled={createInvite.isPending}
                      className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl bg-primary text-primary-foreground font-medium disabled:opacity-50"
                    >
                      {createInvite.isPending ? "Sending..." : "Send Invitation"} <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side - Preview */}
        <div className="hidden md:flex w-[400px] lg:w-[500px] bg-muted/30 p-10 flex-col items-center justify-center relative border-l border-border">
          <div className="absolute top-6 left-6 text-xs font-medium text-muted-foreground uppercase tracking-widest">
            Live Preview (What they see)
          </div>

          <div className="w-full bg-card rounded-2xl shadow-xl border border-border overflow-hidden rotate-[-1deg] transition-all duration-500 hover:rotate-0">
            <div className="h-40 bg-muted relative">
              {inviteData.detailLevel === 'hidden' ? (
                <div className="absolute inset-0 bg-primary/20 flex items-center justify-center flex-col gap-2">
                  <Sparkles className="w-8 h-8 text-primary" />
                  <span className="font-serif text-lg text-primary">Surprise Experience</span>
                </div>
              ) : (
                <img src={experience.imageUrl} className="w-full h-full object-cover" alt="Preview" />
              )}
            </div>
            <div className="p-6">
              <div className="flex gap-2 mb-4">
                <span className="px-2 py-1 rounded bg-secondary text-secondary-foreground text-[10px] uppercase font-bold tracking-wider">Invitation</span>
                {inviteData.isSurprise && <span className="px-2 py-1 rounded bg-accent/20 text-accent-foreground text-[10px] uppercase font-bold tracking-wider">Surprise Mode</span>}
              </div>

              <h3 className="text-2xl font-serif mb-2">
                {inviteData.detailLevel === 'hidden' ? "A Surprise Date is Waiting" : experience.title}
              </h3>

              {inviteData.purpose && (
                <p className="text-sm italic text-muted-foreground mb-6">"{inviteData.purpose}"</p>
              )}

              <div className="space-y-3 text-sm border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">From</span>
                  <span className="font-medium">{user?.displayName ?? ''}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Timing</span>
                  <span className="font-medium">
                    {inviteData.proposedDateFlexible ? "Sometime flexible" : inviteData.proposedDate ? new Date(inviteData.proposedDate).toLocaleString() : "TBD"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{experience.durationMinutes} mins</span>
                </div>
              </div>

              {inviteData.message && (
                <div className="mt-6 p-4 bg-secondary/50 rounded-xl text-sm italic">
                  "{inviteData.message}"
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Normal detail view
  return (
    <div className="max-w-4xl mx-auto w-full pb-20">
      <div className="relative h-64 md:h-96 w-full">
        <button onClick={() => window.history.back()} className="absolute top-6 left-6 z-20 w-10 h-10 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img src={experience.imageUrl} className="w-full h-full object-cover" alt={experience.title} />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

        <div className="absolute bottom-6 left-6 right-6 md:left-10 md:right-10 flex flex-col items-start gap-4">
          <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-medium border border-white/10 uppercase tracking-wider shadow-sm">
            {experience.category || 'Experience'}
          </span>
          <h1 className="text-3xl md:text-5xl font-serif text-foreground">{experience.title}</h1>
        </div>
      </div>

      <div className="p-6 md:p-10 grid md:grid-cols-3 gap-10">
        <div className="md:col-span-2 space-y-10">
          <div className="flex flex-wrap gap-4 text-sm font-medium p-5 rounded-2xl bg-secondary/30 border border-secondary/50">
            <div className="flex items-center gap-2 text-foreground">
              <Clock className="w-4 h-4 text-muted-foreground" /> {experience.durationMinutes} mins
            </div>
            <div className="w-px h-4 bg-border hidden sm:block" />
            <div className="flex items-center gap-2 text-foreground">
              <DollarSign className="w-4 h-4 text-muted-foreground" /> {experience.costEstimate} estimated
            </div>
            {experience.distanceMiles && (
              <>
                <div className="w-px h-4 bg-border hidden sm:block" />
                <div className="flex items-center gap-2 text-foreground">
                  <MapPin className="w-4 h-4 text-muted-foreground" /> {experience.distanceMiles} miles away
                </div>
              </>
            )}
            <div className="w-px h-4 bg-border hidden sm:block" />
            <div className="flex items-center gap-2 text-foreground capitalize">
              <Zap className="w-4 h-4 text-muted-foreground" /> {experience.energyLevel} energy
            </div>
          </div>

          <section>
            <h2 className="text-xl font-serif mb-4">Why it fits</h2>
            <div className="bg-primary/5 border-l-4 border-primary p-5 rounded-r-xl font-medium italic text-lg leading-relaxed text-foreground">
              "{experience.whyItFits}"
            </div>
            {experience.privacySafeSource && (
              <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                {experience.privacySafeSource}
              </p>
            )}
          </section>

          <section>
            <h2 className="text-xl font-serif mb-4">About this experience</h2>
            <p className="text-muted-foreground leading-relaxed">{experience.description}</p>
          </section>

          {(experience.weatherConsideration || experience.accessibilityNotes || experience.needsChildcare) && (
            <section className="p-6 border border-border rounded-2xl bg-card space-y-4">
              <h2 className="text-sm font-medium text-foreground uppercase tracking-wider">Logistics to consider</h2>
              <ul className="space-y-3">
                {experience.needsChildcare && (
                  <li className="flex items-start gap-3 text-sm text-muted-foreground">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>Requires childcare arrangements.</span>
                  </li>
                )}
                {experience.weatherConsideration && (
                  <li className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>Weather dependent: {experience.weatherConsideration}</span>
                  </li>
                )}
                {experience.accessibilityNotes && (
                  <li className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>Accessibility: {experience.accessibilityNotes}</span>
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <div className="sticky top-24 border border-border bg-card rounded-2xl p-6 shadow-sm">
            <h3 className="font-serif text-xl mb-4">Ready to plan?</h3>
            <p className="text-sm text-muted-foreground mb-6">Take the mental load off and send a thoughtful invitation.</p>

            <div className="space-y-3">
              <Link
                href={`/together/experiences/${experience.id}?action=invite`}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shadow-sm"
              >
                Ask Them Out <ChevronRight className="w-4 h-4" />
              </Link>

              <button className="w-full py-3 rounded-xl border border-border bg-card text-foreground font-medium hover:bg-secondary transition-colors">
                Save to Shortlist
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-border flex flex-col gap-2 text-xs text-muted-foreground">
              <span className="flex items-center justify-between">
                Planning Effort <span className="font-medium text-foreground capitalize">{experience.planningEffort}</span>
              </span>
              <span className="flex items-center justify-between">
                Surprise Eligible <span className="font-medium text-foreground">{experience.surpriseEligible ? 'Yes' : 'No'}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
