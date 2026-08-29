FROM postgres:17-alpine

COPY --chmod=755 fixtures/startup-race/postgres/delayed-entrypoint.sh /usr/local/bin/delayed-postgres-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/delayed-postgres-entrypoint.sh"]
CMD ["postgres"]
