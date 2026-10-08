import { useCallback, useState } from "react";
import { DEFAULT_HUB_ENDPOINT, validateHubEndpoint } from "../../domain/api";
import { browserStorage } from "../../lib/storage";

const STORAGE_ENDPOINT_KEY = "biofeedback-dashboard.endpoint";
const STORAGE_TOKEN_KEY = "biofeedback-dashboard.token";

export interface HubSettingsValue {
  endpoint: string;
  token: string;
}

export interface HubSettings extends HubSettingsValue {
  /** Aplica e persiste a configuração. O chamador valida o endpoint antes. */
  apply: (next: HubSettingsValue) => void;
}

function loadSettings(): HubSettingsValue {
  // Um endpoint inválido salvo por engano não pode impedir o dashboard de abrir.
  const stored = validateHubEndpoint(browserStorage.getItem(STORAGE_ENDPOINT_KEY) ?? DEFAULT_HUB_ENDPOINT);
  return {
    endpoint: stored.ok ? stored.endpoint : DEFAULT_HUB_ENDPOINT,
    token: browserStorage.getItem(STORAGE_TOKEN_KEY) ?? "",
  };
}

/** Endereço e token do hub, salvos apenas no localStorage deste navegador. */
export function useHubSettings(): HubSettings {
  const [settings, setSettings] = useState<HubSettingsValue>(loadSettings);

  const apply = useCallback((next: HubSettingsValue) => {
    browserStorage.setItem(STORAGE_ENDPOINT_KEY, next.endpoint);
    browserStorage.setItem(STORAGE_TOKEN_KEY, next.token);
    setSettings(next);
  }, []);

  return { ...settings, apply };
}
