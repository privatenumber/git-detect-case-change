import fs from 'node:fs/promises';
import {
	describe, test, expect, onTestFail,
} from 'manten';
import { createFixture } from 'fs-fixture';
import { isFsCaseSensitive } from 'is-fs-case-sensitive';
import { checkCaseDifferences } from '../src/utils/check-case-differences.ts';
import { createGit } from './utils/create-git.ts';
import { gitDetectCaseChange } from './utils/git-detect-case-change.ts';
import { chmod } from './utils/chmod.ts';

describe('checkCaseDifferences', () => {
	test('reads each directory at most once (perf invariant)', async () => {
		await using fixture = await createFixture({
			'src/a/one.ts': '',
			'src/a/two.ts': '',
			'src/a/three.ts': '',
			'src/b/one.ts': '',
			'src/b/two.ts': '',
			'lib/x/y/deep.ts': '',
			'lib/x/y/deeper.ts': '',
			'lib/x/z/file.ts': '',
			'readme.md': '',
		});

		const gitFiles = [
			'src/a/one.ts',
			'src/a/two.ts',
			'src/a/three.ts',
			'src/b/one.ts',
			'src/b/two.ts',
			'lib/x/y/deep.ts',
			'lib/x/y/deeper.ts',
			'lib/x/z/file.ts',
			'readme.md',
		];

		const readdirCalls: string[] = [];
		const originalReaddir = fs.readdir;
		const spy = (async (...args: Parameters<typeof fs.readdir>) => {
			const callPath = String(args[0]);
			// Filter to calls targeting our fixture to avoid pollution
			// from tests running in parallel.
			if (callPath.startsWith(fixture.path)) {
				readdirCalls.push(callPath);
			}
			return (originalReaddir as (...arguments_: unknown[]) => unknown).apply(fs, args);
		}) as typeof fs.readdir;
		fs.readdir = spy;

		try {
			await checkCaseDifferences(gitFiles, fixture.path);
		} finally {
			fs.readdir = originalReaddir;
		}

		onTestFail(() => {
			console.log('readdir calls:', readdirCalls);
		});

		// Unique directories touched: fixture root, src, src/a, src/b, lib, lib/x, lib/x/y, lib/x/z = 8
		const uniqueDirectoryCount = new Set(readdirCalls).size;
		expect(uniqueDirectoryCount).toBe(8);
		// Each unique directory should be read exactly once - the whole point of this module.
		expect(readdirCalls.length).toBe(uniqueDirectoryCount);
	});

	test('detects file name case difference', async () => {
		await using fixture = await createFixture({
			'src/index.ts': 'content',
		});

		const result = await checkCaseDifferences(['src/INDEX.ts'], fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result).toStrictEqual([['src/INDEX.ts', 'src/index.ts']]);
	});

	test('detects directory case difference', async () => {
		await using fixture = await createFixture({
			'src/index.ts': 'content',
		});

		const result = await checkCaseDifferences(['SRC/index.ts'], fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result).toStrictEqual([['SRC/index.ts', 'src/index.ts']]);
	});

	test('detects nested directory case difference', async () => {
		await using fixture = await createFixture({
			'src/components/ui/Button.tsx': 'content',
		});

		const result = await checkCaseDifferences(['src/COMPONENTS/ui/Button.tsx'], fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result).toStrictEqual([['src/COMPONENTS/ui/Button.tsx', 'src/components/ui/Button.tsx']]);
	});

	test('returns empty when casing matches', async () => {
		await using fixture = await createFixture({
			'src/index.ts': 'content',
		});

		const result = await checkCaseDifferences(['src/index.ts'], fixture.path);
		expect(result).toStrictEqual([]);
	});

	test('handles multiple files with mixed differences', async () => {
		await using fixture = await createFixture({
			'src/file1.ts': 'content1',
			'src/file2.ts': 'content2',
			'lib/utils.ts': 'content3',
		});

		const result = await checkCaseDifferences([
			'src/FILE1.ts',
			'src/file2.ts',
			'LIB/utils.ts',
		], fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result).toStrictEqual([
			['src/FILE1.ts', 'src/file1.ts'],
			['LIB/utils.ts', 'lib/utils.ts'],
		]);
	});

	test('silently skips nonexistent files', async () => {
		await using fixture = await createFixture({
			'src/index.ts': 'content',
		});

		const result = await checkCaseDifferences(['src/nonexistent.ts'], fixture.path);
		expect(result).toStrictEqual([]);
	});

	test('detects root-level file case difference', async () => {
		await using fixture = await createFixture({
			'readme.md': 'content',
		});

		const result = await checkCaseDifferences(['README.md'], fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result).toStrictEqual([['README.md', 'readme.md']]);
	});

	// On macOS/Windows a file can be stored on disk in NFD (decomposed) form while
	// git ls-tree returns it in NFC (composed) form — the two byte sequences are
	// semantically the same file, so nothing should be reported as "different".
	test('treats NFC git path as equal to NFD disk file', async () => {
		const nfcName = 'caf\u00E9.ts'; // 'café.ts' composed
		const nfdName = 'cafe\u0301.ts'; // 'café.ts' decomposed

		await using fixture = await createFixture({
			[nfdName]: 'content',
		});

		const result = await checkCaseDifferences([nfcName], fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result).toStrictEqual([]);
	});

	// Normalization handling must not hide genuine case differences that happen to
	// coincide with a normalization difference.
	test('detects case difference even when disk form is NFD', async () => {
		const nfcLowerName = 'caf\u00E9.ts'; // 'café.ts' composed lowercase
		const nfdUpperName = 'CAFE\u0301.TS'; // 'CAFÉ.TS' decomposed uppercase

		await using fixture = await createFixture({
			[nfdUpperName]: 'content',
		});

		const result = await checkCaseDifferences([nfcLowerName], fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result).toStrictEqual([[nfcLowerName, nfdUpperName]]);
	});
});

