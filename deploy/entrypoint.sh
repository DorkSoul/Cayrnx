#!/bin/sh
# Run Cayrnx as PUID:PGID so files written into bind-mounted target projects keep the host
# user's ownership. The CLIs installed in /usr/local are root-owned, so their self-updaters
# can't change the image either.
set -e
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
if [ "$(id -u)" = "0" ]; then
  if ! getent group "$PGID" >/dev/null; then groupadd -o -g "$PGID" cayrnx; fi
  if ! getent passwd "$PUID" >/dev/null; then useradd -o -u "$PUID" -g "$PGID" -d /data/home -s /bin/bash -M cayrnx; fi
  mkdir -p /data/home
  chown "$PUID:$PGID" /data /data/home
  exec gosu "$PUID:$PGID" "$@"
fi
mkdir -p /data/home
exec "$@"
