import { useEffect, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Divider,
  Form,
  Image,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Segmented,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createRoomType,
  deleteRoomType,
  deleteRoomTypeImages,
  listRoomTypes,
  updateRoomType,
  uploadRoomTypeImages,
} from '../../api/admin';
import RoomTypeImageManager from '../../components/RoomTypeImageManager';
import { applyFieldErrors, getErrorMessage } from '../../utils/errors';
import { PRICE_STEP, formatVND } from '../../utils/format';

const PER_PAGE = 10;

/** Add / edit form. roomType = null means add new. All changes (including images) are only sent when Save is clicked. */
function RoomTypeModal({ open, roomType, onClose }) {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const editing = Boolean(roomType);
  const originalImages = roomType?.images ?? [];

  // savedImages: images on the server the admin is keeping; pendingFiles: newly selected images, not uploaded yet
  const [savedImages, setSavedImages] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);

  // Reload images on every open (or when switching to another room type). Form fields use initialValues below:
  // the Modal only mounts <Form> after opening, so calling form.setFieldsValue() here would be lost.
  useEffect(() => {
    if (!open) return;
    setSavedImages(roomType?.images ?? []);
    setPendingFiles([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, roomType?.id]);

  const initialValues = roomType
    ? {
        name: roomType.name,
        description: roomType.description || '',
        price_per_night: roomType.price_per_night,
        max_guests: roomType.max_guests,
        is_active: roomType.is_active,
      }
    : undefined;

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-room-types'] });
    queryClient.invalidateQueries({ queryKey: ['admin-room-types-options'] });
    // Guests viewing search / room details need to see the new data
    queryClient.invalidateQueries({ queryKey: ['rooms-search'], refetchType: 'none' });
    queryClient.invalidateQueries({ queryKey: ['room-type'], refetchType: 'none' });
  };

  const mutation = useMutation({
    mutationFn: async (values) => {
      const payload = {
        name: values.name,
        description: values.description || null,
        price_per_night: values.price_per_night,
        max_guests: values.max_guests,
      };

      // 1. Save the info. An error here stops everything so the admin can fix the form and click Save again.
      const { room_type: saved } = editing
        ? await updateRoomType(roomType.id, { ...payload, is_active: values.is_active })
        : await createRoomType(payload);

      // 2. Images: delete first, then upload, so the image limit is counted against the list after deletion
      const failedSteps = [];
      const removed = originalImages.filter((src) => !savedImages.includes(src));
      if (removed.length > 0) {
        try {
          await deleteRoomTypeImages(saved.id, removed);
        } catch {
          failedSteps.push('xoá ảnh');
        }
      }
      if (pendingFiles.length > 0) {
        try {
          await uploadRoomTypeImages(saved.id, pendingFiles);
        } catch {
          failedSteps.push('tải ảnh lên');
        }
      }
      return { failedSteps };
    },
    onSuccess: ({ failedSteps }) => {
      const action = editing ? 'cập nhật' : 'thêm';
      if (failedSteps.length > 0) {
        message.warning(`Đã ${action} loại phòng nhưng ${failedSteps.join(' và ')} bị lỗi. Hãy bấm "Sửa" để thử lại.`);
      } else {
        message.success(`Đã ${action} loại phòng.`);
      }
      refreshLists();
      onClose();
    },
    onError: (error) => {
      if (!applyFieldErrors(form, error)) message.error(getErrorMessage(error));
    },
  });

  return (
    <Modal
      title={editing ? `Sửa loại phòng: ${roomType.name}` : 'Thêm loại phòng'}
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      okText={editing ? 'Lưu thay đổi' : 'Thêm'}
      cancelText="Huỷ"
      confirmLoading={mutation.isPending}
      destroyOnClose
      width={680}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initialValues}
        onFinish={(values) => mutation.mutate(values)}
        preserve={false}
      >
        <Form.Item
          name="name"
          label="Tên loại phòng"
          rules={[
            { required: true, whitespace: true, message: 'Vui lòng nhập tên loại phòng' },
            { max: 100, message: 'Tối đa 100 ký tự' },
          ]}
        >
          <Input placeholder="Deluxe Ocean View" />
        </Form.Item>

        <Space size="large" align="start" wrap>
          <Form.Item
            name="price_per_night"
            label="Giá mỗi đêm (VND)"
            rules={[{ required: true, message: 'Vui lòng nhập giá' }]}
          >
            <InputNumber
              min={1}
              max={99_999_999}
              step={PRICE_STEP}
              style={{ width: 220 }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(v) => (v ? Number(v.replace(/\./g, '')) : v)}
            />
          </Form.Item>

          <Form.Item
            name="max_guests"
            label="Số khách tối đa / phòng"
            rules={[{ required: true, message: 'Vui lòng nhập sức chứa' }]}
          >
            <InputNumber min={1} max={50} style={{ width: 180 }} />
          </Form.Item>
        </Space>

        <Form.Item name="description" label="Mô tả" extra="Hiển thị cho khách ở trang chi tiết. Xuống dòng sẽ được giữ nguyên.">
          <Input.TextArea rows={5} placeholder="Diện tích, tiện nghi, hướng nhìn..." showCount maxLength={5000} />
        </Form.Item>

        {editing && (
          <Form.Item name="is_active" label="Đang kinh doanh" valuePropName="checked">
            <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
          </Form.Item>
        )}
      </Form>

      <Divider style={{ margin: '8px 0 16px' }} />

      <RoomTypeImageManager
        savedImages={savedImages}
        onSavedImagesChange={setSavedImages}
        pendingFiles={pendingFiles}
        onPendingFilesChange={setPendingFiles}
      />
    </Modal>
  );
}

