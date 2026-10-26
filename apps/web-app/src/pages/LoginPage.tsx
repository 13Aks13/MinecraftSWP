import { LockOutlined, MailOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { errorMessage } from "../api/client";
import { useAuthStore } from "../store/auth";

interface LoginValues {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((state) => state.setUser);
  const user = useAuthStore((state) => state.user);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const onFinish = async (values: LoginValues) => {
    setLoading(true);
    setError(null);
    try {
      const response = await login(values.email, values.password);
      setUser(response.user);
      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <Card className="login-card" variant="borderless">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="brand" style={{ justifyContent: "center", fontSize: 20 }}>
            <span className="brand-mark">⛏</span>
            <span>MC Platform</span>
          </div>
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            Bedrock server administration
          </Typography.Paragraph>
        </div>

        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}

        <Form<LoginValues>
          layout="vertical"
          onFinish={onFinish}
          initialValues={{ email: "admin@example.com" }}
          requiredMark={false}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: "email", message: "Enter a valid email" }]}
          >
            <Input size="large" prefix={<MailOutlined />} autoComplete="username" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Password"
            rules={[{ required: true, message: "Enter your password" }]}
          >
            <Input.Password
              size="large"
              prefix={<LockOutlined />}
              autoComplete="current-password"
            />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={loading}>
            Sign in
          </Button>
        </Form>

        <Typography.Paragraph
          type="secondary"
          style={{ marginTop: 18, marginBottom: 0, fontSize: 12 }}
        >
          The first administrator is created from ADMIN_EMAIL / ADMIN_PASSWORD on startup. Change
          the password after the first login.
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
