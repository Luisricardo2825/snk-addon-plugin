import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildEnvironmentOptions, Plugin, ResolvedConfig } from "vite";

export interface AddonVitePluginOptions {
  /** Nome da tela Sankhya. Também determina os nomes dos artefatos gerados. */
  screenName: string;
  /** Diretório de saída do build. Por padrão, usa vc/src/main/webapp/html5/<tela>. */
  outDir?: string;
  /** Substitui a tag #root por uma tag customizada durante a build. */
  customBuildTag?: (props: SankhyaScreenMetadata) => string;
}

export interface SankhyaScreenMetadata {
  appName: string;
  controllerName: string;
  screenName: string;
  rootProjectName: string;
}

export interface SankhyaJavaProject {
  projectDirectory: string;
  frontendDirectory: string;
  rootProjectName: string;
}

/**
 * Representação mínima exposta para evitar que tipos recursivos do Vite
 * sejam comparados ao montar a configuração do consumidor.
 */
export interface AddonVitePlugin {
  name: string;
}

declare global {
  /** Nome da aplicação Sankhya gerada para a tela. */
  var __APP_NAME__: string;
  /** Nome do controller Sankhya gerado para a tela. */
  var __CONTROLLER_NAME__: string;
  /** Nome da tela Sankhya. */
  var __SCREEN_NAME__: string;
  /** Nome do projeto raiz Sankhya. */
  var __ROOT_PROJECT_NAME__: string;
}

const PLUGIN_NAME = "snk-addon-plugin";
const LAUNCHER_DIRECTORY_NAME = "launcher";
const ROOT_PROJECT_NAME_PATTERN = /rootProject\.name\s*=\s*['"]([^'"]+)['"]/;
const pluginDirectory = path.dirname(fileURLToPath(import.meta.url));

/**
 * Prepara uma aplicação Vite para publicação como addon HTML do Sankhya.
 */
