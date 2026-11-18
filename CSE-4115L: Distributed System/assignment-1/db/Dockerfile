# PostgreSQL image pre-loaded with the application schema and seed data.
#
# The init script is baked into the image instead of bind-mounted because the
# repository path contains a colon ("CSE-4115L:"), which Docker's bind-mount
# parser treats as a mount-option separator.
#
#   docker compose up -d        # creates the database, schema and seed rows
FROM postgres:16-alpine

COPY init.sql /docker-entrypoint-initdb.d/init.sql
