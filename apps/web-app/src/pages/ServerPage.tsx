import {
  DeleteOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import type { AllowListEntry } from "@mc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, App, Button, Card, Form, Input, Space, Spin, Table } from "antd";
import { useState } from "react";
import { errorMessage } from "../api/client";
import { addToAllowlist, clearAllowlist, getAllowlist, removeFromAllowlist } from "../api/server";
import { canWrite, useAuthStore } from "../store/auth";

export default function ServerPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = canWrite(role);

  const [form] = Form.useForm<AllowListEntry>();
  const [searchName, setSearchName] = useState("");

  const allowlist = useQuery({
    queryKey: ["allowlist"],
    queryFn: getAllowlist,
  });

  const addMutation = useMutation({
    mutationFn: addToAllowlist,
    onSuccess: () => {
      message.success("Player added to allowlist");
      form.resetFields();
      queryClient.invalidateQueries({ queryKey: ["allowlist"] });
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: removeFromAllowlist,
    onSuccess: () => {
      message.success("Player removed from allowlist");
      queryClient.invalidateQueries({ queryKey: ["allowlist"] });
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const clearMutation = useMutation({
    mutationFn: clearAllowlist,
    onSuccess: () => {
      message.success("Allowlist cleared");
      queryClient.invalidateQueries({ queryKey: ["allowlist"] });
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const onFinish = (values: AllowListEntry) => {
    addMutation.mutate(values);
  };

  const filteredEntries = (allowlist.data?.entries ?? []).filter((entry) =>
    entry.name.toLowerCase().includes(searchName.toLowerCase()),
  );

  const columns = [
    {
      title: "Player Name",
      dataIndex: "name",
      key: "name",
      width: "40%",
    },
    {
      title: "Xbox User ID (XUID)",
      dataIndex: "xuid",
      key: "xuid",
      width: "40%",
      render: (xuid: string | undefined) =>
        xuid ? <Code>{xuid}</Code> : <span style={{ color: "#999" }}>—</span>,
    },
    {
      title: "Actions",
      key: "actions",
      width: "20%",
      render: (_: unknown, record: AllowListEntry) => (
        <Space>
          <Button
            type="text"
            icon={<DeleteOutlined />}
            danger
            size="small"
            disabled={!canEdit}
            loading={removeMutation.isPending && removeMutation.variables === record.name}
            onClick={() =>
              modal.confirm({
                title: `Remove "${record.name}" from allowlist?`,
                okText: "Remove",
                okType: "danger",
                onOk: () => removeMutation.mutate(record.name),
              })
            }
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Server</h1>
          <p className="page-subtitle">Manage server allowlist (whitelist)</p>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Allowlist (Whitelist) controls who can join the server"
        description={
          <>
            When <strong>Use allow list</strong> is enabled in Settings, only players in this list
            can connect. You must restart the server after enabling the setting for changes to take
            effect.
          </>
        }
      />

      <Card title="Add Player to Allowlist" style={{ marginBottom: 16 }}>
        <Form
          form={form}
          layout="inline"
          onFinish={onFinish}
          initialValues={{ name: "", xuid: "" }}
          disabled={!canEdit}
        >
          <Form.Item
            name="name"
            label="Player Name"
            rules={[{ required: true, message: "Required" }]}
          >
            <Input
              placeholder="Exact Minecraft username"
              style={{ width: 250 }}
              disabled={!canEdit}
            />
          </Form.Item>
          <Form.Item name="xuid" label="Xbox User ID (XUID)">
            <Input
              placeholder="Optional: 16-digit Xbox ID"
              style={{ width: 300 }}
              disabled={!canEdit}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                htmlType="submit"
                icon={<PlusOutlined />}
                loading={addMutation.isPending}
                disabled={!canEdit}
              >
                Add to Allowlist
              </Button>
              <Button
                type="default"
                icon={<ReloadOutlined />}
                onClick={() => queryClient.invalidateQueries({ queryKey: ["allowlist"] })}
              >
                Refresh
              </Button>
              {canEdit && allowlist.data?.entries.length && (
                <Button
                  type="default"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() =>
                    modal.confirm({
                      title: "Clear entire allowlist?",
                      content: "All players will be removed. This action cannot be undone.",
                      okText: "Clear All",
                      okType: "danger",
                      onOk: () => clearMutation.mutate(),
                    })
                  }
                >
                  Clear All
                </Button>
              )}
            </Space>
          </Form.Item>
        </Form>
      </Card>

      <Card title={`Allowlist Entries (${filteredEntries.length})`}>
        <div style={{ marginBottom: 16 }}>
          <Input
            placeholder="Search by name..."
            prefix={<SearchOutlined />}
            style={{ width: 250 }}
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            allowClear
          />
        </div>

        {allowlist.isLoading ? (
          <Spin />
        ) : filteredEntries.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
            <UserAddOutlined style={{ fontSize: 32, display: "block", marginBottom: 12 }} />
            {searchName ? "No matching players found" : "Allowlist is empty"}
          </div>
        ) : (
          <Table
            dataSource={filteredEntries}
            columns={columns}
            rowKey="name"
            pagination={false}
            bordered
            size="middle"
          />
        )}
      </Card>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: "monospace",
        fontSize: 12,
        background: "#f5f5f5",
        padding: "2px 6px",
        borderRadius: 4,
      }}
    >
      {children}
    </span>
  );
}
