import { useEffect, useMemo } from 'react';
import { App, Button, Empty, Image, Space, Tag, Typography, Upload } from 'antd';
import { DeleteOutlined, InboxOutlined } from '@ant-design/icons';

export const MAX_IMAGES = 20;
const MAX_SIZE_MB = 5;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const thumbStyle = { width: 112, height: 84, objectFit: 'cover', borderRadius: 6, display: 'block' };
const removeButtonStyle = { position: 'absolute', top: 4, right: 4 };

/** Filter selected files: correct type, ≤ 5MB, not exceeding the total image count. Errors are merged into one message. */
function filterFiles(files, currentCount, message) {
  const accepted = [];
  const problems = [];

  files.forEach((file) => {
    if (!ACCEPTED_TYPES.includes(file.type)) problems.push(`${file.name}: chỉ nhận JPG, PNG, WebP`);
    else if (file.size > MAX_SIZE_MB * 1024 * 1024) problems.push(`${file.name}: vượt quá ${MAX_SIZE_MB}MB`);
    else if (currentCount + accepted.length >= MAX_IMAGES) problems.push(`${file.name}: đã đủ ${MAX_IMAGES} ảnh`);
    else accepted.push(file);
  });

  if (problems.length) message.warning(problems.slice(0, 3).join('; ') + (problems.length > 3 ? ` (+${problems.length - 3} lỗi khác)` : ''));
  return accepted;
}

/**
 * Pick images for a room type. This component does NOT call the API: all changes live in the form state,
 * and the parent component sends them to the server when the admin clicks Save.
 *
 * - savedImages: URLs of images already on the server that the admin is keeping
 * - pendingFiles: newly selected files, not uploaded yet
 */
export default function RoomTypeImageManager({ savedImages, onSavedImagesChange, pendingFiles, onPendingFilesChange }) {
  const { message } = App.useApp();

  // Preview URLs for files not uploaded yet; revoked on change/unmount to avoid memory leaks
  const previews = useMemo(() => pendingFiles.map((file) => ({ file, url: URL.createObjectURL(file) })), [pendingFiles]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const currentCount = savedImages.length + pendingFiles.length;

  // beforeUpload runs for each file; process the whole batch only once, on the first file of the batch
  const handleBatch = (file, fileList) => {
    if (file !== fileList[0]) return Upload.LIST_IGNORE;
    const accepted = filterFiles(fileList, currentCount, message);
    if (accepted.length > 0) onPendingFilesChange([...pendingFiles, ...accepted]);
    return Upload.LIST_IGNORE; // don't let antd upload/render the file list itself
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space>
        <Typography.Text strong>Ảnh phòng</Typography.Text>
        <Tag>
          {currentCount}/{MAX_IMAGES}
        </Tag>
      </Space>

      {currentCount === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Chưa có ảnh nào" style={{ margin: 0 }} />
      ) : (
        <Image.PreviewGroup>
          <Space wrap size={12}>
            {savedImages.map((src, index) => (
              <div key={src} style={{ position: 'relative' }}>
                <Image src={src} width={112} height={84} style={{ objectFit: 'cover', borderRadius: 6 }} />
                {index === 0 && (
                  <Tag color="blue" style={{ position: 'absolute', left: 4, bottom: 4, margin: 0 }}>
                    Ảnh đại diện
                  </Tag>
                )}
                <Button
                  size="small"
                  danger
                  shape="circle"
                  icon={<DeleteOutlined />}
                  style={removeButtonStyle}
                  onClick={() => onSavedImagesChange(savedImages.filter((s) => s !== src))}
                />
              </div>
            ))}

            {previews.map(({ file, url }, index) => (
              <div key={url} style={{ position: 'relative' }}>
                <img src={url} alt={file.name} style={thumbStyle} />
                <Tag color="gold" style={{ position: 'absolute', left: 4, bottom: 4, margin: 0 }}>
                  Chưa lưu
                </Tag>
                <Button
                  size="small"
                  danger
                  shape="circle"
                  icon={<DeleteOutlined />}
                  style={removeButtonStyle}
                  onClick={() => onPendingFilesChange(pendingFiles.filter((_, i) => i !== index))}
                />
              </div>
            ))}
          </Space>
        </Image.PreviewGroup>
      )}

      <Upload.Dragger
        multiple
        accept={ACCEPTED_TYPES.join(',')}
        showUploadList={false}
        beforeUpload={handleBatch}
        disabled={currentCount >= MAX_IMAGES}
        style={{ padding: '4px 0' }}
      >
        <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
          <InboxOutlined />
        </p>
        <p className="ant-upload-text" style={{ fontSize: 14 }}>
          Bấm hoặc kéo thả ảnh vào đây
        </p>
        <p className="ant-upload-hint" style={{ fontSize: 12 }}>
          JPG, PNG, WebP · tối đa {MAX_SIZE_MB}MB mỗi ảnh · tối đa {MAX_IMAGES} ảnh · thay đổi được lưu khi bấm Lưu
        </p>
      </Upload.Dragger>
    </Space>
  );
}
