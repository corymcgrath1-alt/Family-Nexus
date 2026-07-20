import React from "react";
import { Link, useLocation } from "wouter";
import { Home, MessageCircle, Compass, Home as HomeIcon, Lock, Menu, User } from "lucide-react";
import { useViewerStore } from "@/store/viewer";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Today", icon: Home },
  { path: "/messages", label: "Messages", icon: MessageCircle },
  { path: "/together", label: "Together", icon: Compass },
  { path: "/household", label: "Household", icon: HomeIcon },
  { path: "/vault", label: "Vault", icon: Lock },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { viewerId, setViewerId } = useViewerStore();

  return (
    <div className="flex flex-col md:flex-row min-h-[100dvh] bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar shrink-0 p-4">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-serif font-bold text-lg">
            F
          </div>
          <span className="font-serif text-xl font-semibold text-sidebar-foreground">FamilySpace</span>
        </div>

        <nav className="flex-1 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            return (
              <Link key={item.path} href={item.path} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md transition-colors font-medium text-sm",
                isActive 
                  ? "bg-secondary text-secondary-foreground" 
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-secondary-foreground"
              )}>
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-border pt-4">
          <div className="px-2 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Viewing As
          </div>
          <div className="flex flex-col space-y-1">
            {(["alex", "morgan", "jamie"] as const).map(id => (
              <button
                key={id}
                onClick={() => setViewerId(id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left capitalize transition-colors",
                  viewerId === id 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-muted-foreground hover:bg-secondary"
                )}
              >
                <div className="w-6 h-6 rounded-full bg-border flex items-center justify-center text-xs">
                  {id[0]}
                </div>
                {id}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0 overflow-auto">
        <header className="md:hidden sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
          <span className="font-serif text-lg font-semibold">FamilySpace</span>
          <div className="flex gap-2">
            <select 
              value={viewerId}
              onChange={(e) => setViewerId(e.target.value as any)}
              className="text-xs border border-border rounded px-2 py-1 bg-transparent"
            >
              <option value="alex">Alex</option>
              <option value="morgan">Morgan</option>
              <option value="jamie">Jamie</option>
            </select>
          </div>
        </header>
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border flex items-center justify-around px-2 pb-safe pt-2 z-50">
        {NAV_ITEMS.map((item) => {
          const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
          return (
            <Link key={item.path} href={item.path} className={cn(
              "flex flex-col items-center p-2 rounded-xl min-w-16 gap-1",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}>
              <item.icon className={cn("w-5 h-5", isActive && "fill-primary/20")} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
