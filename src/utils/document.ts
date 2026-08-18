/** Documento que contém o root do addon, inclusive quando o Sankhya usa iframe. */
export function getAddonDocument(): Document {
  const iframe = window.frameElement as HTMLIFrameElement | null;
  return iframe?.contentDocument ?? iframe?.contentWindow?.document ?? document;
}
