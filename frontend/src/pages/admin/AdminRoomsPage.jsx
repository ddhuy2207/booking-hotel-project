import { useMemo, useState } from 'react';
import { Alert, App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createRoom, listRoomTypes, listRooms, updateRoom } from '../../api/admin';
import { useAuth } from '../../context/AuthContext';
import { applyFieldErrors, getErrorMessage } from '../../utils/errors';

const PER_PAGE = 15;

const ROOM_STATUS = {
  available: { label: 'Sẵn sàng', color: 'green' },
  occupied: { label: 'Đang có khách', color: 'blue' },
  maintenance: { label: 'Bảo trì', color: 'orange' },
};

// "occupied" is set automatically by check-in/check-out; admins can only pick these two statuses
const MANUAL_STATUS_OPTIONS = [
  { value: 'available', label: 'Sẵn sàng' },
  { value: 'maintenance', label: 'Bảo trì' },
];

/** Active room types to choose from in the form (max 100). */
function useRoomTypeOptions() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-room-types-options'],
    queryFn: () => listRoomTypes({ page: 1, per_page: 100, is_active: 'true' }),
    staleTime: 60_000,
  });
  const options = useMemo(
    () => (data?.data ?? []).map((t) => ({ value: t.id, label: `${t.name} (${t.max_guests} khách)` })),
    [data],
  );
  return { options, isLoading };
}

/** Form to add a room (room = null) or edit its status / room type (room = the room being edited). */
function RoomModal({ open, room, onClose }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { options, isLoading: loadingTypes } = useRoomTypeOptions();
  const editing = Boolean(room);

  // The Modal only mounts <Form> after opening, so initial values must go through initialValues (setFieldsValue in an effect would be lost)
  const initialValues = room ? { room_type_id: room.room_type.id, status: room.status } : { status: 'available' };

  const mutation = useMutation({
    mutationFn: (values) => {
      if (!editing) {
        return createRoom({
          room_number: values.room_number,
          room_type_id: values.room_type_id,
          status: values.status,
        });
      }
      // Only send the fields that actually changed
      const payload = {};
      if (values.status !== room.status) payload.status = values.status;
      if (values.room_type_id !== room.room_type.id) payload.room_type_id = values.room_type_id;
      return Object.keys(payload).length ? updateRoom(room.id, payload) : Promise.resolve({ unchanged: true });
    },
    onSuccess: (result) => {
      if (result?.unchanged) {
        message.info('Bạn chưa thay đổi gì.');
      } else {
        message.success(editing ? 'Đã cập nhật phòng.' : 'Đã thêm phòng.');
        queryClient.invalidateQueries({ queryKey: ['admin-rooms'] });
        queryClient.invalidateQueries({ queryKey: ['admin-room-types'] }); // room count of the room type changes
        queryClient.invalidateQueries({ queryKey: ['rooms-search'], refetchType: 'none' });
        queryClient.invalidateQueries({ queryKey: ['room-type'], refetchType: 'none' });
      }
      onClose();
    },
    onError: (error) => {
      if (!applyFieldErrors(form, error)) message.error(getErrorMessage(error));
    },
  });

  // The current room type may have been discontinued and so isn't in options: add it so it still displays correctly
  const typeOptions =
    room && !options.some((o) => o.value === room.room_type.id)
      ? [{ value: room.room_type.id, label: `${room.room_type.name} (ngừng kinh doanh)`, disabled: true }, ...options]
      : options;

  return (
    <Modal
      title={editing ? `Sửa phòng ${room.room_number}` : 'Thêm phòng'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? 'Lưu thay đổi' : 'Thêm'}
      cancelText="Huỷ"
      confirmLoading={mutation.isPending}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={(values) => mutation.mutate(values)}
        preserve={false}
      >
        {!editing && (
          <Form.Item
            name="room_number"
            label="Số phòng"
            normalize={(value) => value?.toUpperCase()}
            rules={[
              { required: true, message: 'Vui lòng nhập số phòng' },
              {
                pattern: /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/,
                message: 'Tối đa 20 ký tự: chữ, số và dấu gạch ngang',
              },
            ]}
          >
            <Input placeholder="301" maxLength={20} />
          </Form.Item>
        )}

        <Form.Item name="room_type_id" label="Loại phòng" rules={[{ required: true, message: 'Vui lòng chọn loại phòng' }]}>
          <Select
            showSearch
            optionFilterProp="label"
            loading={loadingTypes}
            options={typeOptions}
            placeholder="Chọn loại phòng"
          />
        </Form.Item>

        <Form.Item name="status" label="Trạng thái" rules={[{ required: true, message: 'Vui lòng chọn trạng thái' }]}>
          <Select options={MANUAL_STATUS_OPTIONS} />
        </Form.Item>

        {editing && (
          <Alert
            type="info"
            showIcon
            message="Không thể đổi loại phòng hoặc chuyển sang bảo trì khi phòng còn đơn đặt đang hiệu lực. Hãy huỷ hoặc chuyển phòng cho khách trước."
          />
        )}
      </Form>
    </Modal>
  );
}

