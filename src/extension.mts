/**
 * @file src/extension.mts
 * @description MIT OBS Studio 33 extension for Awesome-OS Code - OSS & Eclipse Theia.
 *   Resolves live `obs-win64.tar.zst` (33.0.3), `libsectium_display`, and `b8g-ghost-abi`
 *   from `awesome-os/b8g-ghost @ cas-v1`, constructs portable OBS launch commands
 *   (`cwd = <installDir>/bin/64bit` on Windows), and registers VS Code / Theia commands
 *   and the `obs-ghost` task provider.
 */

import { homedir } from 'node:os';
import { dirname, join, posix, win32 } from 'node:path';

export const GHOST_INDEX_URL =
  process.env.B8G_GHOST_INDEX_URL ??
  'https://raw.githubusercontent.com/awesome-os/b8g-ghost/main/manifests/index.json';

export const GHOST_CAS_BASE_URL =
  process.env.B8G_GHOST_CAS_URL ??
  'https://github.com/awesome-os/b8g-ghost/releases/download/cas-v1';

export interface GhostCasHistoryItem {
  sha256: string;
  bytes: number;
  version?: string;
  retired_at?: string;
}

export interface GhostCasEntry {
  filename: string;
  sha256: string;
  bytes: number;
  raw_bytes?: number;
  version?: string;
  category?: string;
  download_url: string;
  history?: GhostCasHistoryItem[];
}

export interface GhostIndex {
  schema: string;
  cas_base_url: string;
  updated_at: string;
  total_entries: number;
  entries: Record<string, GhostCasEntry>;
}

export interface ResolveObsPlanOptions {
  platform?: NodeJS.Platform;
  arch?: string;
  indexUrl?: string;
  cacheDir?: string;
  pinnedSha256?: string;
  forceRefresh?: boolean;
  index?: GhostIndex;
}

export interface ObsStudioPlan {
  platform: NodeJS.Platform;
  arch: string;
  indexSchema: string;
  casBaseUrl: string;
  cacheDir: string;
  installDir: string;
  obs: GhostCasEntry;
  sectiumDisplay: GhostCasEntry;
  ghostAbi: GhostCasEntry;
}

export interface ObsLaunchOptions {
  portable?: boolean;
  scene?: string;
  collection?: string;
  profile?: string;
  startRecording?: boolean;
  minimizeToTray?: boolean;
  overlayUrl?: string;
  extraArgs?: string[];
  env?: Record<string, string>;
}

export interface ObsLaunchCommand {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export interface ExtensionDisposable {
  dispose(): void;
}

export interface ExtensionContextLike {
  subscriptions: ExtensionDisposable[];
}

export interface VscodeApiLike {
  commands: {
    registerCommand(command: string, callback: (...args: unknown[]) => unknown): ExtensionDisposable;
  };
  tasks?: {
    registerTaskProvider(type: string, provider: unknown): ExtensionDisposable;
  };
  window?: {
    showInformationMessage(message: string): unknown;
    showErrorMessage(message: string): unknown;
  };
}

let cachedIndex: GhostIndex | null = null;
const activeDisposables: ExtensionDisposable[] = [];

export function getObsAssetKey(
  platform: NodeJS.Platform = 'win32',
  arch = 'x64',
): string {
  if (platform === 'win32') return 'obs-win64.tar.zst';
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'obs-macos-arm64.tar.zst' : 'obs-macos-x64.tar.zst';
  }
  return arch === 'arm64' ? 'obs-linux-arm64.tar.zst' : 'obs-linux-x64.tar.zst';
}

export function getSectiumDisplayKey(
  platform: NodeJS.Platform = 'win32',
  arch = 'x64',
): string {
  if (platform === 'win32') return 'libsectium_display.dll';
  if (platform === 'darwin') return 'libsectium_display-macos-arm64.dylib';
  return arch === 'arm64'
    ? 'libsectium_display-linux-arm64.so'
    : 'libsectium_display-linux-x64.so';
}

