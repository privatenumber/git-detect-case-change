import path from 'node:path';
import spawn from 'nano-spawn';
import { extractDirectoryChanges } from './extract-directory-changes.js';
import { safeCaseRename } from './safe-case-rename.js';

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
	let changesFound = 0;

	if (fixLocal) {
		// In fix-local mode, rename directories first to avoid file-by-file issues
		const directoryChanges = extractDirectoryChanges(caseDifferentFiles);

		for (const { gitPath: gitDirectory, localPath: localDirectory } of directoryChanges) {
			if (!dry) {
				const success = await safeCaseRename(localDirectory, gitDirectory, 'directory');
				if (!success) {
					continue;
				}
			}

			console.log(`Fixed: ${localDirectory}/ -> ${gitDirectory}/`);
			changesFound += 1;
		}
	}

	// Handle file renames (or all renames in default mode)
	for (const [gitPath, localPath] of caseDifferentFiles) {
		// Don't re-move if move is staged
		if (movedFiles.get(gitPath) === localPath) {
			continue;
		}

		// In fix-local mode, recalculate actual filesystem path after directory renames
		let actualLocalPath = localPath;
		if (fixLocal) {
			const gitDirectory = path.dirname(gitPath);
			const localDirectory = path.dirname(localPath);

			if (gitDirectory !== localDirectory && gitDirectory !== '.' && localDirectory !== '.') {
				// Directory was renamed, update the file path to reflect new location
				const filename = path.basename(localPath);
				actualLocalPath = path.join(gitDirectory, filename);

				// If file basename also matches git (only directory changed), skip
				if (actualLocalPath === gitPath) {
					continue;
				}
			}
		}

		if (!dry) {
			if (fixLocal) {
				const success = await safeCaseRename(actualLocalPath, gitPath, 'file');
				if (!success) {
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
			? `Fixed: ${actualLocalPath.split(path.sep).join('/')} -> ${gitPath}`
			: `${gitPath} -> ${localPath}`);
		changesFound += 1;
	}

	return changesFound;
};
