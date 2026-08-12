import fs from "node:fs";
import path from "node:path";

const source = path.resolve("launcher");
const destination = path.resolve("dist", "launcher");

if (!fs.existsSync(source)) {
  throw new Error("Pasta launcher/ não encontrada.");
}

fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
