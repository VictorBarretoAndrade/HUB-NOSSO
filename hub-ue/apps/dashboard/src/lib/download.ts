/** Dispara o download de um arquivo de texto gerado no navegador. */
export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Carimbo de data/hora seguro para nomes de arquivo (sem ":" nem "."). */
export function fileTimestamp(isoDate = new Date().toISOString()): string {
  return isoDate.replace(/[:.]/g, "-");
}
