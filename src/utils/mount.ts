import { getAddonDocument } from "./document";

export interface SankhyaMountOptions {
  /** Id do elemento que receberá a aplicação. @default "root" */
  rootId?: string;
}

export type SankhyaMount = (root: HTMLElement) => void | (() => void);

/**
 * Executa a montagem quando o Sankhya inserir o root da tela no documento.
 * A limpeza retornada é executada quando esse root for removido.
 */
export function mountSankhyaAddon(
  mount: SankhyaMount,
  options?: SankhyaMountOptions | string,
): void {
  let rootId = "root";
  if (typeof options === "string") rootId = options;
  else if (options?.rootId) rootId = options.rootId;

  const document = getAddonDocument();
  let root: HTMLElement | null = null;
  let cleanup: (() => void) | undefined;
  let mounted = false;

  const tryMount = () => {
    if (mounted) return;

    const container = document.getElementById(rootId);
    // `instanceof HTMLElement` falha quando o root pertence a outro iframe,
    // pois cada janela possui seu próprio construtor HTMLElement.
    if (!container || container.nodeType !== 1) return;

    mounted = true;
    root = container as HTMLElement;
    cleanup = mount(root) ?? undefined;
  };

  const observer = new MutationObserver(() => {
    tryMount();
    if (!root || root.isConnected) return;

    observer.disconnect();
    cleanup?.();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  tryMount();
}
