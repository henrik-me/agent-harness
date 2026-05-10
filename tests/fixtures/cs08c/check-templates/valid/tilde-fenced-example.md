# Tilde-fenced example fixture (CS08c)

This file shows the dot-notation pattern inside a tilde fence. The linter
must NOT flag it because tilde fences are CommonMark §4.5 fenced code blocks
just like backtick fences.

~~~yaml
project:
  name: my-project
  agent_suffix: yc
# rendered with {{project.name}} and {{project.agent_suffix}}
~~~

A second tilde fence to make sure state is reset properly:

~~~text
relative path inside code: ../foo/bar
~~~

After both fences, real flat placeholders should still render fine:
{{name}} {{agent_suffix}}.
