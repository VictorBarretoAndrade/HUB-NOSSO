/** Contrato mínimo de armazenamento usado pelos módulos de persistência do domínio. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * localStorage tolerante a falhas: navegação privada, cota excedida ou storage
 * bloqueado não podem derrubar o dashboard no meio de uma sessão.
 */
export const browserStorage: KeyValueStorage = {
  getItem(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Sem persistência disponível: o estado segue apenas em memória.
    }
  },
  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Idem.
    }
  },
};
