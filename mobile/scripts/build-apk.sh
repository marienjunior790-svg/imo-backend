#!/usr/bin/env bash
# Build Intelligence ITC debug APK (arm64 phones).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
npm ci
npx expo prebuild --platform android
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
# phones only — smaller APK
sed -i 's/^reactNativeArchitectures=.*/reactNativeArchitectures=arm64-v8a/' android/gradle.properties || true
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon -PreactNativeArchitectures=arm64-v8a
mkdir -p ../dist
cp -f app/build/outputs/apk/debug/app-debug.apk ../dist/Intelligence-ITC-debug.apk
ls -lh ../dist/Intelligence-ITC-debug.apk
echo "APK prêt : mobile/dist/Intelligence-ITC-debug.apk"
