
#!/bin/sh
set -eu

: "${DB_HOST:=db}"
: "${DB_PORT:=5432}"
: "${DB_USER:?DB_USER is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${PGPASSWORD:?PGPASSWORD is required}"

export PGPASSWORD

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="/backups/kb_erp_${TIMESTAMP}.dump"
TEMP_FILE="${BACKUP_FILE}.tmp"

echo "Starting database backup: ${TIMESTAMP}"

cleanup() {
    rm -f "$TEMP_FILE"
}
trap cleanup EXIT

# Create PostgreSQL custom-format backup
pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --format=custom \
    --no-password \
    --file="$TEMP_FILE"

# Validate the backup before keeping it
pg_restore --list "$TEMP_FILE" >/dev/null

# Publish completed backup and checksum
mv "$TEMP_FILE" "$BACKUP_FILE"
sha256sum "$BACKUP_FILE" > "${BACKUP_FILE}.sha256"

echo "Local backup completed: ${BACKUP_FILE}"

# Cloud upload is enabled once Rclone is configured
if [ -n "${RCLONE_REMOTE:-}" ]; then
    rclone copy "$BACKUP_FILE" "$RCLONE_REMOTE"
    rclone copy "${BACKUP_FILE}.sha256" "$RCLONE_REMOTE"
    echo "Cloud upload completed"
fi

# Keep 30 days of local backups
find /backups -maxdepth 1 -type f \
    -name "kb_erp_*.dump*" \
    -mtime +30 -delete

# Keep 90 days of cloud backups
if [ -n "${RCLONE_REMOTE:-}" ]; then
    rclone delete "$RCLONE_REMOTE" \
        --min-age 90d \
        --include "kb_erp_*.dump*"
fi

echo "Backup process completed successfully"
