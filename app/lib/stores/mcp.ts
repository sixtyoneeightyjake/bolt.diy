import { create } from 'zustand';
import type { MCPConfig, MCPServerTools } from '~/lib/services/mcpService';

const MCP_SETTINGS_KEY = 'mcp_settings';
const isBrowser = typeof window !== 'undefined';

type MCPSettings = {
  mcpConfig: MCPConfig;
  maxLLMSteps: number;
};

function getEnv(key: string): string | undefined {
  // Vite exposes env on import.meta.env at build time
  try {
    // @ts-ignore -- Vite env typing may not include dynamic keys
    return (import.meta as any)?.env?.[key];
  } catch {
    return undefined;
  }
}

function parseHeaderString(value: string | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const maybeJson = JSON.parse(value);

    if (maybeJson && typeof maybeJson === 'object') {
      return maybeJson as Record<string, string>;
    }
  } catch {}

  // Fallback: KEY=VAL;Key2=Val2
  const out: Record<string, string> = {};
  value
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const idx = pair.indexOf('=');

      if (idx > 0) {
        const k = pair.slice(0, idx).trim();
        const v = pair.slice(idx + 1).trim();
        out[k] = v;
      }
    });

  return Object.keys(out).length ? out : undefined;
}

function buildDefaultMcpConfigFromEnv(): MCPConfig {
  const servers: Record<string, any> = {};

  const ctx7Url = getEnv('VITE_MCP_CONTEXT7_SSE_URL');

  if (ctx7Url) {
    servers.context7 = {
      type: 'sse',
      url: ctx7Url,
      headers: parseHeaderString(getEnv('VITE_MCP_CONTEXT7_HEADERS')),
    };
  }

  const seqUrl = getEnv('VITE_MCP_SEQUENTIAL_SSE_URL') || getEnv('VITE_MCP_SEQUENTIALTHINKING_SSE_URL');

  if (seqUrl) {
    servers.sequentialthinking = {
      type: 'sse',
      url: seqUrl,
      headers: parseHeaderString(
        getEnv('VITE_MCP_SEQUENTIAL_HEADERS') || getEnv('VITE_MCP_SEQUENTIALTHINKING_HEADERS'),
      ),
    };
  }

  const dcUrl = getEnv('VITE_MCP_DESKTOPCOM_SSE_URL') || getEnv('VITE_MCP_DESKTOP_COMMANDER_SSE_URL');

  if (dcUrl) {
    servers.desktopcommander = {
      type: 'sse',
      url: dcUrl,
      headers: parseHeaderString(getEnv('VITE_MCP_DESKTOPCOM_HEADERS') || getEnv('VITE_MCP_DESKTOP_COMMANDER_HEADERS')),
    };
  }

  const exaUrl = getEnv('VITE_MCP_EXA_SSE_URL');

  if (exaUrl) {
    servers.exa = { type: 'sse', url: exaUrl, headers: parseHeaderString(getEnv('VITE_MCP_EXA_HEADERS')) };
  }

  return { mcpServers: servers } as MCPConfig;
}

const defaultSettings = {
  maxLLMSteps: 5,
  mcpConfig: buildDefaultMcpConfigFromEnv(),
} satisfies MCPSettings;

type Store = {
  isInitialized: boolean;
  settings: MCPSettings;
  serverTools: MCPServerTools;
  error: string | null;
  isUpdatingConfig: boolean;
};

type Actions = {
  initialize: () => Promise<void>;
  updateSettings: (settings: MCPSettings) => Promise<void>;
  checkServersAvailabilities: () => Promise<void>;
};

export const useMCPStore = create<Store & Actions>((set, get) => ({
  isInitialized: false,
  settings: defaultSettings,
  serverTools: {},
  error: null,
  isUpdatingConfig: false,
  initialize: async () => {
    if (get().isInitialized) {
      return;
    }

    if (isBrowser) {
      const savedConfig = localStorage.getItem(MCP_SETTINGS_KEY);

      if (savedConfig) {
        try {
          const settings = JSON.parse(savedConfig) as MCPSettings;
          const serverTools = await updateServerConfig(settings.mcpConfig);
          set(() => ({ settings, serverTools }));
        } catch (error) {
          console.error('Error parsing saved mcp config:', error);
          set(() => ({
            error: `Error parsing saved mcp config: ${error instanceof Error ? error.message : String(error)}`,
          }));
        }
      } else {
        // Initialize with defaults built from env if present
        try {
          const initial = { ...defaultSettings, mcpConfig: buildDefaultMcpConfigFromEnv() } as MCPSettings;
          const serverTools = await updateServerConfig(initial.mcpConfig);
          localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(initial));
          set(() => ({ settings: initial, serverTools }));
        } catch {
          // Persist anyway, but with empty toolset if server update fails
          localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(defaultSettings));
        }
      }
    }

    set(() => ({ isInitialized: true }));
  },
  updateSettings: async (newSettings: MCPSettings) => {
    if (get().isUpdatingConfig) {
      return;
    }

    try {
      set(() => ({ isUpdatingConfig: true }));

      const serverTools = await updateServerConfig(newSettings.mcpConfig);

      if (isBrowser) {
        localStorage.setItem(MCP_SETTINGS_KEY, JSON.stringify(newSettings));
      }

      set(() => ({ settings: newSettings, serverTools }));
    } catch (error) {
      throw error;
    } finally {
      set(() => ({ isUpdatingConfig: false }));
    }
  },
  checkServersAvailabilities: async () => {
    const response = await fetch('/api/mcp-check', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const serverTools = (await response.json()) as MCPServerTools;

    set(() => ({ serverTools }));
  },
}));

async function updateServerConfig(config: MCPConfig) {
  const response = await fetch('/api/mcp-update-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as MCPServerTools;

  return data;
}
