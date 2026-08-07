#!/bin/sh

set -u

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_root="$(CDPATH= cd -- "$script_dir/.." && pwd)"
. "$script_dir/lib/drive-paths.sh"

create_snapshot=false
quiet=false

for argument in "$@"; do
  case "$argument" in
    --snapshot) create_snapshot=true ;;
    --quiet) quiet=true ;;
    --help)
      printf 'Usage: %s [--snapshot] [--quiet]\n' "$0"
      exit 0
      ;;
    *)
      printf 'Unknown argument: %s\n' "$argument" >&2
      exit 2
      ;;
  esac
done

say() {
  if [ "$quiet" = false ]; then printf '%s\n' "$1"; fi
}

backup_root="$(resolve_mathkhata_backup_root)" || exit 1
source_mirror="$backup_root/source-mirror"
git_backups="$backup_root/git-backups"
snapshots="$backup_root/snapshots"
notebook_exports="$backup_root/notebook-exports"
docs_backup="$backup_root/docs"

if ! mkdir -p "$source_mirror" "$git_backups" "$snapshots" "$notebook_exports" "$docs_backup"; then
  printf 'Could not create the MathKhata backup structure at %s\n' "$backup_root" >&2
  exit 1
fi

timestamp="$(date -u '+%Y%m%dT%H%M%SZ')"
temporary_root="$(mktemp -d "${TMPDIR:-/tmp}/mathkhata-backup.XXXXXX")" || exit 1
cleanup() {
  rm -rf "$temporary_root"
}
trap cleanup EXIT HUP INT TERM

exclude_args="--exclude=node_modules --exclude=dist --exclude=build --exclude=coverage --exclude=playwright-report --exclude=test-results --exclude=blob-report --exclude=.cache --exclude=.vite --exclude=.tmp --exclude=tmp --exclude=logs --exclude=.git --exclude=.DS_Store --exclude=*.log --exclude=*.tmp --exclude=*.temp --exclude=*.tsbuildinfo --exclude=.env --exclude=.env.*"

# Intentionally omit --delete: a temporary local omission must never erase a Drive copy.
# shellcheck disable=SC2086
if ! rsync -a $exclude_args "$project_root/" "$source_mirror/"; then
  printf 'Source mirror backup failed at %s\n' "$source_mirror" >&2
  exit 1
fi

if ! rsync -a --exclude=.DS_Store "$project_root/docs/" "$docs_backup/"; then
  printf 'Documentation backup failed at %s\n' "$docs_backup" >&2
  exit 1
fi

branch="$(git -C "$project_root" branch --show-current 2>/dev/null || printf 'unknown')"
commit="$(git -C "$project_root" rev-parse HEAD 2>/dev/null || printf 'uncommitted')"
metadata_dir="$source_mirror/.backup-metadata"
mkdir -p "$metadata_dir"
{
  printf 'backed_up_at_utc=%s\n' "$timestamp"
  printf 'source=%s\n' "$project_root"
  printf 'branch=%s\n' "$branch"
  printf 'commit=%s\n' "$commit"
} > "$temporary_root/last-backup.txt"
mv "$temporary_root/last-backup.txt" "$metadata_dir/last-backup.txt"

latest_bundle_temp="$temporary_root/MathKhata-latest.bundle"
if ! git -C "$project_root" bundle create "$latest_bundle_temp" --all; then
  printf 'Git bundle creation failed; the existing Drive bundle was left untouched.\n' >&2
  exit 1
fi
if ! git -C "$project_root" bundle verify "$latest_bundle_temp" >/dev/null 2>&1; then
  printf 'Git bundle verification failed; the existing Drive bundle was left untouched.\n' >&2
  exit 1
fi
mv "$latest_bundle_temp" "$git_backups/MathKhata-latest.bundle"

if [ "$create_snapshot" = true ]; then
  cp "$git_backups/MathKhata-latest.bundle" "$git_backups/MathKhata-$timestamp.bundle"
  snapshot_temp="$temporary_root/MathKhata-source-$timestamp.tar.gz"
  if ! tar \
    --exclude='./node_modules' \
    --exclude='./dist' \
    --exclude='./build' \
    --exclude='./coverage' \
    --exclude='./playwright-report' \
    --exclude='./test-results' \
    --exclude='./.git' \
    --exclude='./.cache' \
    --exclude='./.vite' \
    --exclude='./logs' \
    --exclude='./.env' \
    --exclude='./.env.*' \
    --exclude='*.log' \
    --exclude='*.tsbuildinfo' \
    -czf "$snapshot_temp" -C "$project_root" .; then
    printf 'Source snapshot creation failed; existing backups remain intact.\n' >&2
    exit 1
  fi
  mv "$snapshot_temp" "$snapshots/MathKhata-source-$timestamp.tar.gz"
fi

say "MathKhata backup complete"
say "Destination: $backup_root"
say "Commit: $commit"
if [ "$create_snapshot" = true ]; then say "Milestone snapshot: $timestamp"; fi

