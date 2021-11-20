# git-detect-case-change <a href="https://npm.im/git-detect-case-change"><img src="https://badgen.net/npm/v/git-detect-case-change"></a> <a href="https://packagephobia.now.sh/result?p=git-detect-case-change"><img src="https://packagephobia.now.sh/badge?p=git-detect-case-change"></a>

Script to detect case changes in file names in the current git project.

<sub>Support this project by ⭐️ starring and sharing it. [Follow me](https://github.com/privatenumber) to see what other cool projects I'm working on! ❤️</sub>

## Usage
Use [npx](https://nodejs.dev/learn/the-npx-nodejs-package-runner) to run without installation.
```sh
npx git-detect-case-change
```


## How does it work?
1. Get the case-sensitive file names from Git in the current project.

    This is done with the following command:
    ```sh
    git ls-tree --name-only -r HEAD
    ```

2. Check each file path with [`fs.promises.exists`](https://github.com/privatenumber/fs.promises.exists) to find a case-insensitive match.

3. If the path exists with a different casing, tell git:
    ```sh
    git mv oldPath newPath
    ```
