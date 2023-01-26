import { execa } from 'execa';
import exists from 'fs.promises.exists';
import { cli } from 'cleye';
import { version, description } from '../package.json';

const getMovedFiles = async (pathspec?: string) => {
	const movedFiles = new Map<string, string>();
	const gitStatus = await execa('git', ['status', '--porcelain', '--untracked-files=no', ...(pathspec ? ['--', pathspec] : [])]);
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

const getGitTreeFiles = async (scopePath?: string) => {
	const lsTreeOutput = await execa('git', ['ls-tree', '--name-only', '-r', 'HEAD', ...(scopePath ? ['--', scopePath] : [])]);
	return lsTreeOutput.stdout.split('\n');
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
		},

		help: {
			description,
		},
	});

	const { dry } = argv.flags;
	const { paths } = argv._['--'];

	const movedFiles = await getMovedFiles(paths);
	const gitFiles = await getGitTreeFiles(paths);
	const result = await Promise.all(
		gitFiles.map(async filePath => [
			filePath,
			await exists(filePath, false),
		]),
	);

	const caseDifferentFiles = result.filter(
		([oldFilePath, newFilePath]) => (
			newFilePath && (oldFilePath !== newFilePath)
		),
	) as string[][];

	// Needs to happen sequentially because of git.lock
	for (const [oldFilePath, newFilePath] of caseDifferentFiles) {
		// Don't re-move if move is staged
		if (movedFiles.get(oldFilePath) === newFilePath) {
			continue;
		}

		if (!dry) {
			await execa('git', ['mv', oldFilePath, newFilePath]);
		}

		console.log(`${oldFilePath} -> ${newFilePath}`);
	}
})();
