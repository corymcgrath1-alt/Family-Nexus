import React from "react";
import { Link, useLocation } from "wouter";
import { Home, MessageCircle, Compass, Home as HomeIcon, Lock, Shield, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { apiGetUnreadCounts } from "@/lib/api";
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { path: "/", label: "Today", icon: Home },
  { path: "/messages", label: "Messages", icon: MessageCircle },
  { path: "/together", label: "Together", icon: Compass },
  { path: "/household", label: "Household", icon: HomeIcon },
  { path: "/vault", label: "Vault", icon: Lock },
  { path: "/privacy", label: "Privacy", icon: Shield },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [unreadCounts, setUnreadCounts] = React.useState({ messages: 0, invitations: 0, notifications: 0 });

  React.useEffect(() => {
    const poll = async () => {
      try {
        const c = await apiGetUnreadCounts();
        setUnreadCounts(c);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col md:flex-row min-h-[100dvh] bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar shrink-0 p-4">
        <div className="flex flex-col items-start mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-primary text-primary-foreground flex items-center justify-center font-serif font-bold text-lg">
              L
            </div>
            <span className="font-serif text-xl font-semibold text-sidebar-foreground">{PRODUCT_NAME}</span>
          </div>
          <span className="text-xs text-muted-foreground/60 font-sans mt-1 ml-11">{PRODUCT_DESCRIPTOR}</span>
        </div>

        {/* User identity block */}
        <div className="px-3 mb-4">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-sidebar-accent/30">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
              style={{ backgroundColor: user?.color ?? '#4A7C59' }}
            >
              {user?.avatarInitials ?? '??'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.displayName ?? ''}</p>
              <p className="text-xs text-muted-foreground capitalize">{user?.role ?? ''}</p>
            </div>
          </div>
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
                {item.path === "/messages" && unreadCounts.messages > 0 && (
                  <span className="ml-auto text-xs bg-[#4A7C59] text-white rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                    {unreadCounts.messages}
                  </span>
                )}
                {item.path === "/together" && unreadCounts.invitations > 0 && (
                  <span className="ml-auto text-xs bg-[#4A7C59] text-white rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                    {unreadCounts.invitations}
                  </span>
                )}
              </Link>
            );
          })}

          <button
            onClick={() => logout()}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/30 rounded-lg transition-colors mt-2"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0 overflow-auto">
        <header className="md:hidden sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
          <span className="font-serif text-lg font-semibold">{PRODUCT_NAME}</span>
          <div className="flex gap-2">
            {user && (
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                style={{ backgroundColor: user.color ?? '#4A7C59' }}
              >
                {user.avatarInitials}
              </div>
            )}
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
              "flex flex-col items-center p-2 rounded-xl min-w-16 gap-1 relative",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}>
              <item.icon className={cn("w-5 h-5", isActive && "fill-primary/20")} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.path === "/messages" && unreadCounts.messages > 0 && (
                <span className="absolute top-1 right-1 text-[10px] bg-[#4A7C59] text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCounts.messages}
                </span>
              )}
              {item.path === "/together" && unreadCounts.invitations > 0 && (
                <span className="absolute top-1 right-1 text-[10px] bg-[#4A7C59] text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {unreadCounts.invitations}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
