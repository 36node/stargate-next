#!/bin/bash

# Setup GitHub secrets from .secrets YAML file
# Usage: scripts/setup-github.sh
# Requires: yq (https://github.com/mikefarah/yq)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if yq is installed
if ! command -v yq &> /dev/null; then
    print_error "yq is not installed. Please install it first."
    echo "Install via: brew install yq"
    echo "Or visit: https://github.com/mikefarah/yq"
    exit 1
fi

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    print_error "GitHub CLI (gh) is not installed. Please install it first."
    echo "Visit: https://cli.github.com/"
    exit 1
fi

# Check if user is authenticated
if ! gh auth status &> /dev/null; then
    print_error "Not authenticated with GitHub CLI. Please run 'gh auth login' first."
    exit 1
fi

# Check if .secrets file exists
SECRETS_FILE=".github/.secrets"
if [ ! -f "$SECRETS_FILE" ]; then
    print_error "Secrets file '$SECRETS_FILE' not found."
    exit 1
fi

print_info "Reading secrets from $SECRETS_FILE (YAML format)..."

# Get all top-level keys from the YAML file
keys=$(yq 'keys | .[]' "$SECRETS_FILE" 2>/dev/null)

if [ -z "$keys" ]; then
    print_warning "No secrets found in $SECRETS_FILE"
    exit 0
fi

# Store keys in an array for later comparison
declare -a local_keys=()
while IFS= read -r key; do
    if [ -n "$key" ]; then
        local_keys+=("$key")
    fi
done <<< "$keys"

# Iterate over each key and set the secret
for key in "${local_keys[@]}"; do
    # Get the value for this key (handles multi-line values correctly)
    value=$(yq ".$key" "$SECRETS_FILE")

    # Skip if value is null or empty
    if [ -z "$value" ] || [ "$value" = "null" ]; then
        print_warning "Skipping empty secret: $key"
        continue
    fi

    print_info "Setting secret: $key"

    # Set the secret using gh CLI
    if echo "$value" | gh secret set "$key"; then
        print_info "✓ Successfully set secret: $key"
    else
        print_error "✗ Failed to set secret: $key"
    fi
done

# ===========================================
# 删除 GitHub 上存在但 .secrets 中不存在的 secrets
# ===========================================
print_info "Checking for secrets to delete..."

# Get all secrets from GitHub
remote_secrets=$(gh secret list --json name -q '.[].name' 2>/dev/null)

if [ -n "$remote_secrets" ]; then
    while IFS= read -r remote_key; do
        # Skip empty keys
        if [ -z "$remote_key" ]; then
            continue
        fi

        # Check if this remote key exists in local keys
        found=false
        for local_key in "${local_keys[@]}"; do
            if [ "$remote_key" = "$local_key" ]; then
                found=true
                break
            fi
        done

        # Delete if not found in local keys
        if [ "$found" = false ]; then
            print_warning "Deleting secret not in $SECRETS_FILE: $remote_key"
            if gh secret delete "$remote_key" 2>&1; then
                print_info "✓ Successfully deleted secret: $remote_key"
            else
                print_error "✗ Failed to delete secret: $remote_key"
            fi
        fi
    done <<< "$remote_secrets"
fi

print_info "GitHub secrets sync completed!"
print_info "You can verify the secrets by running: gh secret list"