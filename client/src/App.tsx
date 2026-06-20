import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/Landing";
import ConferenceRoom from "@/pages/ConferenceRoom";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    const uid = localStorage.getItem("zq_uid");
    if (!uid) navigate("/");
  }, [navigate]);
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/workspace">
        <AuthGuard><ConferenceRoom /></AuthGuard>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
