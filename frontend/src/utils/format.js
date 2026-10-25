import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat); // needed for dayjs(value, format, true): parse dates in exactly one format

const vnd = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

export const formatVND = (amount) => vnd.format(Number(amount) || 0);

// Dates (without time) across the project use ISO "YYYY-MM-DD": in the URL (?check_in=...),
// when sending to the backend and when the backend responds. No day/month ambiguity.
export const ISO_DATE_FORMAT = 'YYYY-MM-DD';

/** dayjs -> "YYYY-MM-DD" */
export const toIsoDate = (date) => date.format(ISO_DATE_FORMAT);

/** "2026-11-01" -> "01/11/2026" for display */
export const formatDate = (value) => {
  const parsed = dayjs(value, ISO_DATE_FORMAT, true);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : String(value ?? '');
};

/** ISO string with timezone ("...+00:00") -> the browser's local time */
export const formatDateTime = (value) => dayjs(value).format('DD/MM/YYYY HH:mm');

// Price filter on the slider (VND per night). Dragging all the way right means "no limit".
export const PRICE_MAX = 5_000_000;
export const PRICE_STEP = 100_000;
