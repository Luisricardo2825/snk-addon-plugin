import { getAddonDocument } from "./document";
import type { SankhyaMountOptions } from "./types";

export type SankhyaMount = (root: HTMLElement) => void | (() => void);

/**
 * Executa a montagem quando o Sankhya inserir o root da tela no documento.
 * A limpeza retornada é executada quando esse root for removido.
 */
export function mountSankhyaAddon(
  mount: SankhyaMount,
  options: SankhyaMountOptions = {},
): void {
  const { rootId = "root" } = options;
  const document = getAddonDocument();
  let root: HTMLElement | null = null;
  let cleanup: (() => void) | undefined;
  let mounted = false;

  const tryMount = () => {
    if (mounted) return;

    const container = document.getElementById(rootId);
    if (!(container instanceof HTMLElement)) return;

    mounted = true;
    root = container;
    cleanup = mount(container) ?? undefined;
  };

  const observer = new MutationObserver(() => {
    tryMount();
    if (!root || root.isConnected) return;

    observer.disconnect();
    cleanup?.();
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  tryMount();
}
