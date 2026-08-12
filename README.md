# snk-addon-plugin

O plugin disponibiliza as constantes Sankhya no código da aplicação e para o
TypeScript:

```ts
console.log(__APP_NAME__, __CONTROLLER_NAME__);
console.log(__SCREEN_NAME__, __ROOT_PROJECT_NAME__);
```

Elas são declaradas como `string` globalmente pelo pacote e substituídas pelo
Vite durante a execução/build. Basta importar e usar o plugin na configuração:

```ts
import { defineConfig } from "vite";
import { addonVitePlugin } from "snk-addon-plugin";

export default defineConfig({
  plugins: [addonVitePlugin({ screenName: "MinhaTela" })],
});
```

Ao desenvolver o plugin localmente, não importe a pasta diretamente. Em vez de
`import ... from "C:/.../addon-plugin"`, importe o arquivo de entrada:

```ts
import { addonVitePlugin } from "C:/.../addon-plugin/index.ts";
```

Após instalar/publicar o pacote, prefira sempre `import { addonVitePlugin } from
"snk-addon-plugin"`. Isso elimina o aviso do carregador nativo de configuração
do Vite sobre resolução de diretório para `index`.

Na inicialização, o plugin copia seu diretório `launcher` para
`public/launcher`. Durante o build, cada ocorrência de `{{SCREEN_NAME}}` nesses
arquivos é substituída pelo nome da tela e os arquivos são renomeados para ela.

O `root` do Vite deve estar em `/<projeto-java>/vc/src/main/<pasta-front-end>`
(ou em um subdiretório). Essa pasta não precisa ter o mesmo nome de
`screenName`. O plugin valida a existência de `build.gradle` e
`settings.gradle` no projeto Java, além de `vc/build.gradle`, e lê
`rootProject.name` do `settings.gradle` para compor `__ROOT_PROJECT_NAME__` e a
base da aplicação.

Se o projeto usa um `tsconfig` separado para a aplicação e ele não inclui o
`vite.config.ts`, inclua o pacote em `compilerOptions.types` desse `tsconfig`:

```json
{ "compilerOptions": { "types": ["snk-addon-plugin"] } }
```

## React

O subpath `snk-addon-plugin/react` registra o módulo/controller AngularJS,
monta o React no `#root` e desmonta a aplicação quando a tela é fechada. React
e ReactDOM são dependências de pares do pacote.

```tsx
import { startSankhyaReactAddon } from "snk-addon-plugin/react";
import App from "./App";
import "./index.css";

startSankhyaReactAddon(App);
```

Para usar React sem código AngularJS e sem acessar o documento/iframe, use
`mountSankhyaAddon`. O plugin cria o módulo AngularJS mínimo exigido pelo
Sankhya e esta função aguarda o `#root` ser inserido na tela.

```tsx
import { createRoot } from "react-dom/client";
import { mountSankhyaAddon } from "snk-addon-plugin/react";
import App from "./App";
import "./index.css";

mountSankhyaAddon((root) => {
  const reactRoot = createRoot(root);
  reactRoot.render(<App />);
  return () => reactRoot.unmount();
});
```

Para expor ações do `$scope` ao React, defina-as uma vez e consuma-as com o
hook fornecido:

```tsx
import {
  startSankhyaReactAddon,
  useSankhyaActions,
} from "snk-addon-plugin/react";

type Actions = { salvar(): void };
type Scope = { salvar(): void };

startSankhyaReactAddon<Actions, Scope>(App, {
  createActions: (scope) => ({
    salvar: () => scope.salvar(),
  }),
});

function SalvarButton() {
  const { salvar } = useSankhyaActions<Actions>();
  return <button onClick={salvar}>Salvar</button>;
}
```

Use `removeBootstrap: true` apenas quando for necessário remover referências
Bootstrap do documento do addon.

## Publicação no NPM

```bash
bun install --frozen-lockfile
bun run build
bun test
npm publish
```

Antes da primeira publicação, confirme que o nome `snk-addon-plugin` está
disponível no NPM e substitua `"license": "UNLICENSED"` no `package.json` pela
licença escolhida para o pacote.

Quando `outDir` não é informado, o build é enviado automaticamente para
`vc/src/main/webapp/html5/<tela>`. O valor de `rootProject.name` é preservado
exatamente como definido no Gradle.
