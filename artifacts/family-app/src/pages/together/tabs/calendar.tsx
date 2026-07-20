import React from "react";
import { useListCalendarEvents, useListPlanningTasks } from "@workspace/api-client-react";
import { Calendar as CalendarIcon, Clock, MapPin } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

export default function CalendarTab() {
  const { data: events, isLoading } = useListCalendarEvents();

  if (isLoading) return <div className="p-6">Loading calendar...</div>;

  const today = new Date();
  const start = startOfMonth(today);
  const end = endOfMonth(today);
  const days = eachDayOfInterval({ start, end });

  // Group events by date string (YYYY-MM-DD)
  const eventsByDate = events?.reduce((acc: any, event) => {
    const dateStr = event.date.split('T')[0];
    if (!acc[dateStr]) acc[dateStr] = [];
    acc[dateStr].push(event);
    return acc;
  }, {}) || {};

  return (
    <div className="p-6 md:p-10 pt-0 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-serif">{format(today, "MMMM yyyy")}</h2>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 text-sm bg-secondary rounded-md">Today</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
            {day}
          </div>
        ))}
        
        {/* Pad start of month */}
        {Array.from({ length: start.getDay() }).map((_, i) => (
          <div key={`pad-${i}`} className="bg-card min-h-[100px] opacity-50" />
        ))}

        {days.map(day => {
          const dateStr = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDate[dateStr] || [];
          const isToday = isSameDay(day, today);

          return (
            <div key={dateStr} className="bg-card min-h-[100px] p-2 hover:bg-muted/30 transition-colors">
              <span className={cn(
                "inline-flex w-6 h-6 items-center justify-center rounded-full text-xs font-medium",
                isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}>
                {format(day, "d")}
              </span>
              
              <div className="mt-2 space-y-1">
                {dayEvents.map((event: any) => (
                  <div key={event.id} className="text-[10px] leading-tight p-1.5 bg-accent/20 text-accent-foreground rounded border border-accent/30 font-medium truncate">
                    {event.time && <span className="opacity-70 mr-1">{event.time}</span>}
                    {event.title}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {events && events.length > 0 && (
        <div className="mt-10">
          <h3 className="font-serif text-lg mb-4">Upcoming Events</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {events.slice(0, 4).map(event => (
              <div key={event.id} className="p-4 rounded-xl border border-border bg-card flex gap-4">
                 <div className="flex flex-col items-center justify-center w-12 h-12 bg-secondary rounded-lg text-secondary-foreground shrink-0">
                  <span className="text-[10px] font-bold uppercase">{format(parseISO(event.date), "MMM")}</span>
                  <span className="text-lg font-serif leading-none">{format(parseISO(event.date), "d")}</span>
                </div>
                <div>
                  <h4 className="font-medium text-foreground">{event.title}</h4>
                  <div className="flex flex-wrap items-center text-xs text-muted-foreground mt-1.5 gap-3">
                    {event.time && (
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3"/> {event.time}</span>
                    )}
                    {event.location && (
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {event.location}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
