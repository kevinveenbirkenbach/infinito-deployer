#!/usr/bin/env bash
set -euo pipefail

mkdir -p /run/sshd
exec /usr/sbin/sshd -D -e
