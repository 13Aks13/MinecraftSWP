import type { ApiErrorBody } from "@mc/shared";
import axios, { type AxiosError } from "axios";
import { useAuthStore } from "../store/auth";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api/v1",
  timeout: 60_000,
  // The session is an HttpOnly cookie, so send it with every same-origin call.
  withCredentials: true,
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const url = error.config?.url ?? "";
    // Do not treat a failed login or session bootstrap as "session expired".
    if (error.response?.status === 401 && !url.startsWith("/auth/")) {
      useAuthStore.getState().clear();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login");
      }
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) {
      return message.join(", ");
    }
    if (message) {
      return message;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "Unexpected error";
}

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

export async function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
) {
  return api.post(url, formData, {
    timeout: UPLOAD_TIMEOUT_MS,
    onUploadProgress: (event) => {
      if (!onProgress || !event.total) {
        return;
      }
      // Keep a small gap so the bar does not claim completion while the
      // server is still extracting/installing the bundle.
      onProgress(Math.min(95, Math.round((event.loaded / event.total) * 100)));
    },
  });
}
