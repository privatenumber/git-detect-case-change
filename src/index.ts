import fs from 'node:fs/promises';
import spawn from 'nano-spawn';
import exists from 'fs.promises.exists';
import { cli } from 'cleye';
import packageJson from '../package.json' with { type: 'json' };

const { version, description } = packageJson;

const getMovedFiles = async (pathspec?: string[]) => {
	const movedFiles = new Map<string, string>();
	const gitStatus = await spawn(
		'git',
		[
			'status',
			'--porcelain',
			'-z',
			'--untracked-files=no',
			...(pathspec ? ['--', ...pathspec] : []),
		],
	);
	const entries = gitStatus.stdout.split('\0').filter(Boolean);

	for (let i = 0; i < entries.length; i += 1) {
		const entry = entries[i];
		// Format with -z: "XY newPath\0oldPath" where X/Y are status codes
		// X = staged status, Y = unstaged status
		// R  = renamed, RM = renamed and modified, etc.
		if (entry[0] === 'R') {
			const toPath = entry.slice(3); // Remove "XY " prefix to get new path
			const fromPath = entries[i + 1]; // Next entry is old path
			if (fromPath) {
				movedFiles.set(fromPath, toPath);
				i += 1; // Skip the next entry since we consumed it
			}
		}
	}

	return movedFiles;
};

const getGitTreeFiles = async (scopePath?: string[]) => {
	const lsTreeOutput = await spawn(
		'git',
		[
			'ls-tree',
			'--name-only',
			'-z',
			'-r',
			'HEAD',
			...(scopePath ? ['--', ...scopePath] : []),
		],
	);
	return lsTreeOutput.stdout.split('\0').filter(Boolean);
};

(async () => {
	const argv = cli({
		name: 'git-detect-case-change',

		version,

		parameters: ['--', '[paths...]'],

		flags: {
			dry: {
				type: Boolean,
				alias: 'd',
				description: 'Dry run mode',
			},
			fixLocal: {
				type: Boolean,
				description: 'Rename local files to match Git case (instead of staging local changes)',
			},
		},

		help: {
			description,
		},
	});

	const { dry, fixLocal } = argv.flags;
	const { paths } = argv._;

	const movedFiles = await getMovedFiles(paths);
	const gitFiles = await getGitTreeFiles(paths);

	// Process in batches to avoid EMFILE errors on large repos
	const BATCH_SIZE = 100;
	const result: [string, string | false][] = [];
	const totalBatches = Math.ceil(gitFiles.length / BATCH_SIZE);

	for (let i = 0; i < gitFiles.length; i += BATCH_SIZE) {
		const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
		if (gitFiles.length > BATCH_SIZE) {
			process.stderr.write(`\rScanning files: ${batchNumber}/${totalBatches} batches...`);
		}

		const batch = gitFiles.slice(i, i + BATCH_SIZE);
		const batchResults = await Promise.all(
			batch.map(async (filePath) => {
				try {
					return [
						filePath,
						await exists(filePath, false),
					] as [string, string | false];
				} catch (error) {
					// Handle permission errors or other fs errors gracefully
					// Clear current line before printing error to avoid garbled output
					if (gitFiles.length > BATCH_SIZE) {
						process.stderr.write('\r\x1b[K');
					}
					console.error(`Warning: Could not check ${filePath}: ${(error as Error).message}`);
					// Reprint progress line after error
					if (gitFiles.length > BATCH_SIZE) {
						process.stderr.write(`\rScanning files: ${batchNumber}/${totalBatches} batches...`);
					}
					return [filePath, false] as [string, string | false];
				}
			}),
		);
		result.push(...batchResults);
	}

	if (gitFiles.length > BATCH_SIZE) {
		process.stderr.write('\r\x1b[K');
	}

	const caseDifferentFiles = result.filter(
		([oldFilePath, newFilePath]) => (
			newFilePath && (oldFilePath !== newFilePath)
		),
	) as string[][];

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
})();
