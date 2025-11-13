import spawn from 'nano-spawn';

export const createGit = (
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

	return Object.assign(git, {
		init: async (args: string[] = []) => {
			await git('init', args);
			await git('config', ['user.name', 'name']);
			await git('config', ['user.email', 'email']);
		},
	});
};
