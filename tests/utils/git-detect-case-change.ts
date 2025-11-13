import spawn, { type SubprocessError } from 'nano-spawn';

const gitDetectCaseChangePath = new URL('../../dist/index.cjs', import.meta.url).pathname;

export const gitDetectCaseChange = async (
	fixturePath: string,
	arguments_: string[] = [],
) => (
	await spawn(
		gitDetectCaseChangePath,
		arguments_,
		{ cwd: fixturePath },
	).catch(error => error as SubprocessError)
);
