// All runtime settings come from environment variables so the same code runs
// on a laptop, a staging server and production.
import crypto from 'node:crypto';

const env = process.env;

export function loadConfig(overrides = {}) {
  const isProd = env.NODE_ENV === 'production';
  // In production with no JWT_SECRET set, the server creates a random one on first start
  // and keeps it in the database (see app.js), so no secret has to be pasted anywhere.
  const jwtSecret = env.JWT_SECRET || (isProd ? null : 'dev-only-secret-change-me');

  return {
    port: Number(env.PORT || 4000),
    // libsql://<name>.turso.io (free Turso database) or file:./eloo.db for local use.
    databaseUrl: env.DATABASE_URL || (env.DB_PATH ? 'file:' + env.DB_PATH : 'file:./eloo.db'),
    databaseAuthToken: env.DATABASE_AUTH_TOKEN || null,
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
    otpPepper: env.OTP_PEPPER || (jwtSecret ? crypto.createHash('sha256').update(jwtSecret).digest('hex') : null),
    ...overrides,
  };
}
