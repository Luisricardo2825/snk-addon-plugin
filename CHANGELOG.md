# Changelog

## 0.6.0 - 2026-08-18

- Adiciona suporte ao modo de desenvolvimento com Vite HMR para telas Sankhya.
- Adiciona o entrypoint `snk-addon-plugin/utils` para montagem independente de framework.
- Torna React e React DOM pares opcionais, permitindo uso com Vue, Svelte e JavaScript puro.
- Organiza os fontes em `src/` e publica declarações de tipo para todos os entrypoints.
- Preserva HTML completo durante build para localizar CSS principal, mesmo com chunks CSS dinâmicos.
- Usa assetsInclude do Vite para identificar assets no launcher de desenvolvimento.
- Inclui a licença MIT e atualiza a documentação de instalação e uso.
