#!/bin/bash
# Prevent infinite recursion during postinstall
# install-app-deps can trigger nested npm installs
# which would re-run postinstall, spawning hundreds of processes

if [ -n "$SUPERSET_POSTINSTALL_RUNNING" ]; then
  exit 0
fi

export SUPERSET_POSTINSTALL_RUNNING=1

# Run sherif for workspace validation
sherif

# Install native dependencies for desktop app
npm run install:deps