describe('git-detect-case-change', () => {
	test('detects basic case change', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
		});

		const git = await createGit(fixture.path);

		// Commit the file with lowercase
		await git('add', ['src/index.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Rename to uppercase (case-insensitive filesystem won't see change)
		await fixture.mv('src/index.ts', 'src/INDEX.ts');

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

	test('dry run mode does not stage changes', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'src/utils.ts': 'export const util = true;',
		});

		const git = await createGit(fixture.path);

		// Commit the file
		await git('add', ['src/utils.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Rename case
		await fixture.mv('src/utils.ts', 'src/UTILS.ts');

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

	test('skips already-staged moves', async () => {
		await using fixture = await createFixture({
			'src/helper.ts': 'export const helper = true;',
		});

		const git = await createGit(fixture.path);

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

	test('skips already-staged moves that were modified (RM status)', async () => {
		await using fixture = await createFixture({
			'src/utils.ts': 'export const utils = true;',
		});

		const git = await createGit(fixture.path);

		// Commit the file
		await git('add', ['src/utils.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Manually stage the case change with git mv
		await git('mv', ['src/utils.ts', 'src/UTILS.ts']);

		// Modify the file after renaming (creates RM status)
		await fixture.writeFile('src/UTILS.ts', 'export const utils = false;');

		// Verify we have RM status
		const statusBefore = await git('status', ['--porcelain']);
		expect(statusBefore).toMatch(/^RM/);

		// Run detection (should skip already-staged move even with modification)
		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Should not output anything (already staged)
		expect(result.stdout).toBe('');

		// Verify still staged with modification (not re-moved)
		const statusAfter = await git('status', ['--porcelain']);
		expect(statusAfter).toMatch(/^RM/);
		expect(statusAfter).toMatch('src/utils.ts -> src/UTILS.ts');
	});

	test('handles multiple case changes', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			src: {
				'file1.ts': 'export const file1 = true;',
				'file2.ts': 'export const file2 = true;',
			},
			'lib/file3.ts': 'export const file3 = true;',
		});

		const git = await createGit(fixture.path);

		// Commit all files
		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Rename all to uppercase
		await fixture.mv('src/file1.ts', 'src/FILE1.ts');
		await fixture.mv('src/file2.ts', 'src/FILE2.ts');
		await fixture.mv('lib/file3.ts', 'lib/FILE3.ts');

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

describe('--fix-local mode', () => {
	test('renames local files to match Git case', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
		});

		const git = await createGit(fixture.path);

		// Commit the file with lowercase
		await git('add', ['src/index.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Simulate filesystem having different case (e.g., after pull from remote)
		await fixture.mv('src/index.ts', 'src/INDEX.ts');

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

	test('dry run does not rename files', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'src/utils.ts': 'export const util = true;',
		});

		const git = await createGit(fixture.path);

		// Commit the file
		await git('add', ['src/utils.ts']);
		await git('commit', ['-m', 'Initial commit']);

		// Change filesystem case
		await fixture.mv('src/utils.ts', 'src/UTILS.ts');

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

	test('handles multiple files', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			src: {
				'file1.ts': 'export const file1 = true;',
				'file2.ts': 'export const file2 = true;',
			},
			'lib/file3.ts': 'export const file3 = true;',
		});

		const git = await createGit(fixture.path);

		// Commit all files
		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Change all to uppercase on filesystem
		await fixture.mv('src/file1.ts', 'src/FILE1.ts');
		await fixture.mv('src/file2.ts', 'src/FILE2.ts');
		await fixture.mv('lib/file3.ts', 'lib/FILE3.ts');

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

	test('handles folder case changes', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'Folder1/File.txt': 'content1',
			Folder2: {
				'File1.txt': 'content2',
				'File2.txt': 'content3',
			},
		});

		const git = await createGit(fixture.path);

		// Commit all files
		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Simulate Windows filesystem having different case
		await fixture.mv('Folder1', 'FOLDER1');
		await fixture.mv('Folder2', 'FOLDER2');

		// Run with --fix-local
		const result = await gitDetectCaseChange(fixture.path, ['--fix-local']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Should fix directories (files move automatically with their parent directory)
		expect(result.stdout).toMatch('Fixed: FOLDER1/ -> Folder1/');
		expect(result.stdout).toMatch('Fixed: FOLDER2/ -> Folder2/');

		// Should not have errors from stale paths
		expect(result.stderr).toBe('');

		// Verify git status is clean
		const status = await git('status', ['--porcelain']);
		expect(status).toBe('');
	});

	test('handles folder AND file case changes', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'Folder/file.txt': 'content',
		});

		const git = await createGit(fixture.path);

		// Commit with lowercase
		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Change BOTH folder and file case
		await fixture.mv('Folder', 'FOLDER');
		await fixture.mv('FOLDER/file.txt', 'FOLDER/FILE.txt');

		// Run with --fix-local
		const result = await gitDetectCaseChange(fixture.path, ['--fix-local']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Should fix both directory and file
		expect(result.stdout).toMatch('Fixed: FOLDER/ -> Folder/');
		expect(result.stdout).toMatch('Fixed: Folder/FILE.txt -> Folder/file.txt');

		// Should not have errors
		expect(result.stderr).toBe('');

		// Verify git status is clean
		const status = await git('status', ['--porcelain']);
		expect(status).toBe('');
	});
});

describe('Path complexity', () => {
	test('handles nested directories', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'src/components/ui/Button.tsx': 'export const Button = () => {};',
		});

		const git = await createGit(fixture.path);

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Change case deep in directory tree
		await fixture.mv('src/components/ui/Button.tsx', 'src/components/ui/BUTTON.tsx');

		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('src/components/ui/Button.tsx -> src/components/ui/BUTTON.tsx');

		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/^R/);
	});

	test('handles files with spaces', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'my file.ts': 'export const main = true;',
		});

		const git = await createGit(fixture.path);

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Change case
		await fixture.mv('my file.ts', 'MY FILE.ts');

		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('my file.ts -> MY FILE.ts');

		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/^R/);
	});

	test('handles partial case changes', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'aBcDef.ts': 'export const main = true;',
		});

		const git = await createGit(fixture.path);

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Partial case change (not all letters flipped)
		await fixture.mv('aBcDef.ts', 'AbCdEf.ts');

		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('aBcDef.ts -> AbCdEf.ts');

		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/^R/);
	});
});

