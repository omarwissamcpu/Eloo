import { ApiError } from './api';
import type { StringKey } from './i18n/strings';

const MAP: Record<string, StringKey> = {
  network: 'errorNetwork',
  too_many_requests: 'errorTooMany',
  wait_before_resend: 'errorTooMany',
  too_many_attempts: 'errorTooMany',
  too_many_reports: 'tooManyReports',
  wrong_code: 'wrongCode',
  code_expired: 'codeExpired',
  invalid_phone: 'invalidPhone',
};

export function errorKey(e: unknown): StringKey {
  if (e instanceof ApiError) return MAP[e.code] || 'errorGeneric';
  return 'errorGeneric';
}
