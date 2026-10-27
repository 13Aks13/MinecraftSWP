import type { AuthUserDto, LoginResponseDto } from "@mc/shared";
import { api } from "./client";

export async function login(email: string, password: string): Promise<LoginResponseDto> {
  const { data } = await api.post<LoginResponseDto>("/auth/login", { email, password });
  return data;
}

export async function me(): Promise<AuthUserDto> {
  const { data } = await api.get<AuthUserDto>("/auth/me");
  return data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post("/auth/change-password", { currentPassword, newPassword });
}
