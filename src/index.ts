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
			'--untracked-files=no',
			...(pathspec ? ['--', ...pathspec] : []),
		],
	);
	const files = gitStatus.stdout.split('\n');

	for (const file of files) {
		const moved = file.match(/R {2}"?(.+?)"? -> "?(.+?)"?$/);
		if (moved) {
			const [, fromPath, toPath] = moved;
			movedFiles.set(fromPath, toPath);
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
	for (let i = 0; i < gitFiles.length; i += BATCH_SIZE) {
		const batch = gitFiles.slice(i, i + BATCH_SIZE);
		const batchResults = await Promise.all(
			batch.map(async filePath => [
				filePath,
				await exists(filePath, false),
			] as [string, string | false]),
		);
		result.push(...batchResults);
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
				await spawn('git', ['mv', gitPath, localPath]);
			}
		}

		console.log(fixLocal
			? `Fixed: ${localPath} -> ${gitPath}`
			: `${gitPath} -> ${localPath}`);
	}
})();
