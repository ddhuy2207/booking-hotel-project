import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, App, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, MailOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';

import { register } from '../api/auth';
import { applyFieldErrors, getErrorMessage } from '../utils/errors';
import {
  PASSWORD_HINT,
  confirmPasswordRules,
  emailRules,
  fullNameRules,
  passwordRules,
  phoneRules,
} from '../utils/rules';

export default function RegisterPage() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState(null);
  const { message } = App.useApp();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setSubmitting(true);
    setErrorText(null);
    try {
      await register({
        full_name: values.full_name,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
        confirm_password: values.confirm_password,
      });
      message.success('Đăng ký thành công! Vui lòng đăng nhập.');
      navigate('/login', { replace: true });
    } catch (error) {
      if (error.response?.status === 409) {
        form.setFields([{ name: 'email', errors: ['Email này đã được đăng ký'] }]);
      } else if (!applyFieldErrors(form, error)) {
        setErrorText(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card style={{ maxWidth: 480, margin: '40px auto' }}>
      <Typography.Title level={3} style={{ textAlign: 'center' }}>
        Tạo tài khoản
      </Typography.Title>

      {errorText && <Alert type="error" showIcon message={errorText} style={{ marginBottom: 16 }} />}

      <Form form={form} layout="vertical" onFinish={onFinish} autoComplete="on" requiredMark="optional">
        <Form.Item name="full_name" label="Họ và tên" rules={fullNameRules}>
          <Input prefix={<UserOutlined />} placeholder="Nguyễn Văn A" autoComplete="name" />
        </Form.Item>

        <Form.Item name="email" label="Email" rules={emailRules}>
          <Input prefix={<MailOutlined />} placeholder="email@example.com" autoComplete="email" />
        </Form.Item>

        <Form.Item name="phone" label="Số điện thoại" rules={phoneRules}>
          <Input prefix={<PhoneOutlined />} placeholder="0912 345 678" autoComplete="tel" />
        </Form.Item>

        <Form.Item name="password" label="Mật khẩu" rules={passwordRules} extra={PASSWORD_HINT} hasFeedback>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          name="confirm_password"
          label="Nhập lại mật khẩu"
          dependencies={['password']}
          rules={confirmPasswordRules}
          hasFeedback
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>

        <Button type="primary" htmlType="submit" block loading={submitting}>
          Đăng ký
        </Button>
      </Form>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </div>
    </Card>
  );
}
