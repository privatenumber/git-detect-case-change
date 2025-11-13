# git-detect-case-change

Detect and fix filename case changes in Git repos on macOS/Windows (case-insensitive file systems).

```sh
# Renamed foo.js → Foo.js but Git won't detect it?
npx git-detect-case-change              # Stage the case change
npx git-detect-case-change --fix-local  # Or fix local filesystem to match Git
```

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other cool projects I'm working on! ❤️</sub>

## What this tool does

On macOS/Windows, the filesystem is case-insensitive. Git isn't.

Git **cannot detect filename case-only changes** like `/src/foo.js` → `/src/Foo.js`.

This tool automatically finds and fixes these mismatches in **both directions**:

| You want to… | Use | What it does |
|-------------|-----|--------------|
| Stage local case changes to Git | `npx git-detect-case-change` | Runs `git mv old new` for each case change |
| Fix local filesystem to match Git (e.g., after pulling changes) | `npx git-detect-case-change --fix-local` | Renames local files to Git's case |

## Options

**Dry run** — See what would change without modifying anything:
```sh
npx git-detect-case-change --dry
npx git-detect-case-change --fix-local --dry
```

**Scope to specific paths:**
```sh
npx git-detect-case-change -- <dir-or-file>
```

<details>
<summary><strong>Why does this happen?</strong></summary>

macOS and Windows default to case-insensitive file systems. Git respects the underlying filesystem, so it can't detect case-only renames without help.

The official workaround is:
```sh
git mv <old-path> <new-path>
```

…but that's painful if many files changed or the renames weren't done through Git (e.g., automated refactoring tools).

This tool automates case-change detection for Git. See [this StackOverflow discussion](https://stackoverflow.com/questions/17683458/how-do-i-commit-case-sensitive-only-filename-changes-in-git) for more context.

</details>

<details>
<summary><strong>How does it work?</strong></summary>

1. Get case-sensitive file paths from Git index:
    ```sh
    git ls-tree --name-only -z -r HEAD
    ```
    Uses `-z` for NUL-terminated output to handle filenames with spaces, quotes, or special characters.

2. Check each Git path with [`fs.promises.exists`](https://github.com/privatenumber/fs.promises.exists) to find case-insensitive matches on the filesystem.
   - Files are processed in batches of 100 to avoid file descriptor limits on large repos.

3. If the path exists with different case:
    - **Default mode**: Stage with `git mv <old-path> <new-path>`
    - **Fix local mode**: Rename filesystem file with `fs.rename(<local-path>, <git-path>)`

</details>
