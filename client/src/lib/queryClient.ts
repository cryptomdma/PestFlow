import { QueryClient, QueryFunction } from "@tanstack/react-query";

// A failed request, carrying the status and the parsed JSON body (when the
// server sent one) so a caller can branch on a structured `code` - the Q3
// "void the draft invoice?" prompt and the D3 pre-finalization confirmation
// both come back as 409s with a code and details. `message` keeps the exact
// "<status>: <body text>" shape every existing toast already renders.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    text: string,
  ) {
    super(`${status}: ${text}`);
    this.name = "ApiError";
  }
}

export function getApiErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { code?: unknown } | null;
  return typeof body?.code === "string" ? body.code : null;
}

/** The server's human-readable message when it sent one, else the raw error text. */
export function getApiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: unknown } | null;
    if (typeof body?.message === "string" && body.message) return body.message;
  }
  return err instanceof Error ? err.message : String(err);
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    throw new ApiError(res.status, body, text);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
