---
name: deslop
description: Remove AI-generated code slop from the current branch by checking the diff against main
allowed-tools: Bash, Read, Edit, Grep
---

# Remove AI Code Slop

Check the diff against main and remove all AI-generated slop introduced in this branch.

## Process

1. Run `git diff main...HEAD` to see all changes in this branch
2. For each modified file, review the changes and remove:
   - **Unnecessary comments** that a human wouldn't add or are inconsistent with the rest of the file's comment style
   - **Excessive defensive checks** like try/catch blocks, null checks, or validation that is abnormal for that area of the codebase (especially when called by trusted/validated codepaths)
   - **Casts to `any`** used to work around type issues instead of fixing them properly
   - **Over-verbose code** that could be simplified
   - **Redundant error handling** that duplicates what callers already handle
   - **Style inconsistencies** with the surrounding code in that file

3. When evaluating whether something is "slop", compare against the existing style in the file (the parts not changed in this branch)

4. Make edits to remove the slop while preserving the intended functionality

5. At the end, provide a **1-3 sentence summary** of what was changed