export function getGhostAbiKey(
  platform: NodeJS.Platform = 'win32',
  arch = 'x64',
): string {
  if (platform === 'win32') return 'b8g-ghost-abi-win64.node';
  if (platform === 'darwin') return 'b8g-ghost-abi-macos-arm64.node';
  return arch === 'arm64'
    ? 'b8g-ghost-abi-linux-arm64.node'
    : 'b8g-ghost-abi-linux-x64.node';
}

export function getObsExecutableRelPath(platform: NodeJS.Platform = 'win32'): string {
  const p = platform === 'win32' ? win32 : posix;
  if (platform === 'win32') return p.join('bin', '64bit', 'obs64.exe');
  if (platform === 'darwin') return p.join('OBS.app', 'Contents', 'MacOS', 'OBS');
  return p.join('bin', 'obs');
}

export function applyKeepLast5Pin(entry: GhostCasEntry, pinnedSha?: string): GhostCasEntry {
  const sha = pinnedSha?.trim().toLowerCase();
  if (!sha || sha === entry.sha256.toLowerCase()) {
    return entry;
  }
  const hist = entry.history?.find((item) => item.sha256.toLowerCase() === sha);
  if (hist) {
    return {
      ...entry,
      sha256: hist.sha256,
      bytes: hist.bytes,
      version: hist.version ?? entry.version,
      download_url: `${GHOST_CAS_BASE_URL}/${hist.sha256}`,
    };
  }
  return entry;
}

