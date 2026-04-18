import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import Layout from "./components/Layout";
import AppRoutes from "./AppRoutes";
import AccessibilityProvider from "./components/AccessibilityProvider";
const queryClient = new QueryClient();

function AuthenticatedApp() {
  return (
    <BrowserRouter>
      <Layout>
        <AppRoutes />
      </Layout>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AccessibilityProvider>
        <Toaster />
        <Sonner />
        <AuthenticatedApp />
      </AccessibilityProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
