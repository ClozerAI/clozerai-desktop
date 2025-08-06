import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import './styles.css';
import { TRPCReactProvider } from './lib/trpc/react';

const queryClient = new QueryClient();

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(
  <TRPCReactProvider>
    <QueryClientProvider client={queryClient}>
      <Toaster
        toastOptions={{
          style: {
            backgroundColor: 'black',
            color: 'white',
            opacity: 0.7,
            border: 'none',
          },
        }}
      />
      <App />
    </QueryClientProvider>
  </TRPCReactProvider>,
);
