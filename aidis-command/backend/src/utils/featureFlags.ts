import fs from 'fs';
import path from 'path';

export interface FeatureFlagConfig {
  version: number;
  updatedAt?: string;
  flags: Record<string, boolean>;
  overrides?: Record<string, boolean>;
}

// Helper function to get environment variable with AIDIS_ prefix and fallback
function getEnvVar(aidisKey: string, legacyKey: string, defaultValue: string = ''): string {
  return process.env[aidisKey] || process.env[legacyKey] || defaultValue;
}

const DEFAULT_REFRESH_INTERVAL = parseInt(getEnvVar('AIDIS_FEATURE_FLAG_REFRESH_MS', 'FEATURE_FLAG_REFRESH_MS', '5000'), 10);
const DEFAULT_CONFIG_PATH = getEnvVar('AIDIS_FEATURE_FLAG_PATH', 'FEATURE_FLAG_PATH')
  ? path.resolve(getEnvVar('AIDIS_FEATURE_FLAG_PATH', 'FEATURE_FLAG_PATH'))
  : path.resolve(process.cwd(), '../..', 'config', 'feature-flags.json');

function loadOverridesFromEnv(): Record<string, boolean> {
  const raw = getEnvVar('AIDIS_FEATURE_FLAG_OVERRIDES', 'FEATURE_FLAG_OVERRIDES');
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return Object.entries(parsed).reduce<Record<string, boolean>>((acc, [key, value]) => {
      acc[String(key)] = Boolean(value);
      return acc;
    }, {});
  } catch (error) {
    console.warn('[FeatureFlags] Failed to parse AIDIS_FEATURE_FLAG_OVERRIDES env var:', error);
    return {};
  }
}

async function readConfig(configPath: string): Promise<FeatureFlagConfig | null> {
  try {
    const file = await fs.promises.readFile(configPath, 'utf-8');
    const parsed = JSON.parse(file) as FeatureFlagConfig;
    parsed.flags = parsed.flags || {};
    return parsed;
  } catch (error) {
    console.warn(`[FeatureFlags] Unable to read config at ${configPath}:`, error);
    return null;
  }
}

export class FeatureFlagStore {
  private configPath: string;
  private flags: Record<string, boolean> = {};
  private refreshInterval: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private version: number | null = null;
  private updatedAt: string | null = null;

  constructor(configPath: string = DEFAULT_CONFIG_PATH, refreshInterval = DEFAULT_REFRESH_INTERVAL) {
    this.configPath = configPath;
    this.refreshInterval = refreshInterval;
  }

  async initialize(): Promise<void> {
    await this.refresh();
    if (this.refreshInterval > 0) {
      this.timer = setInterval(() => {
        void this.refresh();
      }, this.refreshInterval);
    }
  }

  async refresh(): Promise<void> {
    const config = await readConfig(this.configPath);
    if (!config) {
      return;
    }

    const envOverrides = loadOverridesFromEnv();
    const combined = {
      ...config.flags,
      ...(config.overrides || {}),
      ...envOverrides,
    };

    this.flags = combined;
    this.version = typeof config.version === 'number' ? config.version : null;
    this.updatedAt = config.updatedAt ?? null;
  }

  getFlag(name: string, defaultValue = false): boolean {
    return Object.prototype.hasOwnProperty.call(this.flags, name)
      ? this.flags[name]
      : defaultValue;
  }

  getAllFlags(): Record<string, boolean> {
    return { ...this.flags };
  }

  getMetadata(): { version: number | null; updatedAt: string | null } {
    return {
      version: this.version,
      updatedAt: this.updatedAt,
    };
  }

  dispose(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

const featureFlagStore = new FeatureFlagStore();
let initialized = false;

export async function ensureFeatureFlags(): Promise<FeatureFlagStore> {
  if (!initialized) {
    await featureFlagStore.initialize();
    initialized = true;
  }
  return featureFlagStore;
}

export default featureFlagStore;
