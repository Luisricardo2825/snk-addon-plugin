export { getAddonDocument } from "../utils/document";

export function removeBootstrapAssets(document: Document): void {
  document
    .querySelectorAll("link[href*='bootstrap'], script[src*='bootstrap']")
    .forEach((element) => element.remove());
}
