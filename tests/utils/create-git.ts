import spawn from 'nano-spawn';

export const createGit = async (
	cwd: string,
) => {
	const git = async (
		command: string,
		args?: string[],
	) => {
		const result = await spawn(
			'git',
			[command, ...(args || [])],
			{ cwd },
		);
		return result.stdout.trim();
	};

	await git('init');
	await git('config', ['user.name', 'name']);
	await git('config', ['user.email', 'email']);

	return git;
};
