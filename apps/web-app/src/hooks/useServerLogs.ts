import { type LogLineDto, SOCKET_EVENTS } from "@mc/shared";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuthStore } from "../store/auth";

export function useServerLogs() {
  const user = useAuthStore((state) => state.user);
  const [lines, setLines] = useState<LogLineDto[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const socket = io("/logs", {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 5_000,
    });

    socket.on("connect", () => {
      setConnected(true);
      setError(null);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (connectionError) => {
      setConnected(false);
      setError(connectionError.message);
    });
    socket.on(SOCKET_EVENTS.logError, (payload: { message: string }) => {
      setError(payload.message);
    });
    socket.on(SOCKET_EVENTS.logLine, (line: LogLineDto) => {
      if (pausedRef.current) {
        return;
      }
      setLines((current) => {
        const next = [...current, line];
        return next.length > 3_000 ? next.slice(next.length - 3_000) : next;
      });
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [user]);

  const setPaused = (paused: boolean) => {
    pausedRef.current = paused;
  };

  return { lines, connected, error, setPaused, clear: () => setLines([]) };
}