describe('Error handling', () => {
	test('fails when not in git repository', async () => {
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

	test('handles empty git repository', async () => {
		await using fixture = await createFixture({
			'file.ts': 'export const main = true;',
		});

		await createGit(fixture.path);

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

	test('continues processing after fs.rename failure in fix-local mode', async () => {
		if (process.platform === 'win32') {
			console.log('Skipped: chmod does not work on Windows');
			return;
		}

		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			src: {
				'file1.ts': 'export const file1 = true;',
				'file2.ts': 'export const file2 = true;',
			},
			'readonly/.gitkeep': '',
		});

		const git = await createGit(fixture.path);

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Change case for both files
		await fixture.mv('src/file1.ts', 'src/FILE1.ts');
		await fixture.mv('src/file2.ts', 'src/FILE2.ts');

		// Make readonly directory readonly to cause fs.rename to fail
		await chmod('555', fixture.getPath('readonly'));

		// Change case in readonly directory
		await chmod('755', fixture.getPath('readonly'));
		await fixture.writeFile('readonly/TEST.txt', 'test');
		await git('add', ['readonly/TEST.txt']);
		await git('commit', ['-m', 'Add readonly file']);
		await fixture.mv('readonly/TEST.txt', 'readonly/test.txt');
		await chmod('555', fixture.getPath('readonly'));

		// Run detection with --fix-local - should fail on readonly but succeed on others
		const result = await gitDetectCaseChange(fixture.path, ['--fix-local']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Restore permissions for cleanup
		await chmod('755', fixture.getPath('readonly'));

		// Should show error for readonly/test.txt but success for others
		expect(result.stderr).toMatch(/Failed to rename/);
		expect(result.stdout).toMatch('src/FILE1.ts -> src/file1.ts');
		expect(result.stdout).toMatch('src/FILE2.ts -> src/file2.ts');
	});

	test('continues processing after git mv failure in default mode', async () => {
		if (process.platform === 'win32') {
			console.log('Skipped: chmod does not work on Windows');
			return;
		}

		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			src: {
				'file1.ts': 'export const file1 = true;',
				'file2.ts': 'export const file2 = true;',
			},
			'readonly/test.txt': 'test',
		});

		const git = await createGit(fixture.path);

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		// Change case for all files
		await fixture.mv('src/file1.ts', 'src/FILE1.ts');
		await fixture.mv('src/file2.ts', 'src/FILE2.ts');
		await fixture.mv('readonly/test.txt', 'readonly/TEST.txt');

		// Make readonly directory readonly to cause git mv to fail
		await chmod('555', fixture.getPath('readonly'));

		// Run detection in default mode - should fail on readonly but succeed on others
		const result = await gitDetectCaseChange(fixture.path);
		onTestFail(() => {
			console.log('Result:', result);
		});

		// Restore permissions for cleanup
		await chmod('755', fixture.getPath('readonly'));

		// Should show error for readonly/test.txt but success for others
		expect(result.stderr).toMatch(/Failed to stage/);
		expect(result.stdout).toMatch('src/file1.ts -> src/FILE1.ts');
		expect(result.stdout).toMatch('src/file2.ts -> src/FILE2.ts');

		// Verify successful files were staged
		const status = await git('status', ['--porcelain']);
		expect(status).toMatch(/R.*file1\.ts.*FILE1\.ts/);
		expect(status).toMatch(/R.*file2\.ts.*FILE2\.ts/);
	});
});

describe('--since mode', () => {
	test('--since with --fix-local fixes filesystem case after merge', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
		});

		const git = await createGit(fixture.path);

		await git('add', ['src/index.ts']);
		await git('commit', ['-m', 'Initial commit']);

		await git('checkout', ['-b', 'feature']);

		await git('mv', ['src/index.ts', 'src/index.ts.tmp']);
		await git('mv', ['src/index.ts.tmp', 'src/INDEX.ts']);
		await git('commit', ['-m', 'Rename to uppercase']);

		await git('checkout', ['main']);
		await git('merge', ['feature']);

		// Case-insensitive FS retains original case after merge
		await fixture.mv('src/INDEX.ts', 'src/index.ts');

		const result = await gitDetectCaseChange(fixture.path, ['--fix-local', '--since', 'ORIG_HEAD']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('Fixed: src/index.ts -> src/INDEX.ts');

		const status = await git('status', ['--porcelain']);
		expect(status).toBe('');
	});

	test('--since scopes to changed files only', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
			'lib/utils.ts': 'export const util = true;',
		});

		const git = await createGit(fixture.path);

		await git('add', ['.']);
		await git('commit', ['-m', 'Initial commit']);

		await git('checkout', ['-b', 'feature']);

		await git('mv', ['src/index.ts', 'src/index.ts.tmp']);
		await git('mv', ['src/index.ts.tmp', 'src/INDEX.ts']);
		await git('commit', ['-m', 'Rename to uppercase']);

		await git('checkout', ['main']);

		const ref = await git('rev-parse', ['HEAD']);
		await git('merge', ['feature']);

		// Case-insensitive FS retains original case after merge
		await fixture.mv('src/INDEX.ts', 'src/index.ts');
		// Separate case mismatch NOT in the diff range (should be ignored)
		await fixture.mv('lib/utils.ts', 'lib/UTILS.ts');

		const result = await gitDetectCaseChange(fixture.path, ['--since', ref]);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('src/INDEX.ts -> src/index.ts');
		expect(result.stdout).not.toMatch('lib/utils.ts');
		expect(result.stdout).not.toMatch('lib/UTILS.ts');
	});

	test('--since with invalid ref errors gracefully', async () => {
		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
		});

		const git = await createGit(fixture.path);

		await git('add', ['src/index.ts']);
		await git('commit', ['-m', 'Initial commit']);

		const result = await gitDetectCaseChange(fixture.path, ['--since', 'nonexistent-ref']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect('exitCode' in result).toBe(true);
		if ('exitCode' in result) {
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toMatch('is not a valid ref');
		}
	});
});

