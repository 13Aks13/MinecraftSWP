import type { AuthUserDto } from "@mc/shared";
import { create } from "zustand";

export type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthState {
  user: AuthUserDto | null;
  status: AuthStatus;
  setUser: (user: AuthUserDto) => void;
  clear: () => void;
}

/**
 * The access token lives in an HttpOnly cookie and is never exposed to
 * JavaScript. Only the public user profile is kept in memory.
 */
export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: "loading",
  setUser: (user) => set({ user, status: "authenticated" }),
  clear: () => set({ user: null, status: "anonymous" }),
}));

export function canWrite(role: AuthUserDto["role"] | undefined): boolean {
  return role === "admin" || role === "moderator";
}
