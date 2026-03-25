import spawn from 'nano-spawn';

export const resolveOrigHead = async (): Promise<string | null> => {
	try {
		const result = await spawn('git', ['rev-parse', '--verify', 'ORIG_HEAD']);
		const sha = result.stdout.trim();
		return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
	} catch {
		return null;
	}
};
