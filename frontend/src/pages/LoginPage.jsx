import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';

import { useAuth } from '../context/AuthContext';
import { applyFieldErrors, getErrorMessage } from '../utils/errors';

export default function LoginPage() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState(null);
  const { login } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();

  // Go back to the page the user was heading to before being redirected to login (if any)
  const from = location.state?.from;
  const redirectTo = from ? `${from.pathname}${from.search || ''}` : '/';

  const onFinish = async (values) => {
    setSubmitting(true);
    setErrorText(null);
    try {
      const user = await login(values);
      message.success(`Xin chào ${user?.full_name || ''}!`);
      navigate(redirectTo, { replace: true });
    } catch (error) {
      if (error.response?.status === 401) {
        setErrorText('Email hoặc mật khẩu không đúng.');
      } else if (!applyFieldErrors(form, error)) {
        setErrorText(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={{ maxWidth: 420, margin: '40px auto' }}>
      <Typography.Title level={3} style={{ textAlign: 'center' }}>
        Đăng nhập
      </Typography.Title>

      {errorText && <Alert type="error" showIcon message={errorText} style={{ marginBottom: 16 }} />}

      <Form form={form} layout="vertical" onFinish={onFinish} autoComplete="on" requiredMark={false}>
        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Vui lòng nhập email' },
            { type: 'email', message: 'Email không hợp lệ' },
          ]}
        >
          <Input prefix={<MailOutlined />} placeholder="email@example.com" autoComplete="email" />
        </Form.Item>

        <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" autoComplete="current-password" />
        </Form.Item>

        <Button type="primary" htmlType="submit" block loading={submitting}>
          Đăng nhập
        </Button>
      </Form>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
      </div>
    </Card>
  );
}
