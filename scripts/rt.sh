#!/bin/sh
# Runtime-agnostic script runner - detects bun or npm and executes the command
if command -v bun >/dev/null 2>&1; then
  exec bun "$@"
else
  exec npm "$@"
fi
