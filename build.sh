#!/usr/bin/env bash
set -e

# Concatenate all modules in exact logical sequence to bundle static/app.js
cat \
  static/js/state.js \
  static/js/logger.js \
  static/js/audio.js \
  static/js/radar.js \
  static/js/strips.js \
  static/js/physics_ground.js \
  static/js/safety.js \
  static/js/tactical.js \
  static/js/weather.js \
  static/js/physics_air.js \
  static/js/controller.js \
  > static/app.js

echo "Successfully built static/app.js ($(wc -l < static/app.js) lines)"
