import type { UserRole } from "@mc/shared";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Token version; absent in tokens issued before it was introduced (treated as 0). */
  tv?: number;
  iat?: number;
  exp?: number;
}
