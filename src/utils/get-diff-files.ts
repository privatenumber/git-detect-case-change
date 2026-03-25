import spawn from 'nano-spawn';

export const getDiffFiles = async (sinceRef: string, scopePath?: string[]) => {
	const diffOutput = await spawn(
		'git',
		[
			'diff',
			'--name-only',
			'-z',
			'--diff-filter=ACMR',
			sinceRef,
			'HEAD',
			...(scopePath ? ['--', ...scopePath] : []),
		],
	);
	return diffOutput.stdout.split('\0').filter(Boolean);
};
