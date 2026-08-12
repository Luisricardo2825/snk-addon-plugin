export type SankhyaActions = Record<string, (...args: any[]) => unknown>;

export type SankhyaScope<T = Record<string, unknown>> = {
  $applyAsync(): void;
  $destroy(): void;
  $on(event: "$destroy", listener: () => void): void;
  [key: string]: unknown;
} & T;

export interface SankhyaReactAddonOptions<
  Actions extends SankhyaActions,
  Scope extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Dependências do módulo AngularJS em produção. */
  angularDependencies?: string[];
  /** Recebe o $scope do Sankhya e retorna as ações expostas para o React. */
  createActions?: (scope: SankhyaScope<Scope>) => Actions;
  /** Id do elemento que receberá a aplicação React. @default "root" */
  rootId?: string;
  /** Envolve a árvore em React.StrictMode. @default true */
  strictMode?: boolean;
  /** Remove referências a Bootstrap do documento antes da montagem. */
  removeBootstrap?: boolean;
}

export interface SankhyaMountOptions {
  /** Id do elemento que receberá a aplicação. @default "root" */
  rootId?: string;
}

export interface AngularModule {
  controller(
    name: string,
    definition: ["$scope", (scope: SankhyaScope) => void],
  ): AngularModule;
}

export interface AngularStatic {
  module(name: string, dependencies?: string[]): AngularModule;
}

declare global {
  var __APP_NAME__: string;
  var __CONTROLLER_NAME__: string;

  interface Window {
    angular: AngularStatic;
  }
}
