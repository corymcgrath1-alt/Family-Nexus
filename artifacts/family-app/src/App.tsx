import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

// Layouts
import { AppShell } from '@/components/layout/AppShell';

// Pages
import TodayPage from '@/pages/today';
import MessagesPage from '@/pages/messages';
import HouseholdPage from '@/pages/household';
import VaultPage from '@/pages/vault';

// Together Pages
import TogetherLayout from '@/pages/together/layout';
import ExperienceDetailPage from '@/pages/together/experience-detail';
import InvitationDetailPage from '@/pages/together/invitation-detail';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function Router() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={TodayPage} />
        <Route path="/messages" component={MessagesPage} />
        <Route path="/household" component={HouseholdPage} />
        <Route path="/vault" component={VaultPage} />
        
        {/* Detail routes first to match before layout catch-all */}
        <Route path="/together/experiences/:id" component={ExperienceDetailPage} />
        <Route path="/together/invitations/:id" component={InvitationDetailPage} />
        
        {/* Together layout wrapper for tabs */}
        <Route path="/together" component={TogetherLayout} />
        <Route path="/together/:tab" component={TogetherLayout} />
        
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
