import fs from "fs";
import path from "path";
import type { PluginOption, ResolvedConfig } from "vite";

interface IProps {
    name: string;
    outDir?: string;
}
export function renameAndPreparePlugin({
    name,
    outDir = `../webapp/html5/${name}`,
}: IProps): PluginOption {
    let config: ResolvedConfig;
    let isBuild: boolean;
    const rootProjectName: string = readSettingsGradle(outDir);

    function getDist() {
        return outDir;
    }

    function trimHtmlBody(html: string) {
        html = html
            .replace(/%__APP_NAME__%/g, `${name}App`)
            .replace(/%__CONTROLLER_NAME__%/g, `${name}Controller`)
            .replace(/%__SCREEN_NAME__%/g, name);

        const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const body = (match?.[1] ?? html).trim();
        if (isBuild) {
            html = body.replace(
                /<([a-zA-Z][\w:-]*)([^>]*?)\sid=(["'])root\3([^>]*)><\/\1>/,
                `<sk-application
                ng-app="${name}App"
                ng-controller="${name}Controller as ctrl"
                sk-body-overflow="hidden"
                flex
                creation-complete="ctrl.init()"
                id="root">
            </sk-application>`,
            );
        }

        return html;
    }

    function resolveInputHtml() {
        const input = config.build?.rollupOptions?.input;

        if (!input) return "index.html";

        if (typeof input === "string") {
            return path.basename(input);
        }

        if (typeof input === "object") {
            // Pega o primeiro input configurado
            const first = Object.values(input)[0];
            return path.basename(first);
        }

        return "index.html";
    }

    function processHtml(dist: string) {
        const inputHtmlName = resolveInputHtml();
        const oldPath = path.join(dist, inputHtmlName);
        const newPath = path.join(dist, `${name}.html`);

        if (!fs.existsSync(oldPath)) {
            console.warn(`⚠ HTML de entrada não encontrado: ${inputHtmlName}`);
            return;
        }

        const html = fs.readFileSync(oldPath, "utf-8");
        const bodyContent = trimHtmlBody(html);

        fs.writeFileSync(newPath, bodyContent, "utf-8");

        if (oldPath !== newPath) {
            fs.unlinkSync(oldPath);
        }

        console.log(`✔ HTML processado e salvo como ${name}.html`);
    }

    function processLauncher(dist: string) {
        const launcherDir = path.join(dist, "launcher");

        if (!fs.existsSync(launcherDir)) {
            console.warn("⚠ Pasta launcher/ não encontrada.");
            return;
        }

        const files = fs.readdirSync(launcherDir);

        files.forEach((file) => {
            const original = path.join(launcherDir, file);
            const ext = path.extname(file);
            const renamed = path.join(launcherDir, `${name}${ext}`);

            if (ext === ".include") {
                const content = fs.readFileSync(original, "utf-8");
                const updated = content.replace(/{{SCREEN_NAME}}/g, name);
                fs.writeFileSync(original, updated, "utf-8");
            }

            fs.renameSync(original, renamed);
        });

        console.log("✔ Arquivos de launcher renomeados.");
    }

    function readSettingsGradle(dir: string) {
        const absDir = path.resolve(dir);
        const base = absDir.split("vc")[0];

        const settingsPath = path.join(base, "settings.gradle");

        // transform path to absolute

        if (!fs.existsSync(settingsPath)) {
            console.warn("⚠ settings.gradle não encontrado.");
            return "";
        }

        const settings = fs.readFileSync(settingsPath, "utf-8");

        const regex = /rootProject\.name\s*=\s*['"]([^'"]*)['"]/g;
        if (!regex.test(settings)) return "";
        // Get 1 group of regex
        const match = settings.match(regex);

        const rootProjectName = match?.[0];

        const subst = `$1`;

        // The substituted value will be contained in the result variable
        const result = rootProjectName?.replace(regex, subst);

        return (result || "").toLowerCase();
    }
    return {
        name: "rename-and-prepare",

        configResolved(c) {
            config = c;
        },

        closeBundle() {
            if (!isBuild) return;
            const dist = getDist();

            if (!fs.existsSync(dist)) {
                console.warn("⚠ Pasta dist não encontrada.");
                return;
            }

            processHtml(dist);
            processLauncher(dist);
        },

        transformIndexHtml(html: string) {
            return trimHtmlBody(html);
        },
        config(config, env) {
            isBuild = env.command === "build";
            const base = `/${rootProjectName}/html5/${name}/`;
            console.log("isBuild", isBuild, base);
            return {
                base: isBuild ? base : config.base,
                define: {
                    ...config.define,
                    __APP_NAME__: JSON.stringify(`${name}App`),
                    __CONTROLLER_NAME__: JSON.stringify(`${name}Controller`),
                    __SCREEN_NAME__: JSON.stringify(name),
                },
                build: {
                    ...config.build,
                    outDir,
                    emptyOutDir: true,
                    minify: "esbuild",
                    reportCompressedSize: true,
                    rollupOptions: {
                        ...config.build?.rollupOptions,
                        output: {
                            ...config.build?.rollupOptions?.output,
                            entryFileNames: `${name}.js`,
                            chunkFileNames: `${name}.js`,
                            assetFileNames: `${name}.[ext]`,
                            format: "iife",
                        },
                    },
                },
            };
        },
    };
}
