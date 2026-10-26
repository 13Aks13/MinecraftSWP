import type { AuthUserDto } from "@mc/shared";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  user: AuthUserDto | null;
  setAuth: (token: string, user: AuthUserDto) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: "mc-platform-auth",
      version: 2,
    },
  ),
);

export function canWrite(role: AuthUserDto["role"] | undefined): boolean {
  return role === "admin" || role === "moderator";
}
