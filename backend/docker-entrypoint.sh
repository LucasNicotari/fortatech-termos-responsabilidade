#!/bin/sh
set -eu

node node_modules/prisma/build/index.js migrate deploy
node dist/prisma/seed.js
exec node dist/src/main.js
