import {
  CloudDownloadOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { type CreateWorldDto, formatBytes, type WorldDto } from "@mc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TableProps } from "antd";
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { createBackup } from "../api/backups";
import { errorMessage } from "../api/client";
import { listPacks } from "../api/packs";
import {
  activateWorld,
  cloneWorld,
  createWorld,
  deleteWorld,
  listWorlds,
  updateWorldPacks,
} from "../api/worlds";
import { canWrite, useAuthStore } from "../store/auth";

const STATUS_COLORS: Record<WorldDto["status"], string> = {
  active: "green",
  ready: "blue",
  draft: "default",
  error: "red",
};

export default function WorldsPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canManage = canWrite(role);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingWorld, setEditingWorld] = useState<WorldDto | null>(null);
  const [form] = Form.useForm<CreateWorldDto>();
  const [packsForm] = Form.useForm<Pick<CreateWorldDto, "resourcePackIds" | "behaviorPackIds">>();

  const worlds = useQuery({
    queryKey: ["worlds", search, page],
    queryFn: () => listWorlds({ search: search || undefined, page, limit: 20 }),
  });

  const packs = useQuery({
    queryKey: ["packs-for-worlds"],
    queryFn: () => listPacks({ limit: 200 }),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["worlds"] });
    await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    await queryClient.invalidateQueries({ queryKey: ["backups"] });
  };

  const create = useMutation({
    mutationFn: createWorld,
    onSuccess: async (world) => {
      message.success(`World "${world.name}" created`);
      setCreateOpen(false);
      form.resetFields();
      await invalidate();
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const activate = useMutation({
    mutationFn: activateWorld,
    onSuccess: async (world) => {
      message.success(`"${world.name}" is now the active world`);
      await invalidate();
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const clone = useMutation({
    mutationFn: cloneWorld,
    onSuccess: async (world) => {
      message.success(`Cloned as "${world.name}"`);
      await invalidate();
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const backup = useMutation({
    mutationFn: (worldId: string) => createBackup(worldId),
    onSuccess: async (result) => {
      message.success(`Backup ${result.fileName} created`);
      await invalidate();
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: deleteWorld,
    onSuccess: async () => {
      message.success("World deleted");
      await invalidate();
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const updatePacks = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: string;
      values: Pick<CreateWorldDto, "resourcePackIds" | "behaviorPackIds">;
    }) => updateWorldPacks(id, values),
    onSuccess: async (world) => {
      message.success(`Pack configuration for "${world.name}" updated`);
      setEditingWorld(null);
      packsForm.resetFields();
      await invalidate();
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const columns: TableProps<WorldDto>["columns"] = [
    {
      title: "World",
      key: "name",
      render: (_value, world) => (
        <div>
          <Typography.Text strong>{world.name}</Typography.Text>
          <div className="muted">{world.folderName}</div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 110,
      render: (status: WorldDto["status"]) => (
        <Tag color={STATUS_COLORS[status]}>{status.toUpperCase()}</Tag>
      ),
    },
    {
      title: "Mode / difficulty",
      key: "mode",
      render: (_value, world) => (
        <span>
          {world.gamemode} · {world.difficulty}
        </span>
      ),
    },
    {
      title: "Packs",
      key: "packs",
      width: 90,
      render: (_value, world) => <Tag>{world.packs.length}</Tag>,
    },
    {
      title: "Size",
      dataIndex: "sizeBytes",
      key: "size",
      width: 100,
      render: (value: string) => formatBytes(value),
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "",
      key: "actions",
      width: 220,
      render: (_value, world) =>
        canManage ? (
          <Space size={0}>
            <Tooltip title="Configure packs">
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={() => {
                  setEditingWorld(world);
                  packsForm.setFieldsValue({
                    resourcePackIds: world.packs
                      .filter((pack) => pack.type === "resource")
                      .map((pack) => pack.id),
                    behaviorPackIds: world.packs
                      .filter((pack) => pack.type === "behavior")
                      .map((pack) => pack.id),
                  });
                }}
              />
            </Tooltip>
            <Tooltip title="Activate on server">
              <Button
                type="text"
                icon={<PlayCircleOutlined />}
                disabled={world.status === "active" || activate.isPending}
                onClick={() =>
                  modal.confirm({
                    title: `Activate "${world.name}"?`,
                    content:
                      "The server is stopped, the world is copied into the Bedrock data volume and started again.",
                    okText: "Activate",
                    onOk: () => activate.mutateAsync(world.id),
                  })
                }
              />
            </Tooltip>
            <Tooltip title="Create backup">
              <Button
                type="text"
                icon={<CloudDownloadOutlined />}
                loading={backup.isPending}
                onClick={() => backup.mutate(world.id)}
              />
            </Tooltip>
            <Tooltip title="Clone">
              <Button type="text" icon={<CopyOutlined />} onClick={() => clone.mutate(world.id)} />
            </Tooltip>
            <Tooltip title="Delete">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={world.status === "active"}
                onClick={() =>
                  modal.confirm({
                    title: `Delete "${world.name}"?`,
                    content: "The world folder and its pack mapping are removed permanently.",
                    okText: "Delete",
                    okButtonProps: { danger: true },
                    onOk: () => remove.mutateAsync(world.id),
                  })
                }
              />
            </Tooltip>
          </Space>
        ) : null,
    },
  ];

  const resourcePacks = (packs.data?.items ?? []).filter((pack) => pack.type === "resource");
  const behaviorPacks = (packs.data?.items ?? []).filter((pack) => pack.type === "behavior");

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Worlds</h1>
          <p className="page-subtitle">
            Create world templates with pack configuration files, then activate one on the server
          </p>
        </div>
        <Space>
          <Input.Search
            allowClear
            placeholder="Search worlds"
            style={{ width: 220 }}
            onSearch={(value) => {
              setSearch(value.trim());
              setPage(1);
            }}
          />
          {canManage && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              New world
            </Button>
          )}
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="One active world per Bedrock container"
        description="Activation copies the selected world into the data volume and restarts the server. Create multiple world templates and switch between them at any time."
      />

      <Card>
        <Table<WorldDto>
          rowKey="id"
          size="middle"
          loading={worlds.isLoading}
          columns={columns}
          dataSource={worlds.data?.items ?? []}
          pagination={{
            current: page,
            pageSize: 20,
            total: worlds.data?.total ?? 0,
            showSizeChanger: false,
            onChange: setPage,
          }}
          locale={{ emptyText: "No worlds yet — create your first template" }}
        />
      </Card>

      <Modal
        open={createOpen}
        title="Create world"
        okText="Create"
        confirmLoading={create.isPending}
        onCancel={() => setCreateOpen(false)}
        onOk={() => form.submit()}
        width={640}
      >
        <Form<CreateWorldDto>
          form={form}
          layout="vertical"
          initialValues={{ gamemode: "survival", difficulty: "normal" }}
          onFinish={(values) => create.mutate(values)}
        >
          <Form.Item
            name="name"
            label="World name"
            rules={[
              { required: true, message: "Enter a world name" },
              {
                pattern: /^[\p{L}\p{N} _.-]+$/u,
                message: "Letters, numbers, spaces, dots, dashes and underscores only",
              },
            ]}
          >
            <Input placeholder="Fantasy World" maxLength={64} />
          </Form.Item>
          <Space style={{ display: "flex" }} align="start">
            <Form.Item name="gamemode" label="Game mode" style={{ minWidth: 200 }}>
              <Select
                options={[
                  { value: "survival", label: "Survival" },
                  { value: "creative", label: "Creative" },
                  { value: "adventure", label: "Adventure" },
                ]}
              />
            </Form.Item>
            <Form.Item name="difficulty" label="Difficulty" style={{ minWidth: 200 }}>
              <Select
                options={["peaceful", "easy", "normal", "hard"].map((value) => ({
                  value,
                  label: value[0].toUpperCase() + value.slice(1),
                }))}
              />
            </Form.Item>
            <Form.Item name="seed" label="Seed (optional)" style={{ minWidth: 200 }}>
              <Input placeholder="123456" />
            </Form.Item>
          </Space>
          <Form.Item name="resourcePackIds" label="Resource packs">
            <Select
              mode="multiple"
              allowClear
              placeholder="Select resource packs"
              options={resourcePacks.map((pack) => ({
                value: pack.id,
                label: `${pack.name} (v${pack.version})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="behaviorPackIds" label="Behavior packs">
            <Select
              mode="multiple"
              allowClear
              placeholder="Select behavior packs"
              options={behaviorPacks.map((pack) => ({
                value: pack.id,
                label: `${pack.name} (v${pack.version})`,
              }))}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            world_resource_packs.json and world_behavior_packs.json are generated automatically.
          </Typography.Paragraph>
        </Form>
      </Modal>

      <Modal
        open={!!editingWorld}
        title={editingWorld ? `Configure packs — ${editingWorld.name}` : "Configure packs"}
        okText="Save packs"
        confirmLoading={updatePacks.isPending}
        onCancel={() => {
          setEditingWorld(null);
          packsForm.resetFields();
        }}
        onOk={() => packsForm.submit()}
        width={640}
      >
        <Form<Pick<CreateWorldDto, "resourcePackIds" | "behaviorPackIds">>
          form={packsForm}
          layout="vertical"
          onFinish={(values) => {
            if (editingWorld) {
              updatePacks.mutate({ id: editingWorld.id, values });
            }
          }}
        >
          <Form.Item name="resourcePackIds" label="Resource packs">
            <Select
              mode="multiple"
              allowClear
              placeholder="Select resource packs"
              options={resourcePacks.map((pack) => ({
                value: pack.id,
                label: `${pack.name} (v${pack.version})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="behaviorPackIds" label="Behavior packs">
            <Select
              mode="multiple"
              allowClear
              placeholder="Select behavior packs"
              options={behaviorPacks.map((pack) => ({
                value: pack.id,
                label: `${pack.name} (v${pack.version})`,
              }))}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            This creates world_resource_packs.json and world_behavior_packs.json. Saving an active
            world briefly restarts Bedrock to apply the new configuration.
          </Typography.Paragraph>
        </Form>
      </Modal>
    </div>
  );
}
