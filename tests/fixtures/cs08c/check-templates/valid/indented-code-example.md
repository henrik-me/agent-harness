# Indented-code example fixture (CS08c)

The CommonMark §4.4 indented code block (≥4 leading spaces or one tab) must
be skipped by the linter. The lines below show forbidden patterns inside
indented blocks; they must NOT trigger violations.

Example using 4-space indent:

    project:
      name: my-project
    # rendered as {{project.name}} (would be flagged outside a code block)
    # relative path: ../tools/foo

Example using a tab indent:

	# rendered as {{project.agent_suffix}} (would be flagged outside)
	# another relative: ../docs/bar

After the indented blocks, real flat placeholders are fine: {{name}}.
