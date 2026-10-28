import { LockOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import { App, Form, Input, Modal, Typography } from "antd";
import { changePassword } from "../api/auth";
import { errorMessage } from "../api/client";
import { useAuthStore } from "../store/auth";

interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ChangePasswordModal({ open, onClose }: Props) {
  const { message } = App.useApp();
  const setUser = useAuthStore((state) => state.setUser);
  const [form] = Form.useForm<PasswordValues>();

  const close = () => {
    form.resetFields();
    onClose();
  };

  const change = useMutation({
    mutationFn: (values: PasswordValues) =>
      changePassword(values.currentPassword, values.newPassword),
    onSuccess: (session) => {
      // The server already replaced the session cookie; keep the profile in sync.
      setUser(session.user);
      message.success("Password changed. All other sessions were signed out.");
      close();
    },
    onError: (error) => message.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      title="Change password"
      okText="Change password"
      confirmLoading={change.isPending}
      onCancel={close}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form<PasswordValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => change.mutate(values)}
      >
        <Form.Item
          name="currentPassword"
          label="Current password"
          rules={[{ required: true, message: "Enter your current password" }]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="New password"
          dependencies={["currentPassword"]}
          rules={[
            { required: true, message: "Enter a new password" },
            { min: 12, message: "At least 12 characters" },
            { max: 200, message: "At most 200 characters" },
            ({ getFieldValue }) => ({
              validator: (_rule, value) =>
                !value || value !== getFieldValue("currentPassword")
                  ? Promise.resolve()
                  : Promise.reject(new Error("The new password must differ from the current one")),
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="Repeat new password"
          dependencies={["newPassword"]}
          rules={[
            { required: true, message: "Repeat the new password" },
            ({ getFieldValue }) => ({
              validator: (_rule, value) =>
                !value || value === getFieldValue("newPassword")
                  ? Promise.resolve()
                  : Promise.reject(new Error("Passwords do not match")),
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Every other device and browser will have to sign in again.
        </Typography.Paragraph>
      </Form>
    </Modal>
  );
}
