---
name: explain-folder
description: Explain why a folder or module has the findings it has
argument_hint: [folder path]
views: map, violations, overview
---
The user wants to know why one folder (a module, a package, an area) has so
many findings, usually the one open in the Map (`pageParams.path`), the
folder scope of the Violations page (`pageParams.scope.path`) or the one
named in the message. Work in this order:
1. Call `get_violations` with `path` set to that folder (no `dimension`
   unless the user named one). Do not page through project-wide results.
2. Read the answer from the counts: `by_requirement` says which rules are
   broken and how often, `by_file` where, `by_principle` under which
   principle, `total_in_scope` how the folder weighs against the project.
   Group the requirements into two or three causes (for example "domain
   package depends on Android and Firebase types").
3. For the top one or two requirements call `get_standard` so you explain
   what the rule demands, not just its title. Read one offending file with
   `read_repo_file` if a concrete example helps.
4. Say what would move the score most: a rule broken in many files weighs
   more than one broken once (the grade formula), so name the fix that clears
   the most files.
Lead with the answer in one sentence, then the causes with counts, then the
fix order. Call findings what they are: "vulnerabilities" only when the
dimension is security. Keep it under ~250 words.
