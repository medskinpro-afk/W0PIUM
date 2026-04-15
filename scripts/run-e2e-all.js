const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function runStep(label, args) {
  return new Promise((resolve) => {
    const start = Date.now();
    const rootDir = path.resolve(__dirname, '..');
    const pwBin =
      process.platform === 'win32'
        ? path.join(rootDir, 'node_modules', '.bin', 'playwright.cmd')
        : path.join(rootDir, 'node_modules', '.bin', 'playwright');

    if (!fs.existsSync(pwBin)) {
      console.error(
        `run-e2e-all: Playwright CLI missing at ${pwBin}. Run: npm ci && npx playwright install chromium`,
      );
      resolve({
        label,
        ok: false,
        code: 1,
        ms: Date.now() - start,
      });
      return;
    }

    const cmd = `"${pwBin}" ${args.join(' ')}`;
    let out = '';
    let err = '';
    const child = spawn(cmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };

    child.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      err += s;
      process.stderr.write(s);
    });
    child.on('error', (e) => {
      console.error(`run-e2e-all spawn error (${label}):`, e?.message || e);
      finish({
        label,
        ok: false,
        code: 1,
        ms: Date.now() - start,
      });
    });
    child.on('close', (code) => {
      if (code !== 0) {
        if (out.trim()) {
          console.log('\n--- Captured stdout ---\n' + out.trim());
        }
        if (err.trim()) {
          console.log('\n--- Captured stderr ---\n' + err.trim());
        }
      }
      finish({
        label,
        ok: code === 0,
        code: code ?? 1,
        ms: Date.now() - start,
      });
    });
  });
}

function fmtMs(ms) {
  const s = Math.round(ms / 1000);
  return `${s}s`;
}

async function main() {
  const continueOnFail = process.argv.includes('--continue-on-fail');
  const rootDir = path.resolve(__dirname, '..');
  const steps = [
    {
      label: 'Local smoke',
      args: [
        'test',
        `--config=${path.join(rootDir, 'playwright.config.js')}`,
        '--project=chromium',
        '--reporter=line',
      ],
    },
    {
      label: 'Production smoke',
      args: [
        'test',
        `--config=${path.join(rootDir, 'playwright.prod.config.js')}`,
        '--project=chromium',
        '--reporter=line',
      ],
    },
  ];

  const results = [];
  for (const step of steps) {
    console.log(`\n=== ${step.label} ===`);
    const result = await runStep(step.label, step.args);
    results.push(result);
    console.log(`--- ${step.label}: ${result.ok ? 'PASS' : 'FAIL'} (${fmtMs(result.ms)}) ---`);
    if (!result.ok && !continueOnFail) break;
  }

  console.log('\n=== E2E Summary ===');
  results.forEach((r) => {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} | ${r.label} | ${fmtMs(r.ms)}`);
  });

  const failed = results.find((r) => !r.ok);
  if (failed) {
    if (continueOnFail) {
      const failedLabels = results
        .filter((r) => !r.ok)
        .map((r) => r.label)
        .join(', ');
      console.log(
        `\nOverall: FAIL (${failedLabels}) — exit 0 (--continue-on-fail), pipeline may still deploy`,
      );
      process.exit(0);
    }
    console.log(`\nOverall: FAIL (${failed.label})`);
    process.exit(1);
  }
  console.log('\nOverall: PASS');
  process.exit(0);
}

main().catch((e) => {
  console.error('Runner failed:', e?.message || e);
  process.exit(1);
});
