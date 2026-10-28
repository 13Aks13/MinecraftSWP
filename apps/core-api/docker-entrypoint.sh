#!/bin/sh
set -eu

# Bind-mounted volumes are often created by the Docker daemon as root. Make the
# platform directories writable for the unprivileged application user (uid
# 1000, matching the itzg Bedrock image) before dropping privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p /storage /data/worlds /data/behavior_packs /data/resource_packs
  chown -R node:node /storage 2>/dev/null || true
  chmod -R u+rwX /storage 2>/dev/null || true
  chown node:node /data 2>/dev/null || true
  chmod u+rwx /data 2>/dev/null || true

  # The Bedrock container also runs as uid 1000 and replaces/deletes packs when
  # it upgrades. Data restored from another host can be owned by a different
  # uid, which makes that upgrade fail with "Permission denied". Normalize the
  # directories Bedrock has to write to before dropping privileges.
  for dir in /data/worlds /data/behavior_packs /data/resource_packs; do
    if [ -d "$dir" ]; then
      chown -R node:node "$dir" 2>/dev/null || true
      chmod -R u+rwX "$dir" 2>/dev/null || true
    fi
  done

  # Old upgrade backups are pruned by Bedrock on the next upgrade.
  for dir in /data/backup-pre-*; do
    if [ -d "$dir" ] && [ "$(stat -c '%u' "$dir")" != "1000" ]; then
      chown -R node:node "$dir" 2>/dev/null || true
      chmod -R u+rwX "$dir" 2>/dev/null || true
    fi
  done

  find /data -maxdepth 1 -type f -exec chown node:node {} + 2>/dev/null || true
fi

# The Docker socket gid differs between hosts (root on Docker Desktop/OrbStack,
# a dedicated "docker" group on Linux). Make node a member of that group in
# /etc/group so gosu's initgroups() keeps the membership when dropping
# privileges. This is what lets the API control the Bedrock container.
if [ -S "${DOCKER_SOCKET:-/var/run/docker.sock}" ]; then
  socket_gid="$(stat -c '%g' "${DOCKER_SOCKET:-/var/run/docker.sock}")"
  group_name="$(awk -F: -v gid="$socket_gid" '$3 == gid { print $1; exit }' /etc/group)"
  if [ -z "$group_name" ]; then
    group_name="dockerhost"
    printf '%s:x:%s:\n' "$group_name" "$socket_gid" >> /etc/group
  fi
  addgroup node "$group_name" >/dev/null 2>&1 || true
fi

exec gosu node "$@"
