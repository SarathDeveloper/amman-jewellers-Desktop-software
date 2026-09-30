export function isEmbeddedPrintPreview(): boolean {
  return new URLSearchParams(window.location.search).get('embed') === '1'
}

export function applyPrintEmbedDataset(): void {
  if (isEmbeddedPrintPreview()) document.documentElement.dataset.printEmbed = '1'
}
