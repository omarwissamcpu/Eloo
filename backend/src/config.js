// All runtime settings come from environment variables so the same code runs
// on a laptop, a staging server and production.
import crypto from 'node:crypto';

const env = process.env;

export function loadConfig(overrides = {}) {
  const isProd = env.NODE_ENV === 'production';
  const jwtSecret = env.JWT_SECRET || (isProd ? null : 'dev-only-secret-change-me');
  if (!jwtSecret) throw new Error('JWT_SECRET must be set in production');

  return {
    port: Number(env.PORT || 4000),
    dbPath: env.DB_PATH || './eloo.db',
    jwtSecret,
    tokenTtlDays: Number(env.TOKEN_TTL_DAYS || 90),
    // Routing engine. The public OSRM demo is for development only:
    // self-host OSRM (or Valhalla) with the Iraq extract before launch.
    osrmUrl: env.OSRM_URL || 'https://router.project-osrm.org',
    // Place search. Public Photon is for development only: self-host before launch.
    photonUrl: env.PHOTON_URL || 'https://photon.komoot.io',
    // SMS for phone sign-up: "console" prints codes to the log (development).
    smsProvider: env.SMS_PROVIDER || 'console',
    twilio: {
      sid: env.TWILIO_ACCOUNT_SID,
      token: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_FROM,
    },
    otpPepper: env.OTP_PEPPER || crypto.createHash('sha256').update(jwtSecret).digest('hex'),
    ...overrides,
  };
}
