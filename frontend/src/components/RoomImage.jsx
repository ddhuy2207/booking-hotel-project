import { Image } from 'antd';
import { HomeOutlined } from '@ant-design/icons';

// Shown when the image has a URL but fails to load (404, wrong path, blocked...)
const LOAD_ERROR_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">' +
      '<rect width="100%" height="100%" fill="#f5f5f5"/>' +
      '<text x="50%" y="50%" fill="#bfbfbf" font-family="sans-serif" font-size="18" ' +
      'text-anchor="middle" dominant-baseline="middle">Không tải được ảnh</text></svg>',
  );

// Shown when the room type has no images: displays the room name so the card is still informative
function Placeholder({ name, height }) {
  return (
    <div
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '0 16px',
        background: 'linear-gradient(135deg, #e6f4ff 0%, #bae0ff 100%)',
        color: '#1677ff',
        textAlign: 'center',
      }}
    >
      <HomeOutlined style={{ fontSize: 40 }} />
      {name && <span style={{ fontWeight: 600 }}>{name}</span>}
    </div>
  );
}

/** src is the image URL returned by the backend ("/static/uploads/..."); without src, shows a colored box with the room name. */
export default function RoomImage({ src, alt, name, height = 200, preview = false }) {
  if (!src) return <Placeholder name={name || alt} height={height} />;

  return (
    <Image
      src={src}
      fallback={LOAD_ERROR_FALLBACK}
      alt={alt}
      preview={preview}
      width="100%"
      height={height}
      style={{ objectFit: 'cover' }}
    />
  );
}
