# git-detect-case-change

Detect and fix case-only filename changes that Git can't see on macOS/Windows.

On case-insensitive filesystems, renaming `utils.ts` → `Utils.ts` won't register in Git.

This tool compares Git's tree with the filesystem and fixes mismatches in both directions.

```sh
# Renamed foo.js → Foo.js but Git didn't notice?
npx git-detect-case-change              # Stage the case change in Git
npx git-detect-case-change --fix-local  # Rename local files to match Git
```

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other projects I'm working on.</sub>

## Usage

The CLI supports two main modes:

```sh
# Stage local case changes to Git (most common)
npx git-detect-case-change

# Rename local files to match Git's case (after pulling teammate's changes)
npx git-detect-case-change --fix-local

# See what would change without modifying anything
npx git-detect-case-change --dry
```

Example output:

```sh
$ npx git-detect-case-change
src/utils.ts -> src/Utils.ts
lib/helper.js -> lib/Helper.js
```

## When to use it

* Bundlers (Vite/Webpack/Rollup) error due to mismatched import casing
* CI fails on Linux but your Mac build passes
* Git doesn't show a rename even though you changed the file
* Teammate pushed case-only changes and your local filesystem is out of sync

## What it does

This tool finds and fixes case mismatches between Git and the filesystem:

| You want to…                                      | Command                                  | Effect                            |
| ------------------------------------------------- | ---------------------------------------- | --------------------------------- |
| Stage local case changes to Git                   | `npx git-detect-case-change`             | Stages the rename with `git mv`   |
| Rename local files to match Git (e.g. after pull) | `npx git-detect-case-change --fix-local` | Renames local files to Git's case |

## Options

Dry run:

```sh
npx git-detect-case-change --dry
npx git-detect-case-change --fix-local --dry
```

Limit to specific paths:

```sh
npx git-detect-case-change -- <dir-or-file>
```

Only check files changed since a specific ref:

```sh
npx git-detect-case-change --since HEAD~3
npx git-detect-case-change --fix-local --since ORIG_HEAD
```

### Post-merge hook

Automatically fix case mismatches after every `git pull` or `git merge`:

```sh
#!/bin/sh
# .git/hooks/post-merge (or .husky/post-merge)

# ORIG_HEAD points to where HEAD was before the merge.
# Skip if it doesn't exist (e.g. fresh clone with no merges).
if ! git rev-parse --verify ORIG_HEAD >/dev/null 2>&1; then
  exit 0
fi

# Only check files that changed in the merge (fast even in large repos)
./node_modules/.bin/git-detect-case-change --fix-local --since ORIG_HEAD
```

<details>
<summary>Why Git misses case-only renames</summary>

macOS and Windows default to case-insensitive filesystems. Git respects the underlying filesystem, so it can't reliably detect case-only renames.

The official workaround is:

```sh
git mv <old-path> <new-path>
```

This gets tedious when:

* Many files changed at once
* Renames came from automated refactors
* You inherited case drift from someone else

This tool automates that detection.
See [this StackOverflow discussion](https://stackoverflow.com/questions/17683458/how-do-i-commit-case-sensitive-only-filename-changes-in-git) for more context.

</details>

<details>
<summary>How it works</summary>

1. **Reads file paths from Git's index:**

   ```sh
   git ls-tree --name-only -z -r HEAD
   ```

   `-z` uses NUL terminators so filenames with spaces or special characters are safe.

2. **Detects case mismatches:**

   For each Git path, uses [`fs.promises.exists`](https://github.com/privatenumber/fs.promises.exists) to look up the actual filesystem path in a case-insensitive way.
   Files are processed in batches of 100 to avoid file descriptor limits on large repos.

3. **Applies fixes based on mode:**

   * **Default mode:** Stages changes with `git mv <git-path> <local-path>`

   * **`--fix-local` mode:** Renames local files/directories to match Git's case:

     * **Directories first:** Extracts unique directory changes and renames them (deepest first)
     * **Files second:** Renames remaining files with case-only differences
     * **Two-step rename:** Uses temporary path (`file.tmp-<pid>-<timestamp>`) to work around case-insensitive filesystem limitations
     * **Transactional rollback:** If the second rename fails, attempts to restore from temporary path to prevent data loss

</details>
