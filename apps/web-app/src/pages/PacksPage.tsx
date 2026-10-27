import { DeleteOutlined, InboxOutlined, UploadOutlined } from "@ant-design/icons";
import {
  type DuplicatePolicy,
  formatBytes,
  type ImportReport,
  PACK_TYPE_LABELS,
  type PackDto,
  type PackType,
} from "@mc/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TableProps } from "antd";
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  List,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from "antd";
import dayjs from "dayjs";
import { useState } from "react";
import { errorMessage } from "../api/client";
import {
  deleteAllPacks,
  deletePack,
  deletePacks,
  getImportJob,
  importBundleAsync,
  listPacks,
  packIconUrl,
} from "../api/packs";
import { canWrite, useAuthStore } from "../store/auth";

function PackIcon({ pack }: { pack: PackDto }) {
  const [failed, setFailed] = useState(false);
  if (!pack.iconPath || failed) {
    return <div className="pack-icon-fallback">📦</div>;
  }
  return (
    <img className="pack-icon" src={packIconUrl(pack.id)} alt="" onError={() => setFailed(true)} />
  );
}

export default function PacksPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const role = useAuthStore((state) => state.user?.role);
  const canUpload = canWrite(role);

  const [type, setType] = useState<PackType>("resource");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [policy, setPolicy] = useState<DuplicatePolicy>("replace");
  const [progress, setProgress] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);

  const packs = useQuery({
    queryKey: ["packs", type, search, page],
    queryFn: () => listPacks({ type, search: search || undefined, page, limit: 20 }),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      setProgress(0);
      setCurrentStep("Uploading bundle…");
      const { jobId } = await importBundleAsync(file, type, policy);
      let job = await getImportJob(jobId);
      while (job.status === "queued" || job.status === "active") {
        setProgress(job.progress ?? 0);
        setCurrentStep(job.currentStep ?? null);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        job = await getImportJob(jobId);
      }
      setProgress(100);
      setCurrentStep(job.currentStep ?? null);
      if (job.status === "failed") {
        throw new Error(job.error ?? "Import failed");
      }
      if (!job.report) {
        throw new Error("Import finished without a report");
      }
      return job.report;
    },
    onSuccess: (result) => {
      setReport(result);
      setProgress(null);
      setCurrentStep(null);
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      message.success(
        `Imported ${result.imported.length} pack(s) in ${(result.durationMs / 1000).toFixed(1)}s`,
      );
    },
    onError: (error) => {
      setProgress(null);
      setCurrentStep(null);
      modal.error({
        title: "Import failed",
        content: errorMessage(error),
        okText: "Close",
      });
    },
  });

  const remove = useMutation({
    mutationFn: deletePack,
    onSuccess: () => {
      message.success("Pack deleted");
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => deletePacks(ids),
    onSuccess: (result) => {
      setSelectedKeys([]);
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      message.success(`Deleted ${result.deleted} pack(s)`);
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const deleteAll = useMutation({
    mutationFn: (type?: PackType) => deleteAllPacks(type),
    onSuccess: (result) => {
      setSelectedKeys([]);
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      message.success(`Deleted ${result.deleted} pack(s)`);
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  const columns: TableProps<PackDto>["columns"] = [
    {
      title: "",
      key: "icon",
      width: 56,
      render: (_value, pack) => <PackIcon pack={pack} />,
    },
    {
      title: "Pack",
      key: "name",
      render: (_value, pack) => (
        <div>
          <Typography.Text strong>{pack.name}</Typography.Text>
          <div className="muted">
            v{pack.version} · {pack.folderName}
          </div>
        </div>
      ),
    },
    {
      title: "UUID",
      dataIndex: "packUuid",
      key: "uuid",
      render: (value: string) => (
        <Typography.Text className="mono" copyable={{ text: value }}>
          {value.slice(0, 8)}…{value.slice(-4)}
        </Typography.Text>
      ),
    },
    {
      title: "Size",
      dataIndex: "sizeBytes",
      key: "size",
      width: 100,
      render: (value: string) => formatBytes(value),
    },
    {
      title: "Dependencies",
      key: "dependencies",
      width: 130,
      render: (_value, pack) => {
        if (pack.dependencies.length === 0) {
          return <Tag>none</Tag>;
        }
        const unresolved = pack.dependencies.filter((dependency) => dependency.missing).length;
        return (
          <Tooltip
            title={pack.dependencies
              .map((dependency) => `${dependency.uuid}${dependency.missing ? " (missing)" : ""}`)
              .join("\n")}
          >
            <Tag color={unresolved > 0 ? "orange" : "blue"}>{pack.dependencies.length}</Tag>
          </Tooltip>
        );
      },
    },
    {
      title: "Imported",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm"),
    },
    {
      title: "",
      key: "actions",
      width: 60,
      render: (_value, pack) =>
        canUpload ? (
          <Button
            danger
            type="text"
            icon={<DeleteOutlined />}
            aria-label={`Delete ${pack.name}`}
            onClick={() =>
              modal.confirm({
                title: `Delete "${pack.name}"?`,
                content:
                  "Pack files and the registry entry are removed. Packs used by a world cannot be deleted.",
                okText: "Delete",
                okButtonProps: { danger: true },
                onOk: () => remove.mutateAsync(pack.id),
              })
            }
          />
        ) : null,
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pack library</h1>
          <p className="page-subtitle">
            Upload ZIP (also support *.mcaddon, *.mcpack) bundles — every pack with manifest.json is
            detected and registered automatically
          </p>
        </div>
        <Space wrap>
          <Select
            value={policy}
            onChange={setPolicy}
            style={{ width: 190 }}
            options={[
              { value: "replace", label: "Duplicates: replace" },
              { value: "skip", label: "Duplicates: skip" },
            ]}
          />
          {canUpload && (
            <Upload
              accept=".zip,.mcaddon,.mcpack"
              showUploadList={false}
              customRequest={({ file, onSuccess, onError }) => {
                upload.mutate(file as File, {
                  onSuccess: (result) => onSuccess?.(result),
                  onError: (error) => onError?.(error as Error),
                });
              }}
            >
              <Button type="primary" icon={<UploadOutlined />} loading={upload.isPending}>
                Upload {type === "resource" ? "resource" : "behavior"} bundle
              </Button>
            </Upload>
          )}
        </Space>
      </div>

      {canUpload && (
        <Card style={{ marginBottom: 16 }}>
          <Upload.Dragger
            accept=".zip,.mcaddon,.mcpack"
            multiple={false}
            showUploadList={false}
            disabled={upload.isPending}
            customRequest={({ file, onSuccess, onError }) => {
              upload.mutate(file as File, {
                onSuccess: (result) => onSuccess?.(result),
                onError: (error) => onError?.(error as Error),
              });
            }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Drop a {PACK_TYPE_LABELS[type].toLowerCase()} ZIP bundle here
            </p>
            <p className="ant-upload-hint">
              Expected name: {type}_packs_*.zip (*.mcaddon, *.mcpack)· max 500 MB · the archive is
              scanned recursively for manifest.json
            </p>
          </Upload.Dragger>
          {progress !== null && (
            <div style={{ marginTop: 12 }}>
              <Progress percent={progress} status="active" />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {currentStep ??
                  `Uploading and installing ${type === "resource" ? "resource" : "behavior"} packs…`}{" "}
                {progress}%
              </Typography.Text>
            </div>
          )}
        </Card>
      )}

      <Card>
        <Tabs
          activeKey={type}
          onChange={(key) => {
            setType(key as PackType);
            setPage(1);
          }}
          items={[
            { key: "resource", label: "Resource packs" },
            { key: "behavior", label: "Behavior packs" },
          ]}
          tabBarExtraContent={
            <Input.Search
              allowClear
              placeholder="Search name or UUID"
              style={{ width: 260 }}
              onSearch={(value) => {
                setSearch(value.trim());
                setPage(1);
              }}
            />
          }
        />
        <Space style={{ marginBottom: 12 }}>
          <Button
            danger
            disabled={selectedKeys.length === 0 || bulkDelete.isPending}
            onClick={() =>
              modal.confirm({
                title: `Delete ${selectedKeys.length} selected pack(s)?`,
                content:
                  "Pack files and registry entries are removed. Packs used by a world are skipped.",
                okText: "Delete",
                okButtonProps: { danger: true },
                onOk: () => bulkDelete.mutateAsync(selectedKeys),
              })
            }
          >
            Delete selected ({selectedKeys.length})
          </Button>
          <Button
            danger
            loading={deleteAll.isPending}
            onClick={() =>
              modal.confirm({
                title: `Delete ALL ${PACK_TYPE_LABELS[type].toLowerCase()}s?`,
                content: "Every pack of this type that is not used by a world will be removed.",
                okText: "Delete all",
                okButtonProps: { danger: true },
                onOk: () => deleteAll.mutateAsync(type),
              })
            }
          >
            Delete all in this tab
          </Button>
          <Button
            danger
            loading={deleteAll.isPending}
            onClick={() =>
              modal.confirm({
                title: "Delete ALL packs?",
                content: "The whole pack library (resource and behavior) will be removed.",
                okText: "Delete everything",
                okButtonProps: { danger: true },
                onOk: () => deleteAll.mutateAsync(undefined),
              })
            }
          >
            Delete all packs
          </Button>
        </Space>
        <Table<PackDto>
          rowKey="id"
          rowSelection={{
            selectedRowKeys: selectedKeys,
            onChange: (keys) => setSelectedKeys(keys as string[]),
          }}
          size="middle"
          loading={packs.isLoading}
          columns={columns}
          dataSource={packs.data?.items ?? []}
          pagination={{
            current: page,
            pageSize: 20,
            total: packs.data?.total ?? 0,
            showSizeChanger: false,
            onChange: setPage,
          }}
          locale={{ emptyText: "No packs imported yet" }}
        />
      </Card>

      <Modal
        open={report !== null}
        title="Import report"
        onCancel={() => setReport(null)}
        onOk={() => setReport(null)}
        width={720}
        footer={<Button onClick={() => setReport(null)}>Close</Button>}
      >
        {report && (
          <Space direction="vertical" style={{ width: "100%" }}>
            <Alert
              type={report.errors.length > 0 ? "warning" : "success"}
              showIcon
              message={`${report.imported.length} imported · ${report.replaced.length} replaced · ${report.skipped.length} skipped`}
              description={`Scanned in ${(report.durationMs / 1000).toFixed(2)}s using policy "${report.duplicatePolicy}"`}
            />
            {report.imported.length > 0 && (
              <List
                size="small"
                header={<Typography.Text strong>Imported</Typography.Text>}
                dataSource={report.imported}
                renderItem={(pack) => (
                  <List.Item>
                    <Typography.Text>{pack.name}</Typography.Text>
                    <Tag>{pack.version}</Tag>
                  </List.Item>
                )}
              />
            )}
            {report.warnings.length > 0 && (
              <Alert
                type="warning"
                showIcon
                message="Warnings"
                description={
                  <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                    {report.warnings.map((warning) => (
                      <li key={warning.message}>
                        {warning.pack ? `${warning.pack}: ` : ""}
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                }
              />
            )}
            {report.logs?.length > 0 && (
              <div>
                <Typography.Text strong>Logs</Typography.Text>
                <div className="log-console" style={{ maxHeight: 220, marginTop: 8, fontSize: 12 }}>
                  {report.logs.map((line) => (
                    <div key={line} className="log-line">
                      {line}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
}
