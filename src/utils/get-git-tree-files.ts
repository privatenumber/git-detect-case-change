import spawn from 'nano-spawn';

export const getGitTreeFiles = async (scopePath?: string[]) => {
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
