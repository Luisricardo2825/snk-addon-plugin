/** Documento que contém o root do addon, inclusive quando o Sankhya usa iframe. */
export function getAddonDocument(): Document {
  const iframe = window.frameElement as HTMLIFrameElement | null;
  return iframe?.contentDocument ?? iframe?.contentWindow?.document ?? document;
}

export function removeBootstrapAssets(document: Document): void {
  document
    .querySelectorAll("link[href*='bootstrap'], script[src*='bootstrap']")
    .forEach((element) => element.remove());
}
