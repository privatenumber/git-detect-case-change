# git-detect-case-change

Detect and fix case-only filename changes that Git can't see on macOS/Windows.

On case-insensitive filesystems, renaming `utils.ts` → `Utils.ts` won't register in Git. This tool detects those mismatches and fixes them.

```sh
# Renamed foo.js → Foo.js but Git didn't notice?
npx git-detect-case-change              # Stage the case rename in Git
npx git-detect-case-change --fix-local  # Rename local files to match Git
```

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other projects I'm working on.</sub>

## Usage

The tool works in two directions depending on which casing is correct:

- **Local is the source of truth** — you renamed files locally and Git needs to know
- **Git is the source of truth** — a teammate renamed files and your filesystem needs to catch up

| Scenario                      | Command                                  | Effect                            |
| ----------------------------- | ---------------------------------------- | --------------------------------- |
| Local is the source of truth  | `npx git-detect-case-change`             | Stages the rename with `git mv`   |
| Git is the source of truth    | `npx git-detect-case-change --fix-local` | Renames local files to Git's case |

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

## Options

### Dry run

Preview changes without modifying anything:

```sh
npx git-detect-case-change --dry
npx git-detect-case-change --fix-local --dry
```

### Check mode

Exits with code 1 if mismatches are found, useful as a lint step or pre-commit hook:

```sh
npx git-detect-case-change --check
```

### Limit to specific paths

```sh
npx git-detect-case-change -- <dir-or-file>
```

### Only check files changed since a ref

```sh
npx git-detect-case-change --since HEAD~3
npx git-detect-case-change --fix-local --since ORIG_HEAD
```

### Post-merge hook

Automatically fix case mismatches after every `git pull` or `git merge`:

`.git/hooks/post-merge`:

```sh
#!/bin/sh
# post-merge — fix case mismatches introduced by the merge
set -e

# ORIG_HEAD points to where HEAD was before the merge
git rev-parse --verify ORIG_HEAD >/dev/null 2>&1 || exit 0

# Only check files that changed in the merge (fast even in large repos)
./node_modules/.bin/git-detect-case-change --fix-local --since ORIG_HEAD
```

Make the hook executable: `chmod +x .git/hooks/post-merge`

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

   Walks each Git path segment-by-segment, looking up directory entries with `fs.readdir`.
   Reads are memoized by resolved path so each unique parent directory is read at most once, regardless of how many files it contains.
   Lookups are case-insensitive and Unicode-normalized (NFC) to correctly match files stored in NFD form on macOS/Windows filesystems.

3. **Applies fixes based on mode:**

   * **Default mode:** Stages changes with `git mv <git-path> <local-path>`

   * **`--fix-local` mode:** Renames local files/directories to match Git's case:

     * **Directories first:** Extracts unique directory changes and renames them (deepest first)
     * **Files second:** Renames remaining files with case-only differences
     * **Two-step rename:** Uses temporary path (`file.tmp-<pid>-<timestamp>`) to work around case-insensitive filesystem limitations
     * **Transactional rollback:** If the second rename fails, attempts to restore from temporary path to prevent data loss

</details>
