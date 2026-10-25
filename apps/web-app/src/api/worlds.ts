import type { CreateWorldDto, Paginated, WorldDto } from "@mc/shared";
import { api } from "./client";

export interface ListWorldsParams {
  search?: string;
  page?: number;
  limit?: number;
}

export async function listWorlds(params: ListWorldsParams): Promise<Paginated<WorldDto>> {
  const { data } = await api.get<Paginated<WorldDto>>("/worlds", { params });
  return data;
}

export async function createWorld(payload: CreateWorldDto): Promise<WorldDto> {
  const { data } = await api.post<WorldDto>("/worlds", payload);
  return data;
}

export async function activateWorld(id: string): Promise<WorldDto> {
  const { data } = await api.post<WorldDto>(`/worlds/${id}/activate`);
  return data;
}

export async function updateWorldPacks(
  id: string,
  payload: Pick<CreateWorldDto, "resourcePackIds" | "behaviorPackIds">,
): Promise<WorldDto> {
  const { data } = await api.put<WorldDto>(`/worlds/${id}/packs`, payload);
  return data;
}

export async function cloneWorld(id: string): Promise<WorldDto> {
  const { data } = await api.post<WorldDto>(`/worlds/${id}/clone`);
  return data;
}

export async function deleteWorld(id: string): Promise<void> {
  await api.delete(`/worlds/${id}`);
}
