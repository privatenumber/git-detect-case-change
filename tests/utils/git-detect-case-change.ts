import { fileURLToPath } from 'node:url';
import spawn, { type SubprocessError } from 'nano-spawn';

const gitDetectCaseChangePath = fileURLToPath(new URL('../../dist/index.cjs', import.meta.url));

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
