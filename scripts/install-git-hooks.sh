#!/bin/sh

set -u

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
project_root="$(CDPATH= cd -- "$script_dir/.." && pwd)"

chmod +x "$project_root/.githooks/post-commit" "$project_root/scripts/backup-to-drive.sh" "$project_root/scripts/lib/drive-paths.sh"
git -C "$project_root" config core.hooksPath .githooks
printf 'Installed MathKhata fail-safe post-commit backup hook.\n'