describe('--check mode', () => {
	test('--check exits with code 1 when mismatches found', async () => {
		if (isFsCaseSensitive()) {
			console.log('Skipped: Test only runs on case-insensitive filesystems');
			return;
		}

		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
		});

		const git = await createGit(fixture.path);

		await git('add', ['src/index.ts']);
		await git('commit', ['-m', 'Initial commit']);

		await fixture.mv('src/index.ts', 'src/INDEX.ts');

		const result = await gitDetectCaseChange(fixture.path, ['--check']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toMatch('src/index.ts -> src/INDEX.ts');
		expect('exitCode' in result).toBe(true);
		if ('exitCode' in result) {
			expect(result.exitCode).toBe(1);
		}

		// Verify nothing was staged (implies --dry)
		const status = await git('status', ['--porcelain']);
		expect(status).toBe('');
	});

	test('--check exits with code 0 when no mismatches', async () => {
		await using fixture = await createFixture({
			'src/index.ts': 'export const main = true;',
		});

		const git = await createGit(fixture.path);

		await git('add', ['src/index.ts']);
		await git('commit', ['-m', 'Initial commit']);

		const result = await gitDetectCaseChange(fixture.path, ['--check']);
		onTestFail(() => {
			console.log('Result:', result);
		});

		expect(result.stdout).toBe('');
		expect('exitCode' in result).toBe(false);
	});
});
