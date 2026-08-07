# Backup and Recovery

MathKhata keeps its live Git repository on local storage at `~/Projects/MathKhata`. Google Drive is a durable backup destination, not the working dependency tree.

## Backup layout

The backup script discovers a mounted Google Drive under `~/Library/CloudStorage/GoogleDrive-*`, unless `MATHKHATA_DRIVE_ROOT` provides an explicit writable Drive root. It creates only this project-owned structure:

```text
MathKhata/
  source-mirror/
  git-backups/
  snapshots/
  notebook-exports/
  docs/
```

The source mirror includes source, tests, public assets, documentation, scripts, package/configuration manifests, README, AGENTS.md, and selected Git metadata. It excludes dependency trees, build/test artifacts, caches, logs, secrets, temporary browser data, and other generated content.

Backups never use destination-deleting synchronization. The latest Git bundle is replaced atomically after a new bundle validates; timestamped bundles and source snapshots are created at meaningful milestones rather than every edit.

## Commands

```sh
./scripts/backup-to-drive.sh
./scripts/backup-to-drive.sh --snapshot
./scripts/install-git-hooks.sh
```

The local post-commit hook invokes a lightweight mirror and Git-bundle backup. Drive unavailability prints a warning and returns success so a local commit is never blocked.

## Recovery

To recover source, copy `source-mirror/` to a new local directory, install dependencies, and run the checks. To recover full Git history, clone a validated bundle:

```sh
git clone MathKhata-latest.bundle MathKhata-recovered
```

Notebook content lives in the browser's IndexedDB and is not part of the source repository. Use in-app JSON export to put notebook documents in `notebook-exports/`; import validates data before saving it.

The final verified mount, timestamps, and backup contents are recorded here after Stage 1 verification.

