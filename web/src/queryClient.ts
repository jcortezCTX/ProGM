import { QueryClient } from "@tanstack/react-query";

// Internal, low-traffic ops tool: refetching on every window focus is more
// disruptive (resets scroll/loaded pages mid data-entry) than useful here.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
