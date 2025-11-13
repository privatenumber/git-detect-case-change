# git-detect-case-change

Bidirectional tool to detect and fix file-path case changes in Git repositories on case-insensitive file systems.

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other cool projects I'm working on! ❤️</sub>

## Usage

### Default mode: Stage local changes to Git
After renaming files locally, run the script with [npx](https://nodejs.dev/learn/the-npx-nodejs-package-runner) in your Git repository:
```sh
npx git-detect-case-change
```

If there were any case-changes, it will detect and stage them for you.

### Fix local mode: Rename local files to match Git
If your filesystem has different case than Git (e.g., after pulling changes from a teammate), use `--fix-local`:
```sh
npx git-detect-case-change --fix-local
```

This renames your local files to match Git's case instead of staging changes.

### Options

#### Dry run
Run with `--dry` (or `-d`) to see what would be changed without making any modifications:
```sh
npx git-detect-case-change --dry
npx git-detect-case-change --fix-local --dry
```

#### Scoping files

Pass in specific paths after `--` to scope the search to:
```sh
npx git-detect-case-change -- <scope to directory path>
```

## Why?
File-systems on macOS & Windows are _case-insensitive_ by default, which means paths `/a.txt` and `/A.txt` cannot exist at the same time. Because of this default, Git is also case-insensitive by default, preventing it from detecting case changes in file names.

The recommended solution 
from this [StackOverflow discussion](https://stackoverflow.com/questions/17683458/how-do-i-commit-case-sensitive-only-filename-changes-in-git) is to rename the files individually with `git mv`:
```sh
git mv <old-path> <new-path>
```

However, this may not be practical if the case-changes were made without Git (eg. automated by another program) and there's a lot to rename.

This script automates case-change detection for Git.

## How does it work?
1. Get the case-sensitive file paths from the current Git project:
    ```sh
    git ls-tree --name-only -z -r HEAD
    ```
    (Uses `-z` for NUL-terminated output to handle filenames with spaces, quotes, or special characters)

2. Check each file path with [`fs.promises.exists`](https://github.com/privatenumber/fs.promises.exists) to find a case-insensitive match.
   - Files are processed in batches of 100 to avoid system file descriptor limits on large repositories.

3. If the path exists with a different case:
    - **Default mode**: Stage the change with Git:
        ```sh
        git mv <old-path> <new-path>
        ```
    - **Fix local mode**: Rename the filesystem file to match Git:
        ```sh
        fs.rename(<local-path>, <git-path>)
        ```
