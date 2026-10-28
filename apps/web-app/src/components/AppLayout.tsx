import {
  ApiOutlined,
  AppstoreOutlined,
  CloudServerOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  SwitcherOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Badge, Button, Dropdown, Layout, Menu, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { logout as logoutRequest } from "../api/auth";
import { getHealth } from "../api/health";
import { getServerStatus } from "../api/server";
import { useAuthStore } from "../store/auth";
import ChangePasswordModal from "./ChangePasswordModal";

const { Header, Sider, Content } = Layout;

const NAV_ITEMS = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "Dashboard" },
  { key: "/packs", icon: <AppstoreOutlined />, label: "Packs" },
  { key: "/worlds", icon: <DatabaseOutlined />, label: "Worlds" },
  { key: "/backups", icon: <CloudServerOutlined />, label: "Backups" },
  { key: "/logs", icon: <ApiOutlined />, label: "Logs" },
  { key: "/server", icon: <SwitcherOutlined />, label: "Server" },
  { key: "/settings", icon: <SettingOutlined />, label: "Settings" },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);

  const status = useQuery({
    queryKey: ["server-status"],
    queryFn: getServerStatus,
    refetchInterval: 15_000,
  });

  const health = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 60_000,
  });

  const selectedKey =
    NAV_ITEMS.find((item) => location.pathname.startsWith(item.key))?.key ?? "/dashboard";

  const serverState = status.data?.state ?? "unknown";
  const badgeStatus =
    serverState === "running" ? "success" : serverState === "unknown" ? "default" : "error";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        breakpoint="lg"
        collapsedWidth={64}
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{ background: "#12301f" }}
        width={224}
      >
        <div className="brand" style={{ padding: "18px 16px", color: "#fff" }}>
          <span className="brand-mark">⛏</span>
          {!collapsed && <span>MC Platform</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={NAV_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ background: "transparent", borderInlineEnd: "none" }}
        />
        {!collapsed && (
          <div
            style={{
              padding: "12px 16px",
              color: "rgba(255,255,255,0.65)",
              fontSize: 12,
              textAlign: "center",
            }}
          >
            <div>App v{health.data?.version ?? "—"}</div>
          </div>
        )}
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #e6ebe8",
          }}
        >
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
              aria-label="Toggle navigation"
            />
            <Badge status={badgeStatus} text={serverState.toUpperCase()} />
            <Tag color="green" style={{ marginInlineStart: 8 }}>
              {status.data?.containerName ?? "mc-bedrock"}
            </Tag>
          </Space>
          <Dropdown
            menu={{
              items: [
                {
                  key: "change-password",
                  icon: <KeyOutlined />,
                  label: "Change password",
                  onClick: () => setPasswordOpen(true),
                },
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  label: "Sign out",
                  onClick: () => {
                    void logoutRequest()
                      .catch(() => undefined)
                      .finally(() => {
                        clear();
                        navigate("/login");
                      });
                  },
                },
              ],
            }}
          >
            <Space style={{ cursor: "pointer" }}>
              <Avatar size={30} style={{ background: "#1f6f43" }}>
                {user?.email?.[0]?.toUpperCase() ?? "A"}
              </Avatar>
              <Typography.Text>{user?.email ?? "Administrator"}</Typography.Text>
              <Tag color="blue">{user?.role ?? "admin"}</Tag>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </Layout>
  );
}
