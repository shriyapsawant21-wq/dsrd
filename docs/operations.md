# Operational Safety

Third-party repositories are untrusted inputs. Inspection is metadata-only and
does not execute package scripts. Preparation runs only validated native or
explicitly configured commands.

Use checkout snapshots or pinned Git revisions. Do not modify a target’s tracked
source to manufacture a race. Keep secrets in external runtime bindings; never
serialize them in logs, diagnostics, or artifacts.

Cleanup is exact: remove only containers, networks, volumes, processes, and
workspaces owned by the attempt. Never use broad Docker cleanup commands such
as `docker system prune`. Cleanup failure is an `execution_error` and prevents
artifact publication.
