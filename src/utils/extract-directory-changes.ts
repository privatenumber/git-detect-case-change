import path from 'node:path';

type DirectoryChange = {
	gitPath: string;
	localPath: string;
	depth: number;
};

export const extractDirectoryChanges = (caseDifferentFiles: string[][]): DirectoryChange[] => {
	const directoryMap = new Map<string, DirectoryChange>();

	for (const [gitPath, localPath] of caseDifferentFiles) {
		const gitDirectory = path.dirname(gitPath);
		const localDirectory = path.dirname(localPath);

		// Skip if directories are the same (case-insensitive check already done)
		if (gitDirectory === '.' || localDirectory === '.') {
			continue;
		}

		// Check each directory level for case differences
		const gitParts = gitDirectory.split(path.sep);
		const localParts = localDirectory.split(path.sep);

		for (let i = 0; i < gitParts.length; i += 1) {
			if (gitParts[i] !== localParts[i]) {
				// Found a directory with case difference
				const gitDirPath = gitParts.slice(0, i + 1).join(path.sep);
				const localDirPath = localParts.slice(0, i + 1).join(path.sep);

				// Use lowercase comparison as key to deduplicate
				const key = gitDirPath.toLowerCase();

				if (!directoryMap.has(key)) {
					directoryMap.set(key, {
						gitPath: gitDirPath,
						localPath: localDirPath,
						depth: i,
					});
				}
			}
		}
	}

	// Sort by depth (deepest first) to rename child directories before parents
	return Array.from(directoryMap.values()).sort((a, b) => b.depth - a.depth);
};
