#!/usr/bin/env bash
# verify-release.sh — verify a published chio.chio-cursor VSIX release.
#
# Usage:
#   scripts/verify-release.sh <version>
#   CHIO_DRY_RUN=true scripts/verify-release.sh <version> [<fixture.vsix>]
#
# Checks:
#   - Sigstore cosign sign-blob signature on the .vsix (keyless, OIDC-backed)
#   - SLSA L3 provenance via slsa-verifier verify-artifact (generic generator)
#
# Required tools:
#   cosign, slsa-verifier, shasum, curl (for Marketplace download)
#
# Dry-run mode (CHIO_DRY_RUN=true) skips network calls; useful for syntax
# checking and CI shimming. Pass a fixture .vsix as $2 to short-circuit
# the Marketplace download step.

set -euo pipefail

PKG="chio.chio-cursor"
SOURCE_REPO="${CHIO_GH_OWNER:-owner}/chio-cursor-plugin"
# Signer identity regex: the publish workflow runs from the release.yml on the
# same repo, so the certificate subject will contain this ref pattern.
IDENTITY_REGEX="^https://github.com/${SOURCE_REPO}/\\.github/workflows/release\\.yml@refs/tags/v.*$"
HERE="$(cd "$(dirname "$0")" && pwd)"

# Locate the shared library.
LIB=""
for candidate in \
  "$HERE/verify-release-lib.sh" \
  "$HERE/../../chio-ci-actions/scripts/verify-release-lib.sh" \
  "/usr/local/lib/chio/verify-release-lib.sh"; do
  if [[ -f "$candidate" ]]; then LIB="$candidate"; break; fi
done
if [[ -z "$LIB" ]]; then
  echo "ERROR: chio-ci-actions/scripts/verify-release-lib.sh not found" >&2
  exit 2
fi
# shellcheck disable=SC1090
source "$LIB"

VERSION="${1:-}"
FIXTURE="${2:-}"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version> [<fixture.vsix>]" >&2
  exit 1
fi

echo "=== Verifying $PKG@$VERSION (source: github.com/$SOURCE_REPO) ==="

failed=0

if [[ "$CHIO_DRY_RUN" != "true" ]]; then
  chio::require_tools cosign slsa-verifier shasum curl
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

vsix_path=""
sig_path=""
cert_path=""
prov_path=""

if [[ -n "$FIXTURE" && -f "$FIXTURE" ]]; then
  echo "Using fixture: $FIXTURE"
  cp "$FIXTURE" "$tmp/chio.vsix"
  vsix_path="$tmp/chio.vsix"
  # Sidecar sig/cert/prov fixtures live next to the .vsix by convention.
  [[ -f "${FIXTURE}.sig" ]] && cp "${FIXTURE}.sig" "$tmp/chio.vsix.sig" && sig_path="$tmp/chio.vsix.sig"
  [[ -f "${FIXTURE}.pem" ]] && cp "${FIXTURE}.pem" "$tmp/chio.vsix.pem" && cert_path="$tmp/chio.vsix.pem"
  [[ -f "${FIXTURE}.intoto.jsonl" ]] && cp "${FIXTURE}.intoto.jsonl" "$tmp/chio.vsix.intoto.jsonl" && prov_path="$tmp/chio.vsix.intoto.jsonl"
elif [[ "$CHIO_DRY_RUN" == "true" ]]; then
  echo "[DRY] would: download $PKG $VERSION .vsix from GitHub Releases"
  vsix_path="$tmp/chio.vsix"
  sig_path="$tmp/chio.vsix.sig"
  cert_path="$tmp/chio.vsix.pem"
  prov_path="$tmp/chio.vsix.intoto.jsonl"
  : > "$vsix_path"
  : > "$sig_path"
  : > "$cert_path"
  : > "$prov_path"
else
  # Marketplace downloads aren't signed; the authoritative artefact is on the
  # GitHub Release page (chio-cursor-${VERSION}.vsix + .sig + .pem + .intoto.jsonl).
  base="https://github.com/${SOURCE_REPO}/releases/download/${VERSION}"
  vsix_path="$tmp/chio.vsix"
  sig_path="$tmp/chio.vsix.sig"
  cert_path="$tmp/chio.vsix.pem"
  prov_path="$tmp/chio.vsix.intoto.jsonl"
  curl -fsSL -o "$vsix_path" "$base/chio.vsix"
  curl -fsSL -o "$sig_path"  "$base/chio.vsix.sig"
  curl -fsSL -o "$cert_path" "$base/chio.vsix.pem"
  curl -fsSL -o "$prov_path" "$base/chio.vsix.intoto.jsonl"
fi

chio::verify_cosign_blob "$vsix_path" "$sig_path" "$cert_path" "$IDENTITY_REGEX" \
  || failed=$((failed+1))
chio::verify_slsa_blob "$vsix_path" "$prov_path" "$SOURCE_REPO" \
  || failed=$((failed+1))

chio::summary "$PKG@$VERSION" "$failed"
