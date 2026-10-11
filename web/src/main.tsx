import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from './lib/api';
import { BusinessProvider } from './lib/business';
import { AuthProvider } from './lib/auth';
import { ToastProvider, WakeBanner } from './components/ui';
import App from './App';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <BusinessProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
              <WakeBanner />
            </ToastProvider>
          </AuthProvider>
        </BusinessProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