export function addonVitePlugin(
  options: AddonVitePluginOptions,
): AddonVitePlugin {
  validateOptions(options);

  const { screenName, customBuildTag } = options;
  const appName = `${screenName}App`;
  const controllerName = `${screenName}Controller`;
  let resolvedConfig: ResolvedConfig;
  let isBuild = false;
  let outputDirectory = options.outDir;
  let project: SankhyaJavaProject | undefined;
  let publicAssetPaths: string[] = [];

  function getMetadata(): SankhyaScreenMetadata {
    if (!project) {
      throw new Error(
        `${PLUGIN_NAME}: o projeto Java ainda não foi resolvido.`,
      );
    }

    const rootProjectName = project.rootProjectName.toLocaleLowerCase();
    const values = {
      appName,
      controllerName,
      screenName,
      rootProjectName,
    };

    return values;
  }

  function getOutputDirectory(): string {
    if (resolvedConfig?.build.outDir) return resolvedConfig.build.outDir;
    if (outputDirectory) return path.resolve(outputDirectory);
    throw new Error(`${PLUGIN_NAME}: diretório de saída não foi resolvido.`);
  }

  function transformHtml(html: string): string {
    const metadata = getMetadata();
    const htmlWithTokens = replaceTokens(html, metadata);

    if (!isBuild) return htmlWithTokens;

    const body = extractBody(htmlWithTokens);
    if (!customBuildTag) return body;

    return body.replace(
      /<([a-zA-Z][\w:-]*)([^>]*?)\sid=(["'])root\3([^>]*)><\/\1>/,
      customBuildTag(metadata),
    );
  }

  function rewritePublicAssetUrls(code: string): string {
    if (!isBuild || !project) return code;

    const basePath = `/${project.rootProjectName.toLocaleLowerCase()}/html5/${screenName}/`;
    return publicAssetPaths.reduce((transformedCode, assetPath) => {
      const escapedAssetPath = escapeRegExp(assetPath);
      const assetUrl = `${basePath}${assetPath}`;
      const expression = new RegExp(
        `(["'])/${escapedAssetPath}(?=([?#][^"']*)?\\1)`,
        "g",
      );
      return transformedCode.replace(
        expression,
        (_match, quote: string) => `${quote}${assetUrl}`,
      );
    }, code);
  }

  function createAngularCompatibilityBridge(): string {
    const dependencies = isBuild ? ["snk"] : [];
    return `;(()=>{const angular=window.angular;if(!angular)return;const appName=${JSON.stringify(appName)};const controllerName=${JSON.stringify(controllerName)};let module;try{module=angular.module(appName)}catch{module=angular.module(appName,${JSON.stringify(dependencies)})}module.controller(controllerName,[function(){}])})();\n`;
  }

  function resolveInputHtmlName(): string {
    const input = resolvedConfig.build.rolldownOptions?.input;

    if (!input) return "index.html";
    if (typeof input === "string") return path.basename(input);
    if (Array.isArray(input)) return path.basename(input[0] ?? "index.html");

    const firstInput = Object.values(input)[0];
    return typeof firstInput === "string"
      ? path.basename(firstInput)
      : "index.html";
  }

  function processHtml(outputDirectory: string): void {
    const inputHtmlPath = path.join(outputDirectory, resolveInputHtmlName());
    const outputHtmlPath = path.join(outputDirectory, `${screenName}.html`);

    if (!fs.existsSync(inputHtmlPath)) {
      resolvedConfig.logger.warn(
        `${PLUGIN_NAME}: HTML de entrada não encontrado: ${path.basename(inputHtmlPath)}.`,
      );
      return;
    }

    const html = fs.readFileSync(inputHtmlPath, "utf-8");
    fs.writeFileSync(outputHtmlPath, transformHtml(html), "utf-8");

    if (inputHtmlPath !== outputHtmlPath) fs.unlinkSync(inputHtmlPath);
    resolvedConfig.logger.info(
      `${PLUGIN_NAME}: HTML gerado em ${outputHtmlPath}.`,
    );
  }

  function processLauncher(
    outputDirectory: string,
    cssAssetPath: string | undefined,
  ): void {
    const launcherDirectory = path.join(
      outputDirectory,
      LAUNCHER_DIRECTORY_NAME,
    );

    if (!isDirectory(launcherDirectory)) {
      resolvedConfig.logger.warn(
        `${PLUGIN_NAME}: pasta launcher/ não encontrada no build.`,
      );
      return;
    }

    const files = listFilesRecursively(launcherDirectory);
    const renames = files.map((source) => ({
      source,
      destination: path.join(
        path.dirname(source),
        `${screenName}${path.extname(source)}`,
      ),
    }));
    validateLauncherRenames(renames);

    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const screenContent = content.replace(/{{SCREEN_NAME}}/g, screenName);
      const processedContent = replaceLauncherCssPath(
        screenContent,
        cssAssetPath,
      );
      fs.writeFileSync(file, processedContent, "utf-8");
    }

    for (const { source, destination } of renames)
      fs.renameSync(source, destination);
    resolvedConfig.logger.info(
      `${PLUGIN_NAME}: arquivos do launcher processados.`,
    );
  }

  function copyLauncherToPublic(publicDirectory: string): void {
    const source = path.join(pluginDirectory, LAUNCHER_DIRECTORY_NAME);
    const destination = path.join(publicDirectory, LAUNCHER_DIRECTORY_NAME);

    if (!isDirectory(source)) {
      throw new Error(
        `${PLUGIN_NAME}: pasta launcher/ não encontrada no pacote.`,
      );
    }

    const copiedFiles = copyMissingFiles(source, destination);
    resolvedConfig.logger.info(
      `${PLUGIN_NAME}: ${copiedFiles} arquivo(s) do launcher copiado(s) para ${destination}.`,
    );
  }

  const plugin: Plugin = {
    name: PLUGIN_NAME,

    config(config, environment) {
      isBuild = environment.command === "build";
      const viteRoot = path.resolve(config.root ?? process.cwd());
      project = findSankhyaJavaProject(viteRoot);
      outputDirectory ??= path.join(
        path.dirname(project.frontendDirectory),
        "webapp",
        "html5",
        screenName,
      );

      const metadata = getMetadata();
      const useLegacyRollupOptions =
        resolveConsumerViteMajorVersion(viteRoot) < 8 ||
        Boolean(config.build?.rollupOptions);
      const configuredBundlerOptions = useLegacyRollupOptions
        ? config.build?.rollupOptions
        : config.build?.rolldownOptions;
      const bundlerOptions: BuildEnvironmentOptions["rolldownOptions"] = {
        ...configuredBundlerOptions,
        output: {
          ...configuredBundlerOptions?.output,
          entryFileNames: `${screenName}.js`,
          chunkFileNames: `${screenName}.js`,
        },
      };
      const dedupe = new Set(config.resolve?.dedupe ?? []);
      dedupe.add("react");
      dedupe.add("react-dom");

      return {
        base: isBuild
          ? `/${metadata.rootProjectName}/html5/${screenName}/`
          : config.base,
        define: {
          ...config.define,
          __APP_NAME__: JSON.stringify(metadata.appName),
          __CONTROLLER_NAME__: JSON.stringify(metadata.controllerName),
          __SCREEN_NAME__: JSON.stringify(metadata.screenName),
          __ROOT_PROJECT_NAME__: JSON.stringify(metadata.rootProjectName),
        },
        resolve: {
          ...config.resolve,
          dedupe: [...dedupe],
        },
        build: {
          outDir: outputDirectory,
          emptyOutDir: true,
          minify: "esbuild",
          reportCompressedSize: true,
          ...(useLegacyRollupOptions
            ? { rollupOptions: bundlerOptions }
            : { rolldownOptions: bundlerOptions }),
        },
      };
    },

    configResolved(config) {
      resolvedConfig = config;
      if (!config.publicDir) {
        throw new Error(`${PLUGIN_NAME}: publicDir não pode ser desabilitado.`);
      }
      publicAssetPaths = listPublicAssetPaths(config.publicDir);
      copyLauncherToPublic(config.publicDir);
    },

    enforce: "pre",

    transform(code, id) {
      if (!/\.[cm]?[jt]sx?(?:\?.*)?$/i.test(id)) return null;

      const transformedCode = rewritePublicAssetUrls(code);
      return transformedCode === code
        ? null
        : { code: transformedCode, map: null };
    },

    renderChunk(code, chunk) {
      if (!chunk.isEntry) return null;

      return {
        code: `${createAngularCompatibilityBridge()}${code}`,
        map: null,
      };
    },

    transformIndexHtml(html) {
      return transformHtml(html);
    },

    closeBundle() {
      if (!isBuild) return;

      const outputDirectory = getOutputDirectory();
      if (!isDirectory(outputDirectory)) {
        resolvedConfig.logger.warn(
          `${PLUGIN_NAME}: pasta de saída não encontrada.`,
        );
        return;
      }

      const cssAssetPath = findGeneratedCssAssetPath(
        outputDirectory,
        screenName,
      );
      processHtml(outputDirectory);
      processLauncher(outputDirectory, cssAssetPath);
    },
  };

  return plugin;
}

export default addonVitePlugin;

function validateOptions(options: AddonVitePluginOptions): void {
  if (!options.screenName?.trim()) {
    throw new Error(`${PLUGIN_NAME}: screenName é obrigatório.`);
  }

  if (/[\\/]/.test(options.screenName)) {
    throw new Error(`${PLUGIN_NAME}: screenName não pode conter barras.`);
  }
}

function resolveConsumerViteMajorVersion(viteRoot: string | undefined): number {
  if (!viteRoot) return 8;

  try {
    const requireFromConsumer = createRequire(path.join(viteRoot, "package.json"));
    const vitePackagePath = requireFromConsumer.resolve("vite/package.json");
    const vitePackage = JSON.parse(fs.readFileSync(vitePackagePath, "utf-8")) as {
      version?: string;
    };
    return Number.parseInt(vitePackage.version ?? "8", 10);
  } catch {
    return 8;
  }
}

function findSankhyaJavaProject(viteRoot: string): SankhyaJavaProject {
  let projectDirectory = viteRoot;

  while (true) {
    const vcDirectory = path.join(projectDirectory, "vc");
    const sourceMainDirectory = path.join(vcDirectory, "src", "main");

    if (
      isSankhyaJavaProject(projectDirectory, vcDirectory, sourceMainDirectory)
    ) {
      if (!isPathInside(viteRoot, sourceMainDirectory)) {
        throw new Error(
          `${PLUGIN_NAME}: a raiz Vite deve estar em ${sourceMainDirectory}/<pasta-front-end> ou em um subdiretório. Raiz atual: ${viteRoot}.`,
        );
      }

      const relativeFrontendPath = path.relative(sourceMainDirectory, viteRoot);
      const frontendDirectoryName = relativeFrontendPath.split(path.sep)[0];
      if (!frontendDirectoryName) {
        throw new Error(
          `${PLUGIN_NAME}: a raiz Vite deve estar dentro de uma pasta em ${sourceMainDirectory}.`,
        );
      }

      const settingsPath = path.join(projectDirectory, "settings.gradle");
      const rootProjectName = readRootProjectName(settingsPath);
      return {
        projectDirectory,
        frontendDirectory: path.join(
          sourceMainDirectory,
          frontendDirectoryName,
        ),
        rootProjectName,
      };
    }

    const parentDirectory = path.dirname(projectDirectory);
    if (parentDirectory === projectDirectory) break;
    projectDirectory = parentDirectory;
  }

  throw new Error(
    `${PLUGIN_NAME}: projeto Java Sankhya não encontrado a partir de ${viteRoot}. Esperado: <projeto>/vc/src/main/<pasta-front-end>, vc/build.gradle, build.gradle e settings.gradle.`,
  );
}

function isSankhyaJavaProject(
  projectDirectory: string,
  vcDirectory: string,
  sourceMainDirectory: string,
): boolean {
  return (
    fs.existsSync(path.join(projectDirectory, "build.gradle")) &&
    fs.existsSync(path.join(projectDirectory, "settings.gradle")) &&
    fs.existsSync(path.join(vcDirectory, "build.gradle")) &&
    isDirectory(sourceMainDirectory)
  );
}

function readRootProjectName(settingsPath: string): string {
  const settings = fs.readFileSync(settingsPath, "utf-8");
  const rootProjectName = settings
    .match(ROOT_PROJECT_NAME_PATTERN)?.[1]
    ?.trim();

  if (!rootProjectName) {
    throw new Error(
      `${PLUGIN_NAME}: rootProject.name não encontrado em ${settingsPath}.`,
    );
  }

  return rootProjectName;
}

function replaceTokens(html: string, metadata: SankhyaScreenMetadata): string {
  return html
    .replace(/%__APP_NAME__%/g, metadata.appName)
    .replace(/%__CONTROLLER_NAME__%/g, metadata.controllerName)
    .replace(/%__SCREEN_NAME__%/g, metadata.screenName)
    .replace(/%__ROOT_PROJECT_NAME__%/g, metadata.rootProjectName);
}

function extractBody(html: string): string {
  return (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html).trim();
}

function isDirectory(directory: string): boolean {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function listFilesRecursively(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFilesRecursively(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

function listPublicAssetPaths(publicDirectory: string): string[] {
  if (!isDirectory(publicDirectory)) return [];

  return listFilesRecursively(publicDirectory)
    .map((file) =>
      path.relative(publicDirectory, file).split(path.sep).join("/"),
    )
    .sort((left, right) => right.length - left.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function copyMissingFiles(
  sourceDirectory: string,
  destinationDirectory: string,
): number {
  fs.mkdirSync(destinationDirectory, { recursive: true });
  let copiedFiles = 0;

  for (const entry of fs.readdirSync(sourceDirectory, {
    withFileTypes: true,
  })) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);

    if (entry.isDirectory()) {
      copiedFiles += copyMissingFiles(sourcePath, destinationPath);
    } else if (entry.isFile() && !fs.existsSync(destinationPath)) {
      fs.copyFileSync(sourcePath, destinationPath);
      copiedFiles += 1;
    }
  }

  return copiedFiles;
}

function findGeneratedCssAssetPath(
  outputDirectory: string,
  screenName: string,
): string | undefined {
  const cssFiles = listFilesRecursively(outputDirectory).filter(
    (file) => path.extname(file).toLowerCase() === ".css",
  );
  if (cssFiles.length === 0) return undefined;

  const inputHtmlPath = path.join(outputDirectory, "index.html");
  if (fs.existsSync(inputHtmlPath)) {
    const html = fs.readFileSync(inputHtmlPath, "utf-8");
    const cssHrefs = Array.from(
      html.matchAll(/\bhref=(['"])([^'"]+\.css(?:[?#][^'"]*)?)\1/gi),
      (match) => match[2]?.split(/[?#]/, 1)[0],
    );
    const linkedCssFile = cssFiles.find((file) => {
      const relativePath = path
        .relative(outputDirectory, file)
        .split(path.sep)
        .join("/");
      return cssHrefs.some(
        (href) => href?.endsWith(`/${relativePath}`) || href === relativePath,
      );
    });
    if (linkedCssFile) {
      return toSankhyaHtml5Path(outputDirectory, screenName, linkedCssFile);
    }
  }

  if (cssFiles.length === 1) {
    return toSankhyaHtml5Path(outputDirectory, screenName, cssFiles[0]!);
  }
  return undefined;
}

function toSankhyaHtml5Path(
  outputDirectory: string,
  screenName: string,
  assetPath: string,
): string {
  return `html5/${screenName}/${path
    .relative(outputDirectory, assetPath)
    .split(path.sep)
    .join("/")}`;
}

function replaceLauncherCssPath(
  content: string,
  cssAssetPath: string | undefined,
): string {
  if (!cssAssetPath) {
    return content.replace(
      /\s*<link\b[^>]*\bhref=["'][^"']*(?:\.css|{{CSS_PATH}})[^"']*["'][^>]*>\s*(?:<\/link>)?/i,
      "",
    );
  }

  if (content.includes("{{CSS_PATH}}")) {
    return content.replace(/{{CSS_PATH}}/g, cssAssetPath);
  }

  return content.replace(
    /(\bhref=["'])[^"']+\.css(?:[?#][^"']*)?(["'])/i,
    `$1${cssAssetPath}$2`,
  );
}

function validateLauncherRenames(
  renames: Array<{ source: string; destination: string }>,
): void {
  const destinations = new Set<string>();

  for (const { source, destination } of renames) {
    if (
      destinations.has(destination) ||
      (source !== destination && fs.existsSync(destination))
    ) {
      throw new Error(
        `${PLUGIN_NAME}: conflito ao renomear o arquivo do launcher para ${destination}.`,
      );
    }
    destinations.add(destination);
  }
}
