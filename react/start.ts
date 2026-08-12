import {
  StrictMode,
  createElement,
  type ComponentType,
  type ReactNode,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { actionsContext, createActionsProxy } from "./actions";
import { getAddonDocument, removeBootstrapAssets } from "./document";
import { isDevelopmentEnvironment } from "./environment";
import type {
  SankhyaActions,
  SankhyaReactAddonOptions,
  SankhyaScope,
} from "./types";

/** Inicia um addon React dentro do ciclo de vida AngularJS do Sankhya. */
export function startSankhyaReactAddon<
  Actions extends SankhyaActions = SankhyaActions,
  Scope extends Record<string, unknown> = Record<string, unknown>,
>(
  App: ComponentType,
  options: SankhyaReactAddonOptions<Actions, Scope> = {},
): void {
  const {
    angularDependencies = isDevelopmentEnvironment() ? [] : ["snk"],
    createActions = createActionsProxy as unknown as (
      scope: SankhyaScope<Scope>,
    ) => Actions,
    removeBootstrap = false,
    rootId = "root",
    strictMode = true,
  } = options;

  if (!window.angular) {
    throw new Error(
      "snk-addon-plugin/react: window.angular não está disponível.",
    );
  }

  const module = window.angular.module(__APP_NAME__, angularDependencies);
  module.controller(__CONTROLLER_NAME__, ["$scope", ($scope) => {
    let root: Root | undefined;

    const document = getAddonDocument();
    const container = document.getElementById(rootId);
    if (!container) {
      throw new Error(
        `snk-addon-plugin/react: elemento #${rootId} não encontrado.`,
      );
    }

    if (removeBootstrap) removeBootstrapAssets(document);
    const tree: ReactNode = createElement(
      actionsContext.Provider,
      { value: createActions($scope as SankhyaScope<Scope>) },
      createElement(App),
    );
    root = createRoot(container);
    root.render(strictMode ? createElement(StrictMode, null, tree) : tree);

    $scope.$on("$destroy", () => root?.unmount());
  }]);
}
