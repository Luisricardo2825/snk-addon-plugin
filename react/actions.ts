import { createContext, useContext } from "react";
import type { SankhyaActions, SankhyaScope } from "./types";

export const actionsContext = createContext<SankhyaActions | undefined>(
  undefined,
);

/** Retorna as ações AngularJS expostas pelo addon atual. */
export function useSankhyaActions<Actions extends SankhyaActions>(): Actions {
  const actions = useContext(actionsContext);
  if (!actions) {
    throw new Error(
      "useSankhyaActions deve ser usado dentro de startSankhyaReactAddon.",
    );
  }
  return actions as Actions;
}

export function createActionsProxy(scope: SankhyaScope): SankhyaActions {
  const angularInternals = new Set([
    "$watch",
    "$apply",
    "$eval",
    "$digest",
    "$destroy",
    "$on",
    "$off",
  ]);

  return new Proxy({} as SankhyaActions, {
    get(_target, property: string) {
      const value = scope[property];
      if (typeof value !== "function" || angularInternals.has(property)) {
        throw new Error(`Ação Sankhya \"${property}\" não existe no $scope.`);
      }

      return (...args: never[]) => {
        const result = value.apply(scope, args);
        scope.$applyAsync();
        return result;
      };
    },
  });
}
