import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Empty,
  Form,
  Grid,
  InputNumber,
  Pagination,
  Row,
  Select,
  Skeleton,
  Slider,
  Space,
  Spin,
  Typography,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { searchRooms } from '../api/rooms';
import RoomCard from '../components/RoomCard';
import { getErrorMessage } from '../utils/errors';
import { PRICE_MAX, PRICE_STEP, formatDate, formatVND, toIsoDate } from '../utils/format';

const { RangePicker } = DatePicker;

const PER_PAGE = 9;

const SORT_OPTIONS = [
  { value: 'price_asc', label: 'Giá thấp đến cao' },
  { value: 'price_desc', label: 'Giá cao đến thấp' },
  { value: 'capacity_desc', label: 'Sức chứa lớn nhất' },
  { value: 'capacity_asc', label: 'Sức chứa nhỏ nhất' },
];

/** Short price for the slider labels: 500000 -> "500k", 1500000 -> "1,5tr", PRICE_MAX -> "5tr+" */
function formatPriceShort(value) {
  const text = value >= 1_000_000 ? `${(value / 1_000_000).toLocaleString('vi-VN')}tr` : `${value / 1000}k`;
  return value >= PRICE_MAX ? `${text}+` : text;
}

/**
 * All search state lives in the URL (?check_in=...&check_out=...&guests=...):
 * links can be shared, F5 keeps the results, and the Back button works correctly.
 */
