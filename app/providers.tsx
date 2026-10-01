"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { CelebrateProvider } from "@/components/gamify/Celebrate";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { mutations: { retry: false } } }));
  return (
    <QueryClientProvider client={client}>
      <CelebrateProvider>{children}</CelebrateProvider>
    </QueryClientProvider>
  );
}
