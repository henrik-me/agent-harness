# Marker Inside Code Fence (Escaped)

Here is a code example showing escaped markers (U+200B after <):

```md
<​!-- harness:local-start id=intro -->
Consumer content here.
<​!-- harness:local-end id=intro -->
```

The markers above are escaped with U+200B and should NOT trigger an error.