export default function AdminRoomsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin'; // staff can only view
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ room_type_id: undefined, status: undefined });
  const [modal, setModal] = useState({ open: false, room: null });
  const { options: typeOptions } = useRoomTypeOptions();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const params = { page, per_page: PER_PAGE, ...filters };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-rooms', params],
    queryFn: () => listRooms(params),
    placeholderData: keepPreviousData,
  });

  // Quick status toggle right in the table (available <-> maintenance)
  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => updateRoom(id, { status }),
    onSuccess: () => {
      message.success('Đã cập nhật trạng thái.');
      queryClient.invalidateQueries({ queryKey: ['admin-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['rooms-search'], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['room-type'], refetchType: 'none' });
    },
    onError: (err) => message.error(getErrorMessage(err)),
  });

  const setFilter = (key) => (value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const columns = [
    { title: 'Số phòng', dataIndex: 'room_number', render: (v) => <Typography.Text strong>{v}</Typography.Text> },
    { title: 'Loại phòng', dataIndex: ['room_type', 'name'] },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      render: (status) => {
        const info = ROOM_STATUS[status] || { label: status, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    ...(isAdmin
      ? [
          {
            title: 'Thao tác',
            key: 'actions',
            align: 'right',
            render: (_, record) => {
              const occupied = record.status === 'occupied';
              const toMaintenance = record.status !== 'maintenance';
              return (
                <Space>
                  <Button size="small" disabled={occupied} onClick={() => setModal({ open: true, room: record })}>
                    Sửa
                  </Button>
                  <Button
                    size="small"
                    disabled={occupied}
                    loading={statusMutation.isPending && statusMutation.variables?.id === record.id}
                    onClick={() =>
                      statusMutation.mutate({ id: record.id, status: toMaintenance ? 'maintenance' : 'available' })
                    }
                  >
                    {toMaintenance ? 'Đặt bảo trì' : 'Mở lại'}
                  </Button>
                </Space>
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Quản lý phòng
        </Typography.Title>
        {isAdmin && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, room: null })}>
            Thêm phòng
          </Button>
        )}
      </Space>

      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="Lọc theo loại phòng"
          style={{ width: 260 }}
          options={typeOptions}
          value={filters.room_type_id}
          onChange={setFilter('room_type_id')}
        />
        <Select
          allowClear
          placeholder="Lọc theo trạng thái"
          style={{ width: 200 }}
          options={Object.entries(ROOM_STATUS).map(([value, { label }]) => ({ value, label }))}
          value={filters.status}
          onChange={setFilter('status')}
        />
      </Space>

      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không thể tải danh sách phòng"
          description={getErrorMessage(error)}
          action={<Button onClick={() => refetch()}>Thử lại</Button>}
        />
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading || isFetching}
        locale={{ emptyText: 'Không có phòng nào' }}
        pagination={{
          current: data?.pagination?.page ?? page,
          pageSize: PER_PAGE,
          total: data?.pagination?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      <RoomModal open={modal.open} room={modal.room} onClose={() => setModal({ open: false, room: null })} />
    </div>
  );
}
