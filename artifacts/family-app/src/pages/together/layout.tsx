import { useState } from "react";
import { useLocation, Route, Switch } from "wouter";
import { cn } from "@/lib/utils";

import DiscoverTab from "./tabs/discover";
import ShortlistTab from "./tabs/shortlist";
import InvitationsTab from "./tabs/invitations";
import CalendarTab from "./tabs/calendar";
import MemoriesTab from "./tabs/memories";
import ProfilesTab from "./tabs/profiles";

const TABS = [
  { id: "discover", label: "Discover", path: "/together" },
  { id: "shortlist", label: "Shortlist", path: "/together/shortlist" },
  { id: "invitations", label: "Invitations", path: "/together/invitations" },
  { id: "calendar", label: "Calendar", path: "/together/calendar" },
  { id: "memories", label: "Memories", path: "/together/memories" },
  { id: "profiles", label: "Profiles", path: "/together/profiles" },
];

export default function TogetherLayout() {
  const [location, setLocation] = useLocation();

  // Find active tab based on exact match or prefix for nested routes
  const activeTabId = TABS.find(t => 
    t.path === "/together" ? location === "/together" : location.startsWith(t.path)
  )?.id || "discover";

  return (
    <div className="flex flex-col h-full w-full max-w-6xl mx-auto">
      <header className="px-6 pt-8 pb-4 md:px-10 md:pt-10 md:pb-6">
        <h1 className="text-3xl md:text-4xl font-serif text-foreground mb-6">Together</h1>
        
        <div className="overflow-x-auto no-scrollbar -mx-6 px-6 md:mx-0 md:px-0">
          <nav className="flex space-x-1 border-b border-border min-w-max pb-px">
            {TABS.map((tab) => {
              const isActive = activeTabId === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setLocation(tab.path)}
                  className={cn(
                    "px-4 py-2.5 text-sm font-medium transition-colors relative border-b-2",
                    isActive 
                      ? "text-primary border-primary" 
                      : "text-muted-foreground border-transparent hover:text-foreground hover:border-border"
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Switch>
          <Route path="/together" component={DiscoverTab} />
          <Route path="/together/shortlist" component={ShortlistTab} />
          <Route path="/together/invitations" component={InvitationsTab} />
          <Route path="/together/calendar" component={CalendarTab} />
          <Route path="/together/memories" component={MemoriesTab} />
          <Route path="/together/profiles" component={ProfilesTab} />
        </Switch>
      </main>
    </div>
  );
}
