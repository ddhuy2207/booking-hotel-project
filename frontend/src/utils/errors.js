// The backend returns errors as: { success: false, error, code, details?, error_id? }
const MESSAGES_BY_CODE = {
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.',
  INVALID_TOKEN: 'Phiên đăng nhập không hợp lệ, vui lòng đăng nhập lại.',
  UNAUTHORIZED: 'Bạn cần đăng nhập để thực hiện thao tác này.',
  TOO_MANY_REQUESTS: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
  SERVICE_UNAVAILABLE: 'Hệ thống đang tạm thời không khả dụng, vui lòng thử lại sau.',
  RETRY: 'Hệ thống đang bận, vui lòng thử lại.',
};

export function getErrorMessage(error, fallback = 'Đã có lỗi xảy ra, vui lòng thử lại.') {
  const response = error?.response;

  if (!response) {
    return error?.code === 'ECONNABORTED'
      ? 'Máy chủ phản hồi quá lâu, vui lòng thử lại.'
      : 'Không thể kết nối tới máy chủ, vui lòng kiểm tra mạng.';
  }

  const data = response.data || {};

  if (data.code === 'INTERNAL_SERVER_ERROR') {
    return `Lỗi hệ thống${data.error_id ? ` (mã ${data.error_id})` : ''}, vui lòng thử lại sau.`;
  }

  return MESSAGES_BY_CODE[data.code] || data.error || fallback;
}

/**
 * Attach per-field errors (response.data.details = { field: [messages] }) to an Antd form.
 * Returns true if there are field errors to show, false if a general message is needed.
 */
export function applyFieldErrors(form, error) {
  const details = error?.response?.data?.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false;

  const fields = Object.entries(details).map(([name, errors]) => ({
    name,
    errors: Array.isArray(errors) ? errors : [String(errors)],
  }));
  if (fields.length === 0) return false;

  form.setFields(fields);
  return true;
}
