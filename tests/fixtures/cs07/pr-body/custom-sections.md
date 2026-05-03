## Summary

This PR refactors the authentication module to use JWT tokens.

## Changes

- Replaced session-based auth with JWT.
- Updated middleware to validate tokens on each request.
