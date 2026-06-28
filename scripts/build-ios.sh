#!/bin/bash
# build-ios.sh — Local iOS build script for LaTeXSnipper
#
# Usage:
#   bash scripts/build-ios.sh              # Build + open Xcode (recommended)
#   bash scripts/build-ios.sh --simulator  # Build for Simulator only
#   bash scripts/build-ios.sh --device     # Build IPA for real device
#
# Apple ID signing (free, no $99 needed):
#   1. Open Xcode → Preferences → Accounts → Add Apple ID
#   2. Open project → Signing & Capabilities → select your team
#   3. Xcode handles provisioning profile automatically
#   Limitation: re-sign every 7 days, max 3 apps simultaneously

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
MODE="${1:---open}"

cd "$ROOT_DIR"

echo "===== LaTeXSnipper iOS Build ====="
echo "Mode: $MODE"
echo ""

# Step 1: Build web assets
echo "[1/5] Building web assets..."
npm run build
echo ""

# Step 2: Setup iOS platform
echo "[2/5] Setting up iOS platform..."
if [ ! -d "ios" ]; then
  npx cap add ios
fi
npx cap sync ios
echo ""

# Step 3: Install CocoaPods
echo "[3/5] Installing CocoaPods..."
cd ios/App
pod install --repo-update 2>&1 || pod install 2>&1 || echo "Warning: pod install failed"
cd "$ROOT_DIR"
echo ""

# Step 4: Build or Open
echo "[4/5] Building..."
cd ios/App

if [ "$MODE" = "--simulator" ]; then
  echo "Building for Simulator..."
  xcodebuild build \
    -workspace App.xcworkspace \
    -scheme App \
    -destination 'platform=iOS Simulator,name=iPhone 16' \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO 2>&1 | tail -5

  APP=$(find ~/Library/Developer/Xcode/DerivedData -name "App.app" -path "*/Build/Products/*" 2>/dev/null | head -1)
  if [ -n "$APP" ]; then
    echo "Simulator app: $APP"
    echo "Install: xcrun simctl install booted $APP"
  fi

elif [ "$MODE" = "--device" ]; then
  echo "Building for real device..."
  echo ""
  echo "If this is your first time, you need to:"
  echo "  1. Open Xcode → Preferences → Accounts → Add your Apple ID"
  echo "  2. Open this project in Xcode"
  echo "  3. Signing & Capabilities → select your team"
  echo "  4. Xcode will create provisioning profile automatically"
  echo ""
  xcodebuild build \
    -workspace App.xcworkspace \
    -scheme App \
    -configuration Release \
    CODE_SIGN_STYLE=Automatic 2>&1 | tail -10

else
  # --open: just open Xcode
  echo "Opening Xcode..."
  open App.xcworkspace
  echo ""
  echo "In Xcode:"
  echo "  1. Select your Apple ID in Signing & Capabilities"
  echo "  2. Select your connected iPhone as target"
  echo "  3. Click Run (▶)"
  echo ""
  echo "Xcode will handle signing and install the app on your device."
fi

cd "$ROOT_DIR"
echo ""
echo "===== Done ====="
