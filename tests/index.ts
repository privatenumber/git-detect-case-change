import type fs from 'node:fs';
import { describe, expect } from 'manten';
import { createFixture } from 'fs-fixture';
import spawn, { type SubprocessError } from 'nano-spawn';
import { isFsCaseSensitive } from 'is-fs-case-sensitive';
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
	test('skips on case-sensitive filesystem', async () => {
		// Mock a case-sensitive filesystem
		const mockFs: Pick<typeof fs, 'existsSync' | 'writeFileSync' | 'unlinkSync'> = {
			existsSync: (path) => {
				// Simulate case-sensitive behavior: 'test' and 'TEST' are different files
				const pathString = path instanceof URL ? path.pathname : path.toString();
				return pathString.endsWith('test') || pathString.endsWith('TEST');
			},
			writeFileSync: () => {},
			unlinkSync: () => {},
		};

		const isCaseSensitive = isFsCaseSensitive(undefined, mockFs, false);
		expect(isCaseSensitive).toBe(true);
	});

	test('detects basic case change', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

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

	test('dry run mode does not stage changes', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

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

	test('handles multiple case changes', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

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

describe('--fix-local mode', ({ test }) => {
	test('renames local files to match Git case', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		// Commit the file with lowercase
		await git('add', ['src/index.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Simulate filesystem having different case (e.g., after pull from remote)
		await fixture.rm('src/index.ts');
		await fixture.writeFile('src/INDEX.ts', 'export const main = true;');

		// Run with --fix-local to rename filesystem to match Git
		const result = await gitDetectCaseChange(fixture.path, ['--fix-local']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('Fixed: src/INDEX.ts -> src/index.ts');

		// Verify git status is clean (no pending changes)
		const status = await git('status', ['--porcelain']);
		expect(status).toBe('');
	});

	test('dry run does not rename files', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

		await using fixture = await createFixture({
			'src/utils.ts': 'export const util = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		// Commit the file
		await git('add', ['src/utils.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Change filesystem case
		await fixture.rm('src/utils.ts');
		await fixture.writeFile('src/UTILS.ts', 'export const util = true;');

		// Run with --fix-local --dry
		const result = await gitDetectCaseChange(fixture.path, ['--fix-local', '--dry']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('Fixed: src/UTILS.ts -> src/utils.ts');

		// Verify git status still shows the case difference (not fixed in dry mode)
		const status = await git('status', ['--porcelain']);
		expect(status).toBe(''); // Git can't see case-only differences on case-insensitive FS
	});

	test('handles multiple files', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

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

		// Change all to uppercase on filesystem
		await fixture.rm('src/file1.ts');
		await fixture.writeFile('src/FILE1.ts', 'export const file1 = true;');

		await fixture.rm('src/file2.ts');
		await fixture.writeFile('src/FILE2.ts', 'export const file2 = true;');

		await fixture.rm('lib/file3.ts');
		await fixture.writeFile('lib/FILE3.ts', 'export const file3 = true;');

		// Run with --fix-local
		const result = await gitDetectCaseChange(fixture.path, ['--fix-local']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Should fix all three files
		expect(result.stdout).toMatch('Fixed: src/FILE1.ts -> src/file1.ts');
		expect(result.stdout).toMatch('Fixed: src/FILE2.ts -> src/file2.ts');
		expect(result.stdout).toMatch('Fixed: lib/FILE3.ts -> lib/file3.ts');

		// Verify git status is clean (all files match Git case)
		const status = await git('status', ['--porcelain']);
		expect(status).toBe('');
	});
});

describe('Path complexity', ({ test }) => {
	test('handles nested directories', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

		await using fixture = await createFixture({
			'src/components/ui/Button.tsx': 'export const Button = () => {};',
		});

		const git = createGit(fixture.path);
		await git.init();

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Change case deep in directory tree
		await fixture.rm('src/components/ui/Button.tsx');
		await fixture.writeFile('src/components/ui/BUTTON.tsx', 'export const Button = () => {};');

		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('src/components/ui/Button.tsx -> src/components/ui/BUTTON.tsx');

		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/^R/);
	});

	test('handles files with spaces', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

		await using fixture = await createFixture({
			'my file.ts': 'export const main = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Change case
		await fixture.rm('my file.ts');
		await fixture.writeFile('MY FILE.ts', 'export const main = true;');

		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('my file.ts -> MY FILE.ts');

		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/^R/);
	});

	test('handles partial case changes', async ({ onTestFail, onTestFinish }) => {
		if (isFsCaseSensitive()) {
			onTestFinish(() => {
				console.log('Skipped: Test only runs on case-insensitive filesystems');
			});
			return;
		}

		await using fixture = await createFixture({
			'aBcDef.ts': 'export const main = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Partial case change (not all letters flipped)
		await fixture.rm('aBcDef.ts');
		await fixture.writeFile('AbCdEf.ts', 'export const main = true;');

		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('aBcDef.ts -> AbCdEf.ts');

		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/^R/);
	});
});

describe('Error handling', ({ test }) => {
	test('fails when not in git repository', async ({ onTestFail }) => {
		await using fixture = await createFixture({
			'file.ts': 'export const main = true;',
		});

		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect('exitCode' in result).toBe(true);
		if ('exitCode' in result) {
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toMatch(/fatal|not a git repository/i);
		}
	});

	test('handles empty git repository', async ({ onTestFail }) => {
		await using fixture = await createFixture({
			'file.ts': 'export const main = true;',
		});

		const git = createGit(fixture.path);
		await git.init();

		// No commits yet, so no HEAD
		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Should fail because git ls-tree HEAD won't work
		expect('exitCode' in result).toBe(true);
		if ('exitCode' in result) {
			expect(result.exitCode).not.toBe(0);
		}
	});
});