export async function fetchGhostIndex(
  forceRefresh = false,
  indexUrl = GHOST_INDEX_URL,
): Promise<GhostIndex> {
  if (cachedIndex && !forceRefresh && indexUrl === GHOST_INDEX_URL) {
    return cachedIndex;
  }
  const res = await fetch(indexUrl, {
    headers: { 'User-Agent': 'awesome-os-obs-vscode/0.1.0' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching b8g-ghost cas-v1 index from ${indexUrl}`);
  }
  const json = (await res.json()) as GhostIndex;
  if (indexUrl === GHOST_INDEX_URL) {
    cachedIndex = json;
  }
  return json;
}

export async function resolveObsStudioPlan(
  options: ResolveObsPlanOptions = {},
): Promise<ObsStudioPlan> {
  const platform = options.platform ?? 'win32';
  const arch = options.arch ?? 'x64';
  const index =
    options.index ?? (await fetchGhostIndex(Boolean(options.forceRefresh), options.indexUrl));

  const preferredObsKey = getObsAssetKey(platform, arch);
  const rawObs = index.entries[preferredObsKey] ?? index.entries['obs-win64.tar.zst'];
  if (!rawObs) {
    throw new Error(
      `OBS Studio artifact "${preferredObsKey}" not found in b8g-ghost cas-v1 index (${index.total_entries} entries).`,
    );
  }
  const obs = applyKeepLast5Pin(rawObs, options.pinnedSha256 ?? process.env.OBS_GHOST_SHA256);

  const sectiumKey = getSectiumDisplayKey(platform, arch);
  const sectiumDisplay =
    index.entries[sectiumKey] ?? index.entries['libsectium_display.dll'];
  if (!sectiumDisplay) {
    throw new Error(`Sectium display runtime "${sectiumKey}" not found in cas-v1 index.`);
  }

  const abiKey = getGhostAbiKey(platform, arch);
  const ghostAbi =
    index.entries[abiKey] ?? index.entries['b8g-ghost-abi-win64.node'];
  if (!ghostAbi) {
    throw new Error(`b8g-ghost-abi addon "${abiKey}" not found in cas-v1 index.`);
  }

  const cacheDir =
    options.cacheDir ?? process.env.B8G_GHOST_CACHE_DIR ?? join(homedir(), '.b8g', 'cas');
  const installDir = join(cacheDir, 'obs', obs.sha256);

  return {
    platform,
    arch,
    indexSchema: index.schema,
    casBaseUrl: index.cas_base_url || GHOST_CAS_BASE_URL,
    cacheDir,
    installDir,
    obs,
    sectiumDisplay,
    ghostAbi,
  };
}

export function buildObsLaunchCommand(
  plan: ObsStudioPlan,
  options: ObsLaunchOptions = {},
): ObsLaunchCommand {
  const isWin = plan.platform === 'win32';
  const pathImpl = isWin ? win32 : posix;
  const relExe = getObsExecutableRelPath(plan.platform);
  const command = pathImpl.join(plan.installDir, relExe);
  const cwd = isWin ? pathImpl.join(plan.installDir, 'bin', '64bit') : dirname(command);

  const args: string[] = [];
  if (options.portable !== false) {
    args.push('--portable');
  }
  if (options.scene) {
    args.push('--scene', options.scene);
  }
  if (options.collection) {
    args.push('--collection', options.collection);
  }
  if (options.profile) {
    args.push('--profile', options.profile);
  }
  if (options.startRecording) {
    args.push('--startrecording');
  }
  if (options.minimizeToTray) {
    args.push('--minimize-to-tray');
  }
  if (options.extraArgs && options.extraArgs.length > 0) {
    args.push(...options.extraArgs);
  }

  const env: Record<string, string> = {
    B8G_GHOST_OBS_SHA256: plan.obs.sha256,
    B8G_GHOST_OBS_VERSION: plan.obs.version ?? '',
    B8G_SECTIUM_DISPLAY_SHA256: plan.sectiumDisplay.sha256,
    B8G_GHOST_ABI_SHA256: plan.ghostAbi.sha256,
    ...(options.overlayUrl ? { OBS_GHOST_OVERLAY_URL: options.overlayUrl } : {}),
    ...(options.env ?? {}),
  };

  return {
    command,
    args,
    cwd,
    env,
  };
}

export function activate(
  context?: ExtensionContextLike,
  vscodeApi?: VscodeApiLike,
): ExtensionDisposable[] {
  const registered: ExtensionDisposable[] = [];

  if (vscodeApi?.commands) {
    const register = (id: string, handler: (...args: unknown[]) => unknown): void => {
      const disposable = vscodeApi.commands.registerCommand(id, handler);
      registered.push(disposable);
      activeDisposables.push(disposable);
      context?.subscriptions.push(disposable);
    };

    register('obsGhost.hydrate', async () => {
      const plan = await resolveObsStudioPlan();
      vscodeApi.window?.showInformationMessage(
        `OBS Ghost ready: ${plan.obs.filename} (${plan.obs.version ?? 'latest'})`,
      );
      return plan;
    });

    register('obsGhost.launch', async (launchOptions?: unknown) => {
      const plan = await resolveObsStudioPlan();
      const cmd = buildObsLaunchCommand(
        plan,
        (launchOptions as ObsLaunchOptions | undefined) ?? { portable: true },
      );
      vscodeApi.window?.showInformationMessage(`OBS Ghost launch prepared: ${cmd.command}`);
      return cmd;
    });

    register('obsGhost.previewOverlay', async (overlayUrl?: unknown) => {
      const plan = await resolveObsStudioPlan();
      const url = typeof overlayUrl === 'string' && overlayUrl.length > 0
        ? overlayUrl
        : 'file:///overlay.html';
      return buildObsLaunchCommand(plan, { portable: true, overlayUrl: url });
    });

    register('obsGhost.startRecording', async (scene?: unknown) => {
      const plan = await resolveObsStudioPlan();
      return buildObsLaunchCommand(plan, {
        portable: true,
        startRecording: true,
        scene: typeof scene === 'string' ? scene : undefined,
      });
    });
  }

  if (vscodeApi?.tasks) {
    const providerDisposable = vscodeApi.tasks.registerTaskProvider('obs-ghost', {
      provideTasks: () => [],
      resolveTask: (task: unknown) => task,
    });
    registered.push(providerDisposable);
    activeDisposables.push(providerDisposable);
    context?.subscriptions.push(providerDisposable);
  }

  return registered;
}

export function deactivate(): void {
  while (activeDisposables.length > 0) {
    const d = activeDisposables.pop();
    d?.dispose();
  }
}
