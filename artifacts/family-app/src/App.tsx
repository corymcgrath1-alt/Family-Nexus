import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter, Redirect } from 'wouter';
import { AuthProvider, useAuth } from '@/lib/auth';

// Layouts
import { AppShell } from '@/components/layout/AppShell';

// Pages
import TodayPage from '@/pages/today';
import MessagesPage from '@/pages/messages';
import HouseholdPage from '@/pages/household';
import VaultPage from '@/pages/vault';
import PrivacyPage from '@/pages/privacy';
import LibraryPage from '@/pages/library';

// Auth Pages
import LoginPage from '@/pages/auth/login';
import RegisterPage from '@/pages/auth/register';
import JoinPage from '@/pages/auth/join';

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

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading)
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin h-8 w-8 border-4 border-[#4A7C59] border-t-transparent rounded-full" />
      </div>
    );
  if (!isAuthenticated) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      {/* Public auth routes */}
      <Route path="/login" component={LoginPage} />
      <Route path="/register" component={RegisterPage} />
      <Route path="/join/:token" component={JoinPage} />

      {/* Protected routes inside AppShell */}
      <Route>
        <AppShell>
          <Switch>
            <Route path="/" component={() => <ProtectedRoute component={TodayPage} />} />
            <Route path="/messages" component={() => <ProtectedRoute component={MessagesPage} />} />
            <Route path="/family" component={() => <ProtectedRoute component={HouseholdPage} />} />
            <Route path="/household" component={() => <ProtectedRoute component={HouseholdPage} />} />
            <Route path="/library" component={() => <ProtectedRoute component={LibraryPage} />} />
            <Route path="/vault" component={() => <ProtectedRoute component={VaultPage} />} />
            <Route path="/privacy" component={() => <ProtectedRoute component={PrivacyPage} />} />

            {/* Detail routes first */}
            <Route path="/together/experiences/:id" component={() => <ProtectedRoute component={ExperienceDetailPage} />} />
            <Route path="/together/invitations/:id" component={() => <ProtectedRoute component={InvitationDetailPage} />} />

            {/* Together layout wrapper for tabs */}
            <Route path="/together" component={() => <ProtectedRoute component={TogetherLayout} />} />
            <Route path="/together/:tab" component={() => <ProtectedRoute component={TogetherLayout} />} />

            <Route component={NotFound} />
          </Switch>
        </AppShell>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <AuthProvider>
            <Router />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
