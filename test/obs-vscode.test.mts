import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  activate,
  buildObsLaunchCommand,
  deactivate,
  resolveObsStudioPlan,
  type ExtensionContextLike,
  type ExtensionDisposable,
  type VscodeApiLike,
} from '../src/extension.mts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('resolves live cas-v1 obs-win64.tar.zst (33.0.3), libsectium_display, and b8g-ghost-abi', async () => {
  const plan = await resolveObsStudioPlan({
    platform: 'win32',
    arch: 'x64',
    forceRefresh: true,
  });

  assert.equal(plan.indexSchema, 'b8g-ghost-cas-index-v1');
  assert.equal(plan.obs.filename, 'obs-win64.tar.zst');
  assert.equal(plan.obs.version, '33.0.3');
  assert.match(plan.obs.sha256, /^[a-f0-9]{64}$/);
  assert.ok(plan.obs.bytes > 100_000_000, 'Expected real OBS Studio 33 archive (>100 MB)');

  assert.equal(plan.sectiumDisplay.filename, 'libsectium_display.dll');
  assert.match(plan.sectiumDisplay.sha256, /^[a-f0-9]{64}$/);
  assert.ok(plan.sectiumDisplay.bytes > 10_000);

  assert.equal(plan.ghostAbi.filename, 'b8g-ghost-abi-win64.node');
  assert.match(plan.ghostAbi.sha256, /^[a-f0-9]{64}$/);
  assert.ok(plan.ghostAbi.bytes > 5_000);
});

test('buildObsLaunchCommand sets cwd to bin/64bit and formats portable/scene/recording flags', async () => {
  const plan = await resolveObsStudioPlan({
    platform: 'win32',
    arch: 'x64',
    cacheDir: 'C:\\b8g-cas',
  });

  const launch = buildObsLaunchCommand(plan, {
    portable: true,
    scene: 'Awesome-OS Demo',
    startRecording: true,
    overlayUrl: 'file:///workspace/overlay.html',
    extraArgs: ['--multi'],
  });

  assert.ok(
    launch.cwd.endsWith('\\bin\\64bit') || launch.cwd.endsWith('/bin/64bit'),
    `Expected cwd to end with bin/64bit, got: ${launch.cwd}`,
  );
  assert.ok(
    launch.command.endsWith('\\bin\\64bit\\obs64.exe'),
    `Expected obs64.exe command, got: ${launch.command}`,
  );
  assert.deepEqual(launch.args, [
    '--portable',
    '--scene',
    'Awesome-OS Demo',
    '--startrecording',
    '--multi',
  ]);
  assert.equal(launch.env.B8G_GHOST_OBS_VERSION, '33.0.3');
  assert.equal(launch.env.B8G_GHOST_OBS_SHA256, plan.obs.sha256);
  assert.equal(launch.env.B8G_SECTIUM_DISPLAY_SHA256, plan.sectiumDisplay.sha256);
  assert.equal(launch.env.B8G_GHOST_ABI_SHA256, plan.ghostAbi.sha256);
  assert.equal(launch.env.OBS_GHOST_OVERLAY_URL, 'file:///workspace/overlay.html');
});

test('package.json defines valid Open VSX / VS Code manifest and obs-ghost contributions', () => {
  const pkg = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
    name: string;
    publisher: string;
    type: string;
    license: string;
    main: string;
    contributes: {
      commands: Array<{ command: string; title: string }>;
      taskDefinitions: Array<{ type: string }>;
    };
  };

  assert.equal(pkg.name, 'obs-ghost');
  assert.equal(pkg.publisher, 'awesome-os');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.main, './src/extension.mts');

  const commandIds = pkg.contributes.commands.map((c) => c.command);
  assert.deepEqual(commandIds, [
    'obsGhost.hydrate',
    'obsGhost.launch',
    'obsGhost.previewOverlay',
    'obsGhost.startRecording',
  ]);

  const taskTypes = pkg.contributes.taskDefinitions.map((t) => t.type);
  assert.ok(taskTypes.includes('obs-ghost'), 'Expected obs-ghost task definition');
});

test('activate() registers all 4 commands and obs-ghost task provider, and deactivate() disposes them', () => {
  const registeredCommands: string[] = [];
  const registeredTasks: string[] = [];
  let disposedCount = 0;

  const makeDisposable = (): ExtensionDisposable => ({
    dispose() {
      disposedCount += 1;
    },
  });

  const mockApi: VscodeApiLike = {
    commands: {
      registerCommand(command) {
        registeredCommands.push(command);
        return makeDisposable();
      },
    },
    tasks: {
      registerTaskProvider(type) {
        registeredTasks.push(type);
        return makeDisposable();
      },
    },
  };

  const context: ExtensionContextLike = { subscriptions: [] };
  const disposables = activate(context, mockApi);

  assert.equal(disposables.length, 5);
  assert.equal(context.subscriptions.length, 5);
  assert.deepEqual(registeredCommands, [
    'obsGhost.hydrate',
    'obsGhost.launch',
    'obsGhost.previewOverlay',
    'obsGhost.startRecording',
  ]);
  assert.deepEqual(registeredTasks, ['obs-ghost']);

  deactivate();
  assert.equal(disposedCount, 5);
});
