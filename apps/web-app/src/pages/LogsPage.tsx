import {
  ClearOutlined,
  DownloadOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { App, Button, Card, Input, Space, Switch, Tag, Typography } from "antd";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { errorMessage } from "../api/client";
import { downloadServerLogs, sendCommand } from "../api/server";
import { useServerLogs } from "../hooks/useServerLogs";
import { canWrite, useAuthStore } from "../store/auth";

const LINE_CLASS = { stdout: "", stderr: "log-stderr", system: "log-system" } as const;
const MAX_HISTORY = 50;

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function LogsPage() {
  const { message } = App.useApp();
  const { lines, connected, error, setPaused, clear, pushSystem } = useServerLogs();
  const role = useAuthStore((state) => state.user?.role);
  const canSend = canWrite(role);
  const [paused, setPausedState] = useState(false);
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleRef = useRef<HTMLDivElement>(null);
  const [command, setCommand] = useState("");
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const send = useMutation({
    mutationFn: (line: string) => sendCommand(line),
    onSuccess: (output, line) => {
      pushSystem(`> ${line}`);
      // "exec" mode returns the command output; "attach" mode returns "" and the answer
      // arrives through the live log stream instead.
      for (const outputLine of output.trim().split("\n")) {
        if (outputLine) {
          pushSystem(outputLine);
        }
      }
    },
    onError: (sendError) => message.error(errorMessage(sendError)),
  });

  const submit = () => {
    const line = command.trim().replace(/^\/+/, "");
    if (!line || send.isPending) {
      return;
    }
    historyRef.current = [line, ...historyRef.current.filter((item) => item !== line)].slice(
      0,
      MAX_HISTORY,
    );
    historyIndexRef.current = -1;
    setCommand("");
    send.mutate(line);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const history = historyRef.current;
    if (event.key === "ArrowUp" && history.length > 0) {
      event.preventDefault();
      historyIndexRef.current = Math.min(historyIndexRef.current + 1, history.length - 1);
      setCommand(history[historyIndexRef.current]);
    } else if (event.key === "ArrowDown" && historyIndexRef.current >= 0) {
      event.preventDefault();
      historyIndexRef.current -= 1;
      setCommand(historyIndexRef.current < 0 ? "" : history[historyIndexRef.current]);
    }
  };

  const filtered = useMemo(() => {
    if (!filter.trim()) {
      return lines;
    }
    const needle = filter.toLowerCase();
    return lines.filter((line) => line.message.toLowerCase().includes(needle));
  }, [lines, filter]);

  useEffect(() => {
    if (!autoScroll) {
      return;
    }
    const element = consoleRef.current;
    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [autoScroll]);

  const togglePause = () => {
    const next = !paused;
    setPausedState(next);
    setPaused(next);
  };

  const download = async () => {
    try {
      const blob = await downloadServerLogs(5_000);
      saveBlob(blob, `mc-bedrock-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
      message.success("Log file downloaded");
    } catch (downloadError) {
      message.error(errorMessage(downloadError));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Live console</h1>
          <p className="page-subtitle">Docker log stream from the Bedrock container</p>
        </div>
        <Space wrap>
          <Tag color={connected ? "green" : "red"}>{connected ? "CONNECTED" : "OFFLINE"}</Tag>
          {error && <Typography.Text type="danger">{error}</Typography.Text>}
          <Input.Search
            allowClear
            placeholder="Filter lines"
            style={{ width: 220 }}
            onChange={(event) => setFilter(event.target.value)}
          />
          <Button
            icon={paused ? <PlayCircleOutlined /> : <PauseCircleOutlined />}
            onClick={togglePause}
          >
            {paused ? "Resume" : "Pause"}
          </Button>
          <Button icon={<ClearOutlined />} onClick={clear}>
            Clear
          </Button>
          <Button icon={<DownloadOutlined />} onClick={download}>
            Download
          </Button>
          <Space>
            <Typography.Text type="secondary">Auto-scroll</Typography.Text>
            <Switch checked={autoScroll} onChange={setAutoScroll} />
          </Space>
        </Space>
      </div>

      <Card styles={{ body: { padding: 12 } }}>
        <div className="log-console" ref={consoleRef}>
          {filtered.length === 0 ? (
            <div className="muted">
              {connected ? "Waiting for log output…" : "Connecting to the log stream…"}
            </div>
          ) : (
            filtered.map((line) => (
              <div key={line.timestamp} className={`log-line ${LINE_CLASS[line.stream]}`}>
                <span className="log-time">{line.timestamp.slice(11, 19)}</span>
                {line.message}
              </div>
            ))
          )}
        </div>
        {canSend && (
          <Space.Compact style={{ width: "100%", marginTop: 12 }}>
            <Input
              value={command}
              maxLength={1000}
              className="mono"
              placeholder="Console command, e.g. list (↑/↓ for history)"
              autoComplete="off"
              onChange={(event) => setCommand(event.target.value)}
              onKeyDown={onKeyDown}
              onPressEnter={submit}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={send.isPending}
              onClick={submit}
            >
              Send
            </Button>
          </Space.Compact>
        )}
      </Card>
    </div>
  );
}
