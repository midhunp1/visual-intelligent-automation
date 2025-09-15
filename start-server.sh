#!/bin/bash
cd /app
export RUNNING_IN_DOCKER=true
export DISPLAY=:99
exec node server-working.js
