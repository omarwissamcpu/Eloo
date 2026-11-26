#!/usr/bin/env bash
# One-time setup of eloo's routing + search server on a fresh Ubuntu VPS.
# Usage:  ROUTING_HOST=routing.eloo.app SEARCH_HOST=search.eloo.app ./setup.sh
# Point both DNS names at this server's IP first, so HTTPS certificates can be issued.
set -euo pipefail
cd "$(dirname "$0")"

: "${ROUTING_HOST:?set ROUTING_HOST, e.g. routing.eloo.app}"
: "${SEARCH_HOST:?set SEARCH_HOST, e.g. search.eloo.app}"

if ! command -v docker >/dev/null; then
  echo "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
fi

mkdir -p data
echo "Downloading the Iraq OpenStreetMap extract (Geofabrik)…"
curl -fL -o data/iraq-latest.osm.pbf https://download.geofabrik.de/asia/iraq-latest.osm.pbf

echo "Preparing the car routing graph (takes a few minutes)…"
IMG=ghcr.io/project-osrm/osrm-backend:latest
docker run --rm -v "$PWD/data:/data" $IMG osrm-extract -p /opt/car.lua /data/iraq-latest.osm.pbf
docker run --rm -v "$PWD/data:/data" $IMG osrm-partition /data/iraq-latest.osrm
docker run --rm -v "$PWD/data:/data" $IMG osrm-customize /data/iraq-latest.osrm

printf 'ROUTING_HOST=%s\nSEARCH_HOST=%s\n' "$ROUTING_HOST" "$SEARCH_HOST" > .env
docker compose up -d

echo
echo "Done. Photon downloads its search index on first start (can take a while)."
echo "Then set on the eloo backend:"
echo "  OSRM_URL=https://$ROUTING_HOST"
echo "  PHOTON_URL=https://$SEARCH_HOST"
echo "To refresh the map later, re-run this script (weekly or monthly)."
