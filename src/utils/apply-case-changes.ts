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
	console.error(`DEBUG: Applying changes to ${caseDifferentFiles.length} files (dry: ${dry}, fixLocal: ${fixLocal})`);

	// Needs to happen sequentially because of git.lock
	for (const [gitPath, localPath] of caseDifferentFiles) {
		console.error(`DEBUG: Processing ${gitPath} -> ${localPath}`);

		// Don't re-move if move is staged
		if (movedFiles.get(gitPath) === localPath) {
			console.error(`DEBUG: Skipping ${gitPath} (already staged)`);
			continue;
		}

		if (!dry) {
			if (fixLocal) {
				// Rename filesystem file to match Git case
				try {
					console.error(`DEBUG: Renaming ${localPath} -> ${gitPath}`);
					await fs.rename(localPath, gitPath);
				} catch (error) {
					console.error(`Failed to rename ${localPath} -> ${gitPath}: ${(error as Error).message}`);
					continue;
				}
			} else {
				// Stage local change to Git (current behavior)
				try {
					console.error(`DEBUG: Running git mv ${gitPath} ${localPath}`);
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
