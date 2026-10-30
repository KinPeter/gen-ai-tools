# Managed delivery

Run the managed delivery workflow for this requirement:

$ARGUMENTS

The input may be inline requirements or a path to a requirement file. Delegate
implementation, independent review, and review fixes sequentially. Preserve
the exact unique `.tmp` review artifact path between stages, run all repository
QA gates, do not commit, and finish with a QA report, manual-test request, and
recommended commit message in the "this commit will ..." format, for example:
"Add log search functionality" or "Fix mouse navigation on file explorer".
