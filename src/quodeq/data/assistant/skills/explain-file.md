---
name: explain-file
description: Explain the findings of one file, with the code
argument_hint: [file path]
views: violations, file
---
The user wants to understand one file's findings, usually the file page
(`page` is `file`) or the file scope of the Violations page
(`pageParams.scope.path`). Work in this order:
1. Call `get_violations` with `path` set to the file (no `dimension` unless
   the user named one). Everything the file has comes back with
   `by_requirement` counts.
2. Call `read_repo_file` on the file when the repository is attached, so you
   explain against the real code around the reported lines.
3. Walk the findings worst first: what each one is, why the requirement
   flags it here, and a one-line fix sketch. Merge repeats of the same
   requirement into one item with the line numbers.
Quote at most a few lines of code. End with the order to fix them in. Under
~250 words.
