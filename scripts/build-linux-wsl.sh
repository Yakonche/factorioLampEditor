#!/usr/bin/env bash
set -euo pipefail

project_source=$(pwd)
if [[ ! -f "$project_source/package.json" ]]; then
  printf 'Run this script from the Factorio Lamp Editor repository root.\n' >&2
  exit 1
fi

build_directory=$(mktemp -d /tmp/fle-linux-build.XXXXXX)
node_directory="$build_directory/node"
project_directory="$build_directory/project"
mkdir -p "$node_directory" "$project_directory"

curl -fsSL \
  https://nodejs.org/dist/v22.12.0/node-v22.12.0-linux-x64.tar.xz \
  -o "$build_directory/node.tar.xz"
tar -xJf "$build_directory/node.tar.xz" -C "$node_directory" --strip-components=1

tar -C "$project_source" \
  --exclude=.git \
  --exclude=node_modules \
  --exclude=release \
  --exclude=dist \
  --exclude=build-resources \
  -cf - . | tar -C "$project_directory" -xf -

export PATH="$node_directory/bin:$PATH"
cd "$project_directory"
npm ci
npm run build
node scripts/prepare-linux-ffmpeg.cjs
npm exec electron-builder -- --linux --x64 --publish never

app_version=$(node -p "require('./package.json').version")
artifact_name="Factorio Lamp Editor-$app_version-linux-x86_64.AppImage"
archive_name="Factorio Lamp Editor-$app_version-linux-x64.tar.gz"
cp "$project_directory/release/$artifact_name" "$project_source/release/$artifact_name"
cp "$project_directory/release/$archive_name" "$project_source/release/$archive_name"
printf 'Linux AppImage copied to %s/release/%s\n' "$project_source" "$artifact_name"
printf 'Linux archive copied to %s/release/%s\n' "$project_source" "$archive_name"
printf 'Temporary isolated build kept at %s\n' "$build_directory"
