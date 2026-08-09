import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

if (process.platform === 'darwin') {
  const outRoot = path.resolve('out');
  const applicationPaths = existsSync(outRoot)
    ? readdirSync(outRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('MathKhata-darwin-'))
      .map((entry) => path.join(outRoot, entry.name, 'MathKhata.app'))
      .filter(existsSync)
    : [];

  if (applicationPaths.length === 0) throw new Error('No packaged macOS MathKhata app was found.');

  for (const applicationPath of applicationPaths) {
    if (!process.env.APPLE_CODESIGN_IDENTITY) {
      execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', applicationPath], { stdio: 'inherit' });
    }
    execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', applicationPath], {
      stdio: 'inherit',
    });
  }
}