function paramsToFormValues(params) {
  const checkIn = dayjs(params.get('check_in'));
  const checkOut = dayjs(params.get('check_out'));
  return {
    dates: params.get('check_in') && params.get('check_out') && checkIn.isValid() && checkOut.isValid()
      ? [checkIn, checkOut]
      : null,
    guests: Number(params.get('guests')) || 1,
    price: [Number(params.get('min_price')) || 0, Number(params.get('max_price')) || PRICE_MAX],
  };
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [form] = Form.useForm();
  const price = Form.useWatch('price', form) ?? [0, PRICE_MAX];
  const screens = Grid.useBreakpoint(); // lg and up: 4 fields on one row

  const checkIn = params.get('check_in');
  const checkOut = params.get('check_out');
  const hasDates = Boolean(checkIn && checkOut);
  const page = Number(params.get('page')) || 1;
  const sort = params.get('sort') || 'price_asc';

  // Sync the form when the URL changes (Back/Forward)
  useEffect(() => {
    form.setFieldsValue(paramsToFormValues(params));
  }, [params, form]);

  const apiParams = useMemo(
    () => ({
      check_in: checkIn || undefined,
      check_out: checkOut || undefined,
      guests: params.get('guests') || undefined,
      min_price: params.get('min_price') || undefined,
      max_price: params.get('max_price') || undefined,
      sort,
      page,
      per_page: PER_PAGE,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.toString()],
  );

  const { data, error, isError, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rooms-search', apiParams],
    queryFn: () => searchRooms(apiParams),
    enabled: hasDates,
    placeholderData: keepPreviousData, // keep the old results dimmed while a new page/filter is loading
  });

  const onFinish = ({ dates, guests, price }) => {
    const next = new URLSearchParams();
    next.set('check_in', toIsoDate(dates[0]));
    next.set('check_out', toIsoDate(dates[1]));
    if (guests > 1) next.set('guests', String(guests));
    if (price[0] > 0) next.set('min_price', String(price[0]));
    if (price[1] < PRICE_MAX) next.set('max_price', String(price[1])); // dragged all the way = no limit
    if (sort !== 'price_asc') next.set('sort', sort);
    setParams(next); // a new search goes back to page 1
  };

  const changeSort = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'price_asc') next.delete('sort');
    else next.set('sort', value);
    next.delete('page');
    setParams(next);
  };

  const changePage = (value) => {
    const next = new URLSearchParams(params);
    if (value > 1) next.set('page', String(value));
    else next.delete('page');
    setParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const rooms = data?.data ?? [];
  const nights = data?.search?.nights;
  const pagination = data?.pagination;
  const detailQuery = new URLSearchParams({ check_in: checkIn || '', check_out: checkOut || '' }).toString();

  const renderResults = () => {
    if (!hasDates) {
      return <Empty description="Chọn ngày nhận phòng và trả phòng để xem phòng trống" style={{ padding: 48 }} />;
    }
    if (isError) {
      return (
        <Alert
          type="error"
          showIcon
          message="Không thể tìm phòng"
          description={getErrorMessage(error)}
          action={<Button onClick={() => refetch()}>Thử lại</Button>}
        />
      );
    }
    if (isLoading) {
      return (
        <Row gutter={[16, 16]}>
          {Array.from({ length: 6 }, (_, i) => (
            <Col key={i} xs={24} md={12} lg={8}>
              <Card>
                <Skeleton active avatar={{ shape: 'square', size: 120 }} />
              </Card>
            </Col>
          ))}
        </Row>
      );
    }
    if (rooms.length === 0) {
      return <Empty description="Không có phòng phù hợp. Hãy thử đổi ngày hoặc nới rộng bộ lọc." style={{ padding: 48 }} />;
    }

    return (
      <>
        <Row justify="space-between" align="middle" gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col>
            <Typography.Text>
              Tìm thấy <b>{pagination.total}</b> loại phòng · {nights} đêm ({formatDate(checkIn)} – {formatDate(checkOut)})
            </Typography.Text>
          </Col>
          <Col>
            <Select value={sort} onChange={changeSort} options={SORT_OPTIONS} style={{ width: 200 }} />
          </Col>
        </Row>

        <Spin spinning={isFetching}>
          <Row gutter={[16, 16]}>
            {rooms.map((room) => (
              <Col key={room.room_type_id} xs={24} md={12} lg={8}>
                <RoomCard room={room} nights={nights} detailQuery={detailQuery} />
              </Col>
            ))}
          </Row>
        </Spin>

        {pagination.pages > 1 && (
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <Pagination
              current={pagination.page}
              total={pagination.total}
              pageSize={PER_PAGE}
              showSizeChanger={false}
              onChange={changePage}
            />
          </div>
        )}
      </>
    );
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Tìm phòng khách sạn
        </Typography.Title>

        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={paramsToFormValues(params)}>
          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Form.Item
                name="dates"
                label="Ngày nhận – trả phòng"
                rules={[
                  { required: true, message: 'Vui lòng chọn ngày nhận và trả phòng' },
                  {
                    validator: (_, value) =>
                      !value || value[1].isAfter(value[0], 'day')
                        ? Promise.resolve()
                        : Promise.reject(new Error('Ngày trả phòng phải sau ngày nhận phòng')),
                  },
                ]}
              >
                <RangePicker
                  style={{ width: '100%' }}
                  format="DD/MM/YYYY"
                  placeholder={['Nhận phòng', 'Trả phòng']}
                  disabledDate={(current) => current && current.isBefore(dayjs().startOf('day'))}
                />
              </Form.Item>
            </Col>

            <Col xs={24} sm={8} lg={4}>
              <Form.Item name="guests" label="Số khách">
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>

            <Col xs={24} sm={16} lg={8}>
              {/* No marks: the tick row below would make this column taller than the other fields and misalign the row.
                  The selected price range is shown right in the label. */}
              <Form.Item name="price" label={`Giá mỗi đêm: ${formatPriceShort(price[0])} – ${formatPriceShort(price[1])}`}>
                <Slider
                  range
                  min={0}
                  max={PRICE_MAX}
                  step={PRICE_STEP}
                  tooltip={{ formatter: (value) => formatVND(value) }}
                />
              </Form.Item>
            </Col>

            <Col xs={24} lg={4}>
              {/* On the same row as the other fields an empty label is needed so the button lines up with the inputs; when wrapped it isn't */}
              <Form.Item label={screens.lg ? ' ' : null} colon={false}>
                <Button type="primary" htmlType="submit" icon={<SearchOutlined />} block>
                  Tìm phòng
                </Button>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Card>

      {renderResults()}
    </Space>
  );
}
