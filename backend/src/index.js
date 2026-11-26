import { loadConfig } from './config.js';
import { createApp } from './app.js';

const cfg = loadConfig();
const { server } = createApp(cfg);
server.listen(cfg.port, () => {
  console.log(`eloo backend listening on http://localhost:${cfg.port}/v1`);
});
