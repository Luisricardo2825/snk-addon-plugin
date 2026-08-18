# snk-addon-plugin

Plugin Vite para gerar addons HTML compatíveis com Sankhya a partir de projetos
React, Vue, Svelte ou JavaScript puro.

Ele prepara os artefatos em `vc/src/main/webapp/html5/<tela>`, cria o módulo
AngularJS mínimo exigido pelo Sankhya e disponibiliza um container seguro para
montar qualquer framework.

## Instalação e configuração

```bash
yarn add -D snk-addon-plugin
```

Use o plugin no `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import { addonVitePlugin } from "snk-addon-plugin";

export default defineConfig({
  plugins: [addonVitePlugin({ screenName: "MinhaTela" })],
});
```

O `root` do Vite deve estar em
`<projeto-java>/vc/src/main/<pasta-front-end>` ou em um subdiretório. A pasta
do front-end não precisa ter o mesmo nome de `screenName`.

Durante o build, o plugin usa `rootProject.name` de `settings.gradle` para
definir a base dos assets e escreve a saída em
`vc/src/main/webapp/html5/<screenName>` quando `outDir` não é informado.

## Desenvolvimento no Sankhya com HMR

Ative `development` para gerar uma versão da tela que o Sankhya carrega
localmente, mas cuja aplicação é obtida do Vite Dev Server. Dessa forma, as
alterações em `src/` são atualizadas por HMR sem executar uma nova build ou um
novo deploy a cada edição.

```ts
import { defineConfig } from "vite";
import { addonVitePlugin } from "snk-addon-plugin";

export default defineConfig({
  plugins: [
    addonVitePlugin({
      screenName: "MinhaTela",
      development: true,
    }),
  ],
});
```

Não é necessário adicionar um bloco `server` ao `vite.config.ts`. O plugin
configura CORS para `http://localhost:8080`, onde o Sankhya costuma estar
disponível localmente. Sem informar uma porta, ele deixa o Vite usar a porta
disponível (5173, 5174, etc.) e gera o launcher com a URL efetivamente usada.
Ao executar `vite` ou `yarn dev`, ele gera em
`webapp/html5/MinhaTela/`:

```text
MinhaTela.html     # conteúdo da tela
MinhaTela.js       # carrega @vite/client e /src/main.* pelo Vite
launcher/          # launcher Sankhya sem CSS estático
```

Faça o deploy desses arquivos uma vez, mantenha `yarn dev` em execução e abra
a tela no Sankhya. O HMR permanece ativo enquanto o servidor Vite estiver em
execução. Para produzir a versão estática de entrega, use `yarn build`.

O JavaScript e o HMR são carregados do Vite, mas imagens, fontes e SVGs são
espelhados em `webapp/html5/<tela>` e recebem URLs da própria origem Sankhya.
Isso evita bloqueios de segurança do frame Sankhya, especialmente para SVGs
referenciados com `<use>`. Não é necessário transformar SVGs em conteúdo inline.

Quando o entrypoint não puder ser identificado no `index.html`, ou quando o
Sankhya estiver em outra origem, informe as opções necessárias:

```ts
addonVitePlugin({
  screenName: "MinhaTela",
  development: {
    entry: "/src/main.tsx",
      port: 5173, // fixa a porta; falha ao iniciar se ela estiver ocupada
    serverUrl: "http://localhost:5173",
    sankhyaOrigin: "http://localhost:8080",
  },
});
```

Para acessar o Vite de outra máquina, informe uma `serverUrl` alcançável pelo
navegador que abre o Sankhya e ajuste `sankhyaOrigin`. Não publique ou faça
deploy da versão de desenvolvimento em produção.

## Montagem agnóstica de framework

`mountSankhyaAddon` recebe o elemento `#root` correto — inclusive quando a tela
está dentro de um iframe — e executa a limpeza ao fechar a tela. Use-o para Vue,
Svelte, React ou qualquer biblioteca com ciclo de montagem.

```ts
import { mountSankhyaAddon } from "snk-addon-plugin/utils";

mountSankhyaAddon((root) => {
  // monte a aplicação em root
  return () => {
    // desmonte a aplicação, se necessário
  };
});
```

Não use `document.getElementById("app")` nem suponha que o documento global é
o documento da tela Sankhya: use sempre o elemento `root` recebido no callback.

## React

Para uma inicialização simples:

```tsx
import { startSankhyaReactAddon } from "snk-addon-plugin/react";
import App from "./App";
import "./index.css";

startSankhyaReactAddon(App);
```

Ou use a API agnóstica:

```tsx
import { createRoot } from "react-dom/client";
import { mountSankhyaAddon } from "snk-addon-plugin/utils";
import App from "./App";
import "./index.css";

mountSankhyaAddon((root) => {
  const reactRoot = createRoot(root);
  reactRoot.render(<App />);

  return () => reactRoot.unmount();
});
```

Para expor ações do `$scope` ao React:

```tsx
import {
  startSankhyaReactAddon,
  useSankhyaActions,
} from "snk-addon-plugin/react";

type Actions = { salvar(): void };
type Scope = { salvar(): void };

startSankhyaReactAddon<Actions, Scope>(App, {
  createActions: (scope) => ({ salvar: () => scope.salvar() }),
});

function SalvarButton() {
  const { salvar } = useSankhyaActions<Actions>();
  return <button onClick={salvar}>Salvar</button>;
}
```

## Vue

```ts
import { createApp } from "vue";
import { mountSankhyaAddon } from "snk-addon-plugin/utils";
import App from "./App.vue";
import "./style.css";

mountSankhyaAddon((root) => {
  const app = createApp(App);
  app.mount(root);

  return () => app.unmount();
});
```

## Svelte

```ts
import { mount, unmount } from "svelte";
import { mountSankhyaAddon } from "snk-addon-plugin/utils";
import App from "./App.svelte";
import "./app.css";

mountSankhyaAddon((root) => {
  const app = mount(App, { target: root });

  return () => unmount(app);
});
```

Não é necessário fazer `export default app`: o bundle é executado pelo
Sankhya, não importado por outro módulo.

## Constantes Sankhya

O plugin declara e substitui estas constantes globais durante o build:

```ts
console.log(__APP_NAME__);
console.log(__CONTROLLER_NAME__);
console.log(__SCREEN_NAME__);
console.log(__ROOT_PROJECT_NAME__);
```

Se o `tsconfig` da aplicação não inclui o `vite.config.ts`, adicione o pacote
em `compilerOptions.types`:

```json
{ "compilerOptions": { "types": ["snk-addon-plugin"] } }
```

## Desenvolvimento local

Para trabalhar no plugin sem publicá-lo, importe explicitamente o entrypoint:

```ts
import { addonVitePlugin } from "C:/.../addon-plugin/src/index.ts";
```

Após instalar ou publicar o pacote, use `snk-addon-plugin` normalmente.

## Licença

[MIT](./LICENSE)

## Publicação

```bash
bun install --frozen-lockfile
bun run build
bun test
npm pack --dry-run
npm publish --access public
```
