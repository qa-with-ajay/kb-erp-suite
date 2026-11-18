
FROM postgres:17-alpine

RUN apk add --no-cache rclone tzdata coreutils

ENV TZ=Asia/Kolkata

COPY crontab /etc/crontabs/root
COPY backup.sh /scripts/backup.sh

RUN chmod 700 /scripts/backup.sh \
    && chmod 600 /etc/crontabs/root

CMD ["crond", "-f", "-l", "2"]
