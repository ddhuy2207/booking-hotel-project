import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, App, Button, Card, Descriptions, Form, Input, Popconfirm, Tabs, Tag, Typography } from 'antd';
import { LockOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';

import { deleteAccount, updateProfile } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { applyFieldErrors, getErrorMessage } from '../utils/errors';
import { formatDateTime } from '../utils/format';
import {
  PASSWORD_HINT,
  confirmPasswordRules,
  fullNameRules,
  passwordRules,
  phoneRules,
} from '../utils/rules';

const ROLE_LABELS = { customer: 'Khách hàng', staff: 'Lễ tân', admin: 'Quản trị viên' };

// ---------------------------------------------------------------------------
// Tab 1: personal info
// ---------------------------------------------------------------------------
function InfoTab({ user, refreshUser }) {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const onFinish = async (values) => {
    // Only send the fields that actually changed
    const payload = {};
    if (values.full_name !== user.full_name) payload.full_name = values.full_name;
    if ((values.phone || '') !== (user.phone || '')) payload.phone = values.phone || ''; // '' means remove the number

    if (Object.keys(payload).length === 0) {
      message.info('Bạn chưa thay đổi thông tin nào.');
      return;
    }

    setSubmitting(true);
    try {
      await updateProfile(payload);
      const fresh = await refreshUser();
      if (fresh) form.setFieldsValue({ full_name: fresh.full_name, phone: fresh.phone || '' });
      message.success('Đã cập nhật thông tin.');
    } catch (error) {
      if (!applyFieldErrors(form, error)) message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Descriptions
        column={1}
        size="small"
        style={{ marginBottom: 24 }}
        items={[
          { key: 'email', label: 'Email', children: user.email },
          { key: 'role', label: 'Vai trò', children: <Tag color="blue">{ROLE_LABELS[user.role] || user.role}</Tag> },
          { key: 'created', label: 'Ngày tạo tài khoản', children: user.created_at ? formatDateTime(user.created_at) : '—' },
        ]}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={{ full_name: user.full_name, phone: user.phone || '' }}
        style={{ maxWidth: 420 }}
      >
        <Form.Item name="full_name" label="Họ và tên" rules={fullNameRules}>
          <Input prefix={<UserOutlined />} />
        </Form.Item>

        <Form.Item name="phone" label="Số điện thoại" rules={phoneRules}>
          <Input prefix={<PhoneOutlined />} placeholder="0912 345 678" />
        </Form.Item>

        <Button type="primary" htmlType="submit" loading={submitting}>
          Lưu thay đổi
        </Button>
      </Form>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: change password
// ---------------------------------------------------------------------------
function SecurityTab() {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const onFinish = async (values) => {
    setSubmitting(true);
    try {
      await updateProfile({ current_password: values.current_password, password: values.password });
      form.resetFields();
      message.success('Đã đổi mật khẩu.');
    } catch (error) {
      if (!applyFieldErrors(form, error)) message.error(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 420 }}>
      <Form.Item
        name="current_password"
        label="Mật khẩu hiện tại"
        rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
      >
        <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
      </Form.Item>

      <Form.Item name="password" label="Mật khẩu mới" rules={passwordRules} extra={PASSWORD_HINT} hasFeedback>
        <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
      </Form.Item>

      <Form.Item
        name="confirm_password"
        label="Nhập lại mật khẩu mới"
        dependencies={['password']}
        rules={confirmPasswordRules}
        hasFeedback
      >
        <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
      </Form.Item>

      <Button type="primary" htmlType="submit" loading={submitting}>
        Đổi mật khẩu
      </Button>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: deactivate account
// ---------------------------------------------------------------------------
function DangerTab() {
  const [deleting, setDeleting] = useState(false);
  const { logout } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      await logout();
      message.success('Tài khoản đã được vô hiệu hoá.');
      navigate('/', { replace: true });
    } catch (error) {
      message.error(getErrorMessage(error));
      setDeleting(false);
    }
  };

  return (
    <>
      <Alert
        type="warning"
        showIcon
        message="Vô hiệu hoá tài khoản"
        description="Sau khi vô hiệu hoá, bạn sẽ bị đăng xuất và không thể đăng nhập lại bằng tài khoản này."
        style={{ marginBottom: 16, maxWidth: 560 }}
      />
      <Popconfirm
        title="Bạn chắc chắn muốn vô hiệu hoá tài khoản?"
        okText="Vô hiệu hoá"
        cancelText="Huỷ"
        okButtonProps={{ danger: true, loading: deleting }}
        onConfirm={handleDelete}
      >
        <Button danger>Vô hiệu hoá tài khoản</Button>
      </Popconfirm>
    </>
  );
}

// ---------------------------------------------------------------------------
export default function ProfilePage() {
  const { user, refreshUser } = useAuth(); // ProtectedRoute guarantees user is not null

  return (
    <Card style={{ maxWidth: 720, margin: '0 auto' }}>
      <Typography.Title level={3}>Hồ sơ của tôi</Typography.Title>
      <Tabs
        items={[
          { key: 'info', label: 'Thông tin cá nhân', children: <InfoTab user={user} refreshUser={refreshUser} /> },
          { key: 'security', label: 'Đổi mật khẩu', children: <SecurityTab /> },
          { key: 'danger', label: 'Tài khoản', children: <DangerTab /> },
        ]}
      />
    </Card>
  );
}
