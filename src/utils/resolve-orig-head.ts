import spawn from 'nano-spawn';

export const resolveRef = async (ref: string): Promise<string | null> => {
	try {
		const result = await spawn('git', ['rev-parse', '--verify', ref]);
		const sha = result.stdout.trim();
		return /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
	} catch {
		return null;
	}
};
