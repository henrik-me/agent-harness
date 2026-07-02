# OPERATIONS (leaked a harness-repo invocation — must FAIL)

Before reporting, validate with: node bin/harness.mjs lint

This run command is consumer-invalid because bin/harness.mjs is not shipped to
consumers. This base also mentions CS83 and LRN-170, which the invocation scan
must NOT report — only the invocation token above.
