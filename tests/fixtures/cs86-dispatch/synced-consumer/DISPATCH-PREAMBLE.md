# cs86-dispatch fixture marker (synced-consumer / new managed source)

Readability-only fixture for resolvePreambleSource() path-level resolution.
The resolver reads each candidate to probe readability (discriminating ENOENT)
but does not parse its content, so this marker is intentionally minimal.
Content-level (byte-equality / fail-closed) tests copy the real repo-root
sources into an os.tmpdir() scratch dir instead.
