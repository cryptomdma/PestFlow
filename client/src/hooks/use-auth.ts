import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import type { User } from "@shared/schema";
import { setPermissionMatrix, type PermissionMatrixEntry } from "@shared/permissions";

const AUTH_QUERY_KEY = ["/api/auth/me"];

/** What /api/auth/me and the login answer carry: the user (never the hash) plus the org's active role profiles (Pass 37, C5.6). */
export type AuthUser = Omit<User, "passwordHash"> & { roleProfiles?: PermissionMatrixEntry[] };

const fetchAuthUser = getQueryFn<AuthUser | null>({ on401: "returnNull" });

// Pass 37 (C5.6): the permission registry can() reads is filled from the
// payload BEFORE React Query commits it to the cache, so the first render
// that knows the user already reads the org's matrix (an effect would run one
// render late, and nothing would re-render when it set the registry). Every
// can() on the client stays `can(user?.role ?? "", ...)` - the role is a
// profile key and the registry answers for it. The Roles / Users cards
// invalidate this read after a write, which refetches and refills; logging
// out clears it (the built-in defaults answer until the next login).
function applyRoleProfiles(user: AuthUser | null | undefined) {
  setPermissionMatrix(user?.roleProfiles ?? null);
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async (context) => {
      const me = await fetchAuthUser(context);
      applyRoleProfiles(me);
      return me;
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", credentials);
      return (await res.json()) as AuthUser;
    },
    onSuccess: (loggedInUser) => {
      applyRoleProfiles(loggedInUser);
      queryClient.setQueryData(AUTH_QUERY_KEY, loggedInUser);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      applyRoleProfiles(null);
      queryClient.setQueryData(AUTH_QUERY_KEY, null);
      queryClient.clear();
    },
  });

  return {
    user: user ?? null,
    isLoading,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error as Error | null,
    logout: logoutMutation.mutateAsync,
  };
}
