import spawn from 'nano-spawn';

export const chmod = async (
	mode: string,
	path: string,
) => spawn('chmod', [mode, path]);
