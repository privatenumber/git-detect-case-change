import spawn from 'nano-spawn';

export const getDiffFiles = async (sinceRef: string, scopePath?: string[]) => {
	const diffOutput = await spawn(
		'git',
		[
			'diff-tree',
			'-r',
			'--name-only',
			'-z',
			'--diff-filter=AM',
			sinceRef,
			'HEAD',
			...(scopePath ? ['--', ...scopePath] : []),
		],
	);
	// -z uses NUL delimiters because filenames can contain newlines
	return diffOutput.stdout.split('\0').filter(Boolean);
};
