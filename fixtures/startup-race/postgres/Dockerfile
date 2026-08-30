FROM postgres:17-alpine

COPY fixtures/startup-race/postgres/delayed-entrypoint.sh /usr/local/bin/delayed-postgres-entrypoint.sh
RUN chmod 755 /usr/local/bin/delayed-postgres-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/delayed-postgres-entrypoint.sh"]
CMD ["postgres"]