export default function AdminRoomTypesPage() {
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('all');
  const [modal, setModal] = useState({ open: false, roomType: null });
  const queryClient = useQueryClient();
  const { message, modal: appModal } = App.useApp();

  const params = {
    page,
    per_page: PER_PAGE,
    is_active: activeFilter === 'all' ? undefined : activeFilter === 'active' ? 'true' : 'false',
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['admin-room-types', params],
    queryFn: () => listRoomTypes(params),
    placeholderData: keepPreviousData,
  });

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-room-types'] });
    queryClient.invalidateQueries({ queryKey: ['admin-room-types-options'] });
    queryClient.invalidateQueries({ queryKey: ['rooms-search'], refetchType: 'none' });
    queryClient.invalidateQueries({ queryKey: ['room-type'], refetchType: 'none' });
  };

  const deleteMutation = useMutation({
    mutationFn: deleteRoomType,
    onSuccess: (result) => {
      refreshLists();
      const n = result.existing_bookings_still_valid;
      if (n > 0) {
        appModal.info({
          title: 'Đã ngừng kinh doanh loại phòng',
          content: `Loại phòng không còn hiển thị cho khách và không đặt mới được. ${n} đơn đặt phòng đang có vẫn giữ nguyên hiệu lực.`,
        });
      } else {
        message.success('Đã ngừng kinh doanh loại phòng.');
      }
    },
    onError: (err) => message.error(getErrorMessage(err)),
  });

  const restoreMutation = useMutation({
    mutationFn: (id) => updateRoomType(id, { is_active: true }),
    onSuccess: () => {
      refreshLists();
      message.success('Đã kinh doanh trở lại.');
    },
    onError: (err) => message.error(getErrorMessage(err)),
  });

  const columns = [
    {
      title: 'Ảnh',
      dataIndex: 'images',
      width: 96,
      render: (images, record) => {
        const url = images[0];
        return url ? (
          <Image src={url} width={72} height={52} style={{ objectFit: 'cover', borderRadius: 6 }} alt={record.name} />
        ) : (
          <Typography.Text type="secondary">Chưa có</Typography.Text>
        );
      },
    },
    {
      title: 'Tên loại phòng',
      dataIndex: 'name',
      render: (name, record) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{name}</Typography.Text>
          <Typography.Text type="secondary" ellipsis style={{ maxWidth: 280 }}>
            {record.description || 'Chưa có mô tả'}
          </Typography.Text>
        </Space>
      ),
    },
    { title: 'Giá / đêm', dataIndex: 'price_per_night', align: 'right', render: formatVND },
    { title: 'Sức chứa', dataIndex: 'max_guests', align: 'center', render: (v) => `${v} khách` },
    {
      title: 'Ảnh',
      dataIndex: 'images',
      key: 'image_count',
      align: 'center',
      width: 70,
      render: (images) => images?.length ?? 0,
    },
    { title: 'Số phòng', dataIndex: 'total_rooms', align: 'center' },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      align: 'center',
      render: (active) => (active ? <Tag color="green">Đang kinh doanh</Tag> : <Tag>Ngừng kinh doanh</Tag>),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      align: 'right',
      width: 190,
      render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => setModal({ open: true, roomType: record })}>
            Sửa
          </Button>
          {record.is_active ? (
            <Popconfirm
              title="Ngừng kinh doanh loại phòng này?"
              description="Khách không thấy và không đặt mới được. Đơn đã đặt vẫn giữ nguyên."
              okText="Ngừng kinh doanh"
              cancelText="Huỷ"
              okButtonProps={{ danger: true }}
              onConfirm={() => deleteMutation.mutate(record.id)}
            >
              <Button size="small" danger loading={deleteMutation.isPending && deleteMutation.variables === record.id}>
                Xoá
              </Button>
            </Popconfirm>
          ) : (
            <Button
              size="small"
              type="primary"
              ghost
              loading={restoreMutation.isPending && restoreMutation.variables === record.id}
              onClick={() => restoreMutation.mutate(record.id)}
            >
              Khôi phục
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Quản lý loại phòng
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModal({ open: true, roomType: null })}>
          Thêm loại phòng
        </Button>
      </Space>

      <Segmented
        value={activeFilter}
        onChange={(value) => {
          setActiveFilter(value);
          setPage(1);
        }}
        options={[
          { label: 'Tất cả', value: 'all' },
          { label: 'Đang kinh doanh', value: 'active' },
          { label: 'Ngừng kinh doanh', value: 'inactive' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="Không thể tải danh sách loại phòng"
          description={getErrorMessage(error)}
          action={<Button onClick={() => refetch()}>Thử lại</Button>}
        />
      )}

      <Table
        rowKey="id"
        columns={columns}
        dataSource={data?.data ?? []}
        loading={isLoading || isFetching}
        scroll={{ x: 900 }}
        locale={{ emptyText: 'Chưa có loại phòng nào' }}
        pagination={{
          current: data?.pagination?.page ?? page,
          pageSize: PER_PAGE,
          total: data?.pagination?.total ?? 0,
          showSizeChanger: false,
          onChange: setPage,
        }}
      />

      <RoomTypeModal
        open={modal.open}
        roomType={modal.roomType}
        onClose={() => setModal({ open: false, roomType: null })}
      />
    </div>
  );
}
