import { execa } from 'execa';
import exists from 'fs.promises.exists';

const getMovedFiles = async () => {
	const movedFiles = new Map<string, string>();
	const gitStatus = await execa('git', ['status', '--porcelain', '--untracked-files=no']);
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

const getGitTreeFiles = async () => {
	const lsTreeOutput = await execa('git', ['ls-tree', '--name-only', '-r', 'HEAD']);
	return lsTreeOutput.stdout.split('\n');
};


// TODO: Dry run mode
// TODO: accept -- to scope directory
 (async () => {
	const movedFiles = await getMovedFiles();
	const gitFiles = await getGitTreeFiles();
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

		await execa('git', ['mv', oldFilePath, newFilePath]);
		console.log(`${oldFilePath} -> ${newFilePath}`);
	}
})();
