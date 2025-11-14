import fs from 'node:fs/promises';
import path from 'node:path';
import spawn from 'nano-spawn';
import { extractDirectoryChanges } from './extract-directory-changes.js';

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
	if (fixLocal) {
		// In fix-local mode, rename directories first to avoid file-by-file issues
		const directoryChanges = extractDirectoryChanges(caseDifferentFiles);

		for (const { gitPath: gitDirectory, localPath: localDirectory } of directoryChanges) {
			if (!dry) {
				// Use two-step rename for case-only changes on case-insensitive filesystems
				const tempPath = `${localDirectory}.tmp-${process.pid}-${Date.now()}`;
				try {
					await fs.rename(localDirectory, tempPath);
					await fs.rename(tempPath, gitDirectory);
				} catch (error) {
					console.error(`Failed to rename directory ${localDirectory} -> ${gitDirectory}: ${(error as Error).message}`);

					// ROLLBACK: Attempt to restore the directory from the temp path
					try {
						await fs.access(tempPath);
						await fs.rename(tempPath, localDirectory);
						console.error(`Restored ${localDirectory} from temporary directory.`);
					} catch (rollbackError) {
						console.error(
							`CRITICAL: Failed to restore ${localDirectory} from ${tempPath}. Directory may be lost!`,
							(rollbackError as Error).message,
						);
					}
					continue;
				}
			}

			console.log(`Fixed: ${localDirectory}/ -> ${gitDirectory}/`);
		}
	}

	// Handle file renames (or all renames in default mode)
	for (const [gitPath, localPath] of caseDifferentFiles) {
		// Don't re-move if move is staged
		if (movedFiles.get(gitPath) === localPath) {
			continue;
		}

		// In fix-local mode, skip files whose directory was already renamed
		if (fixLocal) {
			const gitDirectory = path.dirname(gitPath);
			const localDirectory = path.dirname(localPath);

			if (gitDirectory !== localDirectory && gitDirectory !== '.' && localDirectory !== '.') {
				// Directory was renamed, file is already at correct location
				continue;
			}
		}

		if (!dry) {
			if (fixLocal) {
				// Rename filesystem file to match Git case
				// Use two-step rename for case-only changes on case-insensitive filesystems
				const tempPath = `${localPath}.tmp-${process.pid}-${Date.now()}`;
				try {
					await fs.rename(localPath, tempPath);
					await fs.rename(tempPath, gitPath);
				} catch (error) {
					console.error(`Failed to rename ${localPath} -> ${gitPath}: ${(error as Error).message}`);

					// ROLLBACK: Attempt to restore the file from the temp path
					try {
						await fs.access(tempPath);
						await fs.rename(tempPath, localPath);
						console.error(`Restored ${localPath} from temporary file.`);
					} catch (rollbackError) {
						console.error(
							`CRITICAL: Failed to restore ${localPath} from ${tempPath}. File may be lost!`,
							(rollbackError as Error).message,
						);
					}
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
