import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Plugin, UserConfig } from "vite";
import { addonVitePlugin } from "../index";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("addonVitePlugin", () => {
  test("rejects an empty screen name", () => {
    expect(() => addonVitePlugin({ screenName: "  " })).toThrow("screenName");
  });

  test("rejects a screen name containing a path separator", () => {
    expect(() => addonVitePlugin({ screenName: "screen/name" })).toThrow("barras");
  });

  test("detects the Java project when the frontend folder differs from the screen name", () => {
    const fixture = createJavaProject("MinhaTela", "ProjetoRaiz", "template-react-ts");
    const plugin = addonVitePlugin({ screenName: "MinhaTela" });
    const config = runConfig(plugin, fixture.screenDirectory);

    expect(config.base).toBe("/ProjetoRaiz/html5/MinhaTela/");
    expect(config.define).toMatchObject({
      __APP_NAME__: JSON.stringify("MinhaTelaApp"),
      __CONTROLLER_NAME__: JSON.stringify("MinhaTelaController"),
      __SCREEN_NAME__: JSON.stringify("MinhaTela"),
      __ROOT_PROJECT_NAME__: JSON.stringify("ProjetoRaiz"),
    });
    expect(config.build?.outDir).toBe(
      path.join(fixture.projectDirectory, "vc", "src", "main", "webapp", "html5", "MinhaTela"),
    );
  });

  test("fails when the Vite root is not inside a Sankhya Java screen", () => {
    const root = createTemporaryDirectory();
    const plugin = addonVitePlugin({ screenName: "MinhaTela" });

    expect(() => runConfig(plugin, root)).toThrow("projeto Java Sankhya");
  });

  test("does not mix rollupOptions and rolldownOptions", () => {
    const fixture = createJavaProject("MinhaTela", "ProjetoRaiz");
    const plugin = addonVitePlugin({ screenName: "MinhaTela" });
    const config = runConfig(plugin, fixture.screenDirectory, {
      build: { rollupOptions: { output: { sourcemap: true } } },
    });

    expect(config.build?.rollupOptions).toMatchObject({
      output: { entryFileNames: "MinhaTela.js", sourcemap: true },
    });
    expect(config.build?.rolldownOptions).toBeUndefined();
  });

  test("copies and processes launcher files and HTML during build", () => {
    const fixture = createJavaProject("MinhaTela", "ProjetoRaiz");
    const outputDirectory = path.join(fixture.projectDirectory, "output");
    const plugin = addonVitePlugin({ screenName: "MinhaTela", outDir: outputDirectory });

    runConfig(plugin, fixture.screenDirectory);
    runConfigResolved(plugin, outputDirectory);
    fs.writeFileSync(
      path.join(outputDirectory, "index.html"),
      '<html><body><div id="root"></div></body></html>',
      "utf-8",
    );

    getHookHandler(plugin.closeBundle)?.call({} as never);

    expect(fs.readFileSync(path.join(outputDirectory, "MinhaTela.html"), "utf-8")).toBe(
      '<div id="root"></div>',
    );
    expect(fs.existsSync(path.join(outputDirectory, "index.html"))).toBeFalse();
    expect(fs.existsSync(path.join(outputDirectory, "launcher", "MinhaTela.body"))).toBeTrue();
    expect(fs.readFileSync(path.join(outputDirectory, "launcher", "MinhaTela.include"), "utf-8")).toContain(
      "html5/MinhaTela/MinhaTela.css",
    );
  });

  test("preserves existing launcher files while copying missing files", () => {
    const fixture = createJavaProject("MinhaTela", "ProjetoRaiz");
    const publicDirectory = path.join(fixture.projectDirectory, "public");
    const existingInclude = path.join(publicDirectory, "launcher", "Include.include");
    fs.mkdirSync(path.dirname(existingInclude), { recursive: true });
    fs.writeFileSync(existingInclude, "customized launcher", "utf-8");

    const plugin = addonVitePlugin({ screenName: "MinhaTela" });
    runConfig(plugin, fixture.screenDirectory);
    runConfigResolved(plugin, publicDirectory);

    expect(fs.readFileSync(existingInclude, "utf-8")).toBe("customized launcher");
    expect(fs.existsSync(path.join(publicDirectory, "launcher", "Body.body"))).toBeTrue();
  });

  test("uses customBuildTag when provided", () => {
    const fixture = createJavaProject("MinhaTela", "ProjetoRaiz");
    const outputDirectory = path.join(fixture.projectDirectory, "output");
    const plugin = addonVitePlugin({
      screenName: "MinhaTela",
      outDir: outputDirectory,
      customBuildTag: ({ appName, rootProjectName }) =>
        `<sankhya-screen app="${appName}" project="${rootProjectName}"></sankhya-screen>`,
    });

    runConfig(plugin, fixture.screenDirectory);
    runConfigResolved(plugin, outputDirectory);

    const transformIndexHtml = getHookHandler(plugin.transformIndexHtml);
    const transformedHtml = transformIndexHtml?.call(
      {} as never,
      '<body><div id="root"></div></body>',
      {} as never,
    );

    expect(transformedHtml).toBe(
      '<sankhya-screen app="MinhaTelaApp" project="ProjetoRaiz"></sankhya-screen>',
    );
  });
});

function createJavaProject(
  screenName: string,
  rootProjectName: string,
  frontendDirectoryName = screenName,
) {
  const projectDirectory = createTemporaryDirectory();
  const screenDirectory = path.join(
    projectDirectory,
    "vc",
    "src",
    "main",
    frontendDirectoryName,
  );

  fs.mkdirSync(screenDirectory, { recursive: true });
  fs.writeFileSync(path.join(projectDirectory, "build.gradle"), "", "utf-8");
  fs.writeFileSync(
    path.join(projectDirectory, "settings.gradle"),
    `rootProject.name = '${rootProjectName}'`,
    "utf-8",
  );
  fs.writeFileSync(path.join(projectDirectory, "vc", "build.gradle"), "", "utf-8");

  return { projectDirectory, screenDirectory };
}

function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snk-addon-plugin-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function runConfig(plugin: Plugin, root: string, config: UserConfig = {}): Partial<UserConfig> {
  return (getHookHandler(plugin.config)?.call({} as never, { ...config, root }, buildEnvironment) ??
    {}) as Partial<UserConfig>;
}

function runConfigResolved(plugin: Plugin, outputDirectory: string): void {
  getHookHandler(plugin.configResolved)?.call(
    {} as never,
    {
      build: { outDir: outputDirectory },
      logger: { info() {}, warn() {} },
      publicDir: outputDirectory,
    } as never,
  );
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T | undefined {
  return typeof hook === "function" ? hook : hook?.handler;
}

const buildEnvironment = {
  command: "build",
  isPreview: false,
  isSsrBuild: false,
  mode: "test",
} as const;
