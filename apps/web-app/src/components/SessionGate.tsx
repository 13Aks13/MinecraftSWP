import { Spin } from "antd";
import { type ReactNode, useEffect } from "react";
import { me } from "../api/auth";
import { useAuthStore } from "../store/auth";

/**
 * Restores the session from the HttpOnly cookie once per page load. The UI is
 * not rendered until we know whether the user is authenticated, which avoids
 * flashing the login page or firing unauthenticated API requests.
 */
export default function SessionGate({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status);
  const setUser = useAuthStore((state) => state.setUser);
  const clear = useAuthStore((state) => state.clear);

  useEffect(() => {
    let active = true;
    me()
      .then((user) => {
        if (active) {
          setUser(user);
        }
      })
      .catch(() => {
        if (active) {
          clear();
        }
      });
    return () => {
      active = false;
    };
  }, [clear, setUser]);

  if (status === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spin size="large" />
      </div>
    );
  }

  return <>{children}</>;
}
