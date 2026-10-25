// Client-side validation rules, mirroring validators.py in the backend to report errors while typing.
// The backend is still the final check; do not treat this as a security layer.

export const emailRules = [
  { required: true, message: 'Vui lòng nhập email' },
  { type: 'email', message: 'Email không hợp lệ' },
  { max: 254, message: 'Email quá dài' },
];

export const fullNameRules = [
  { required: true, whitespace: true, message: 'Vui lòng nhập họ tên' },
  { min: 2, max: 100, message: 'Họ tên dài từ 2 đến 100 ký tự' },
  {
    pattern: /^\p{L}[\p{L}\p{M} '’.-]*$/u,
    message: 'Họ tên chỉ gồm chữ cái, khoảng trắng, dấu nháy, dấu chấm và dấu gạch ngang',
  },
];

export const phoneRules = [
  {
    validator: (_, value) => {
      if (!value) return Promise.resolve(); // optional
      const digits = value.replace(/[ .\-()]/g, '');
      return /^\+?\d{8,15}$/.test(digits)
        ? Promise.resolve()
        : Promise.reject(new Error('Số điện thoại gồm 8-15 chữ số (có thể bắt đầu bằng +)'));
    },
  },
];

export const PASSWORD_HINT = 'Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.';

export const passwordRules = [
  { required: true, message: 'Vui lòng nhập mật khẩu' },
  {
    validator: (_, value) => {
      if (!value) return Promise.resolve();
      const missing = [];
      if (value.length < 8) missing.push('tối thiểu 8 ký tự');
      if (value.length > 128) missing.push('tối đa 128 ký tự');
      if (!/\p{Ll}/u.test(value)) missing.push('chữ thường');
      if (!/\p{Lu}/u.test(value)) missing.push('chữ hoa');
      if (!/\d/.test(value)) missing.push('chữ số');
      if (!/[^\p{L}\p{N}\s]/u.test(value)) missing.push('ký tự đặc biệt');
      return missing.length === 0
        ? Promise.resolve()
        : Promise.reject(new Error(`Mật khẩu cần có: ${missing.join(', ')}`));
    },
  },
];

/** For the "Confirm password" field: <Form.Item dependencies={['password']} rules={confirmPasswordRules}> */
export const confirmPasswordRules = [
  { required: true, message: 'Vui lòng nhập lại mật khẩu' },
  ({ getFieldValue }) => ({
    validator: (_, value) =>
      !value || getFieldValue('password') === value
        ? Promise.resolve()
        : Promise.reject(new Error('Mật khẩu xác nhận không khớp')),
  }),
];
