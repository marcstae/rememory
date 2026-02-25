import * as fs from 'fs';

async function globalTeardown() {
  const setupPath = process.env.REMEMORY_E2E_SETUP;
  if (!setupPath || !fs.existsSync(setupPath)) return;

  const setup = JSON.parse(fs.readFileSync(setupPath, 'utf8'));
  if (setup.tmpDir && fs.existsSync(setup.tmpDir)) {
    fs.rmSync(setup.tmpDir, { recursive: true, force: true });
  }
}

export default globalTeardown;
