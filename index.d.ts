import type { Plugin } from "vite";

export interface SankhyaScreenMetadata {
  appName: string;
  controllerName: string;
  screenName: string;
  rootProjectName: string;
}

export interface AddonVitePluginOptions {
  /** Nome da tela Sankhya. */
  screenName: string;
  /** Diretório de saída do build. */
  outDir?: string;
  /** Substitui a tag #root por uma tag customizada durante a build. */
  customBuildTag?: (props: SankhyaScreenMetadata) => string;
}

/** Prepara uma aplicação Vite para publicação como addon HTML do Sankhya. */
export declare function addonVitePlugin(options: AddonVitePluginOptions): Plugin;

declare global {
  /** Nome da aplicação Sankhya gerada para a tela. */
  const __APP_NAME__: string;
  /** Nome do controller Sankhya gerado para a tela. */
  const __CONTROLLER_NAME__: string;
  /** Nome da tela Sankhya. */
  const __SCREEN_NAME__: string;
  /** Nome do projeto raiz Sankhya. */
  const __ROOT_PROJECT_NAME__: string;
}
