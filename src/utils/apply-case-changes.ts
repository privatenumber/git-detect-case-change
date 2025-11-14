import fs from 'node:fs/promises';
import spawn from 'nano-spawn';

type ApplyOptions = {
	caseDifferentFiles: string[][];
	movedFiles: Map<string, string>;
	dry: boolean;
	fixLocal: boolean;
};

export const applyCaseChanges = async ({
	caseDifferentFiles,
	movedFiles,
	dry,
	fixLocal,
}: ApplyOptions) => {
	// Needs to happen sequentially because of git.lock
	for (const [gitPath, localPath] of caseDifferentFiles) {
		// Don't re-move if move is staged
		if (movedFiles.get(gitPath) === localPath) {
			continue;
		}

		if (!dry) {
			if (fixLocal) {
				// Rename filesystem file to match Git case
				try {
					await fs.rename(localPath, gitPath);
				} catch (error) {
					console.error(`Failed to rename ${localPath} -> ${gitPath}: ${(error as Error).message}`);
					continue;
				}
			} else {
				// Stage local change to Git (current behavior)
				try {
					await spawn('git', ['mv', gitPath, localPath]);
				} catch (error) {
					console.error(`Failed to stage ${gitPath} -> ${localPath}: ${(error as Error).message}`);
					continue;
				}
			}
		}

		console.log(fixLocal
			? `Fixed: ${localPath} -> ${gitPath}`
			: `${gitPath} -> ${localPath}`);
	}
};
