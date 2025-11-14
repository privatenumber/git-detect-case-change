import spawn from 'nano-spawn';

export const getGitTreeFiles = async (scopePath?: string[]) => {
	console.error('DEBUG: Running git ls-tree');
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
	const files = lsTreeOutput.stdout.split('\0').filter(Boolean);
	console.error(`DEBUG: git ls-tree returned ${files.length} files`);
	if (files.length > 0 && files.length <= 5) {
		console.error(`DEBUG: First few files: ${files.join(', ')}`);
	}
	return files;
};
