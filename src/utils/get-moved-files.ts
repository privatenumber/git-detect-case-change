import spawn from 'nano-spawn';

export const getMovedFiles = async (pathspec?: string[]) => {
	console.error('DEBUG: Running git status');
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
	console.error(`DEBUG: git status returned ${entries.length} entries`);

	for (let i = 0; i < entries.length; i += 1) {
		const entry = entries[i];
		// Format with -z: "XY newPath\0oldPath" where X/Y are status codes
		// X = staged status, Y = unstaged status
		// R  = renamed, RM = renamed and modified, etc.
		if (entry[0] === 'R') {
			const toPath = entry.slice(3); // Remove "XY " prefix to get new path
			const fromPath = entries[i + 1]; // Next entry is old path
			if (fromPath) {
				console.error(`DEBUG: Found renamed: ${fromPath} -> ${toPath}`);
				movedFiles.set(fromPath, toPath);
				i += 1; // Skip the next entry since we consumed it
			}
		}
	}

	return movedFiles;
};
