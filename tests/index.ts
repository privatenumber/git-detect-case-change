import { describe, expect } from 'manten';
import { createFixture } from 'fs-fixture';
import spawn, { type SubprocessError } from 'nano-spawn';
import { createGit } from './utils/create-git.js';

const gitDetectCaseChangePath = new URL('../dist/index.cjs', import.meta.url).pathname;

const gitDetectCaseChange = async (
	fixturePath: string,
	args: string[] = [],
) => (
	await spawn(
		gitDetectCaseChangePath,
		args,
		{ cwd: fixturePath },
	).catch(error => error as SubprocessError)
);

describe('git-detect-case-change', ({ test }) => {
	test('detects basic case change', async ({ onTestFail }) => {
		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		// Commit the file with lowercase
		await git('add', ['src/index.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Rename to uppercase (case-insensitive filesystem won't see change)
		await fixture.rm('src/index.ts');
		await fixture.writeFile('src/INDEX.ts', 'export const main = true;');

		// Run detection
		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('src/index.ts -> src/INDEX.ts');

		// Verify file was staged with git mv
		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/^R/); // Rename staged
	});

	test('dry run mode does not stage changes', async ({ onTestFail }) => {
		await using fixture = await createFixture({
			'src/utils.ts': 'export const util = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		// Commit the file
		await git('add', ['src/utils.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Rename case
		await fixture.rm('src/utils.ts');
		await fixture.writeFile('src/UTILS.ts', 'export const util = true;');

		// Run detection with --dry
		const result = await gitDetectCaseChange(fixture.path, ['--dry']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('src/utils.ts -> src/UTILS.ts');

		// Verify nothing was staged
		const status = await git('status', ['--porcelain']);
		expect(status).toBe(''); // No changes staged
	});

	test('skips already-staged moves', async ({ onTestFail }) => {
		await using fixture = await createFixture({
			'src/helper.ts': 'export const helper = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		// Commit the file
		await git('add', ['src/helper.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Manually stage the case change with git mv
		await git('mv', ['src/helper.ts', 'src/HELPER.ts']);

		// Run detection (should skip already-staged move)
		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Should not output anything (already staged)
		expect(result.stdout).toBe('');

		// Verify still staged (not re-moved)
		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/^R/);
		expect(status).toMatch('src/helper.ts -> src/HELPER.ts');
	});

	test('handles multiple case changes', async ({ onTestFail }) => {
		await using fixture = await createFixture({
			'src/file1.ts': 'export const file1 = true;',
			'src/file2.ts': 'export const file2 = true;',
			'lib/file3.ts': 'export const file3 = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		// Commit all files
		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Rename all to uppercase
		await fixture.rm('src/file1.ts');
		await fixture.writeFile('src/FILE1.ts', 'export const file1 = true;');

		await fixture.rm('src/file2.ts');
		await fixture.writeFile('src/FILE2.ts', 'export const file2 = true;');

		await fixture.rm('lib/file3.ts');
		await fixture.writeFile('lib/FILE3.ts', 'export const file3 = true;');

		// Run detection
		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Should detect all three changes
		expect(result.stdout).toMatch('src/file1.ts -> src/FILE1.ts');
		expect(result.stdout).toMatch('src/file2.ts -> src/FILE2.ts');
		expect(result.stdout).toMatch('lib/file3.ts -> lib/FILE3.ts');

		// Verify all files were staged
		const status = await git('status', ['--porcelain']);
		const renamedCount = (status.match(/^R/gm) || []).length;
		expect(renamedCount).toBe(3);
	});
});
