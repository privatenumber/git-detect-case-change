# git-detect-case-change

Script to detect file name case changes in a Git repository.

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other cool projects I'm working on! ❤️</sub>

## Usage

Run the script with [npx](https://nodejs.dev/learn/the-npx-nodejs-package-runner) in your Git repository:
```sh
npx git-detect-case-change
```

Run with `--dry` to see what files would be renamed before staging them:
```sh
npx git-detect-case-change --dry
```

Pass in specific paths after `--` to scope the search to:
```sh
npx git-detect-case-change -- <scope to directory path>
```

## Why?
macOS and Windows file-systems are case-insensitive by default, preventing Git from recognizing file name case changes when renamed without Git (eg. [StackOverflow discussion](https://stackoverflow.com/questions/17683458/how-do-i-commit-case-sensitive-only-filename-changes-in-git)).

The recommended solution is renaming the files through Git:
```sh
git mv <old-path> <new-path>
```

However, this is not always plausible to do if the case-changes have already been completed without Git (eg. autonamted by separate process) and there's a lot to rename.

This script automates case change detection for Git.

## How does it work?
1. Get the case-sensitive file names from Git in the current project.

    This is done with the following command:
    ```sh
    git ls-tree --name-only -r HEAD
    ```

2. Check each file path with [`fs.promises.exists`](https://github.com/privatenumber/fs.promises.exists) to find a case-insensitive match.

3. If the path exists with a different casing, tell git:
    ```sh
    git mv <old-path> <new-path>
    ```
