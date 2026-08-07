#!/bin/sh

# Shared, side-effect-free path discovery for the backup script and tests.

discover_google_drive_root() {
  cloud_storage_root="${1:-$HOME/Library/CloudStorage}"

  if [ -n "${MATHKHATA_DRIVE_ROOT:-}" ]; then
    if [ -d "$MATHKHATA_DRIVE_ROOT" ] && [ -w "$MATHKHATA_DRIVE_ROOT" ]; then
      printf '%s\n' "$MATHKHATA_DRIVE_ROOT"
      return 0
    fi
    printf 'Configured Google Drive root is unavailable or not writable: %s\n' "$MATHKHATA_DRIVE_ROOT" >&2
    return 1
  fi

  for account_root in "$cloud_storage_root"/GoogleDrive-*; do
    [ -d "$account_root" ] || continue
    for drive_root in "$account_root/My Drive" "$account_root/MyDrive"; do
      if [ -d "$drive_root" ] && [ -w "$drive_root" ]; then
        printf '%s\n' "$drive_root"
        return 0
      fi
    done
  done

  printf 'No writable mounted Google Drive was found under %s\n' "$cloud_storage_root" >&2
  return 1
}

resolve_mathkhata_backup_root() {
  detected_drive_root="$(discover_google_drive_root "${1:-$HOME/Library/CloudStorage}")" || return 1
  printf '%s/MathKhata\n' "$detected_drive_root"
}

