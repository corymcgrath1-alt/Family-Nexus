import React from "react";
import { Link } from "wouter";
import { Calendar, CheckCircle2, Clock, MapPin, Search } from "lucide-react";
import { useGetTodaySummary, useUpdatePlanningTask } from "@workspace/api-client-react";
import { useViewerStore } from "@/store/viewer";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

export default function TodayPage() {
  const { viewerId } = useViewerStore();
  const { data: summary, isLoading } = useGetTodaySummary({ viewerId }, { query: { enabled: !!viewerId, queryKey: ["today", viewerId] } });
  
  const updateTask = useUpdatePlanningTask();

  if (isLoading) {
    return <div className="p-6 md:p-12 animate-pulse flex flex-col gap-6">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="h-64 bg-muted rounded-xl"></div>
      <div className="h-24 bg-muted rounded-xl"></div>
    </div>;
  }

  if (!summary) return null;

  return (
    <div className="flex-1 p-6 md:p-10 lg:p-12 max-w-4xl mx-auto w-full space-y-10">
      <header>
        <h1 className="text-3xl md:text-4xl font-serif text-foreground mb-2">Good morning, {viewerId}.</h1>
        <p className="text-muted-foreground font-medium">It's {new Date(summary.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.</p>
      </header>

      {/* Featured Experience */}
      <section>
        <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase mb-4">Recommended for You</h2>
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="group relative overflow-hidden rounded-2xl bg-card border border-border shadow-sm hover-elevate transition-all"
        >
          <div className="aspect-[21/9] sm:aspect-[21/8] bg-muted relative overflow-hidden">
            <img 
              src={summary.featuredExperience.imageUrl} 
              alt={summary.featuredExperience.title}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 p-5 md:p-6 text-white">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-medium">
                  {summary.featuredExperience.category || 'Experience'}
                </span>
                <span className="flex items-center text-xs gap-1 text-white/90">
                  <Clock className="w-3.5 h-3.5" />
                  {summary.featuredExperience.durationMinutes} min
                </span>
              </div>
              <h3 className="text-2xl font-serif font-medium">{summary.featuredExperience.title}</h3>
            </div>
          </div>
          
          <div className="p-5 md:p-6 flex flex-col md:flex-row gap-6 md:items-center justify-between bg-card relative z-10">
            <div className="flex-1">
              <p className="text-foreground text-sm font-medium mb-1">Why it fits right now:</p>
              <p className="text-muted-foreground text-sm leading-relaxed">{summary.featuredExperience.whyItFits}</p>
            </div>
            <Link 
              href={`/together/experiences/${summary.featuredExperience.id}?action=invite`}
              className="shrink-0 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-medium text-sm text-center hover:bg-primary/90 transition-colors"
            >
              Ask Them Out
            </Link>
          </div>
        </motion.div>
      </section>

      <div className="grid md:grid-cols-2 gap-6 md:gap-8">
        {/* Next Calendar Event */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Up Next</h2>
          {summary.upcomingCalendarEvent ? (
            <div className="p-5 rounded-xl border border-border bg-card flex gap-4">
              <div className="flex flex-col items-center justify-center w-12 h-12 bg-secondary rounded-lg text-secondary-foreground shrink-0">
                <span className="text-xs font-bold uppercase">{new Date(summary.upcomingCalendarEvent.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                <span className="text-lg font-serif leading-none">{new Date(summary.upcomingCalendarEvent.date).getDate()}</span>
              </div>
              <div>
                <h4 className="font-medium text-foreground">{summary.upcomingCalendarEvent.title}</h4>
                <div className="flex items-center text-xs text-muted-foreground mt-1 gap-3">
                  {summary.upcomingCalendarEvent.time && (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {summary.upcomingCalendarEvent.time}</span>
                  )}
                  {summary.upcomingCalendarEvent.location && (
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {summary.upcomingCalendarEvent.location}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl border border-dashed border-border text-center text-muted-foreground text-sm">
              Nothing on the calendar yet.
            </div>
          )}
        </section>

        {/* Pending Invitation */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Pending</h2>
          {summary.pendingInvitation ? (
            <div className="p-5 rounded-xl border border-accent/40 bg-accent/5 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <h4 className="font-medium text-foreground">{summary.pendingInvitation.experienceTitle || 'New Invitation'}</h4>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-accent/20 text-accent-foreground">
                  {summary.pendingInvitation.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-1">{summary.pendingInvitation.message || summary.pendingInvitation.purpose}</p>
              <Link 
                href={`/together/invitations/${summary.pendingInvitation.id}`}
                className="text-sm font-medium text-primary hover:underline mt-1 self-start"
              >
                View Invitation &rarr;
              </Link>
            </div>
          ) : (
            <div className="p-5 rounded-xl border border-dashed border-border text-center text-muted-foreground text-sm">
              No pending invitations.
            </div>
          )}
        </section>
      </div>

      {/* Urgent Planning Task */}
      {summary.urgentPlanningTask && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">Needs Attention</h2>
          <div className="p-4 rounded-xl border border-border bg-card flex items-start gap-3">
            <button 
              onClick={() => updateTask.mutate({ id: summary.urgentPlanningTask.id, data: { completed: !summary.urgentPlanningTask.completed } })}
              className={cn(
                "mt-0.5 w-5 h-5 rounded-full border flex items-center justify-center transition-colors shrink-0",
                summary.urgentPlanningTask.completed ? "bg-primary border-primary text-white" : "border-muted-foreground/40 hover:border-primary"
              )}
            >
              {summary.urgentPlanningTask.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
            </button>
            <div className="flex-1">
              <p className={cn("text-sm font-medium transition-all", summary.urgentPlanningTask.completed && "text-muted-foreground line-through")}>
                {summary.urgentPlanningTask.title}
              </p>
              {summary.urgentPlanningTask.dueDate && (
                <p className="text-xs text-destructive mt-1">Due {new Date(summary.urgentPlanningTask.dueDate).toLocaleDateString()}</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Quick Actions */}
      <section className="pt-4 border-t border-border/50">
        <div className="flex flex-wrap gap-2">
          {summary.quickActions.map(action => (
            <Link 
              key={action.id} 
              href={action.action}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
              {action.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
