import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const helper = join(process.cwd(), 'scripts/lib/drive-paths.sh');
const temporaryRoots: string[] = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), 'mathkhata-path-test-'));
  temporaryRoots.push(root);
  return root;
}

function runFunction(name: string, cloudRoot: string, configuredRoot = ''): string {
  return execFileSync(
    '/bin/bash',
    ['-c', 'source "$1"; "$2" "$3"', 'mathkhata-test', helper, name, cloudRoot],
    {
      encoding: 'utf8',
      env: { ...process.env, MATHKHATA_DRIVE_ROOT: configuredRoot },
    },
  ).trim();
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Google Drive backup path discovery', () => {
  it('honors an explicit writable Drive root', () => {
    const root = temporaryRoot();
    const configured = join(root, 'Configured Drive');
    mkdirSync(configured);
    expect(runFunction('discover_google_drive_root', join(root, 'unused'), configured)).toBe(configured);
  });

  it('discovers a mounted My Drive without hardcoding an account email', () => {
    const cloudRoot = temporaryRoot();
    const drive = join(cloudRoot, 'GoogleDrive-person@example.test', 'My Drive');
    mkdirSync(drive, { recursive: true });
    expect(runFunction('discover_google_drive_root', cloudRoot)).toBe(drive);
    expect(runFunction('resolve_mathkhata_backup_root', cloudRoot)).toBe(join(drive, 'MathKhata'));
  });
});

