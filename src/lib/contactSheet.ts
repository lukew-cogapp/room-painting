export type SheetCell = { label: string; image: ImageData; swatch?: string }

const GAP = 16
const LABEL_HEIGHT = 34
const MAX_CELL_WIDTH = 900

/**
 * Lay the original and every variant out on one downloadable image.
 *
 * Columns are chosen to keep the sheet close to landscape: a single row of
 * seven cells is unreadable once it is scaled to fit a screen.
 */
export const buildContactSheet = (cells: SheetCell[]): HTMLCanvasElement => {
  const columns = Math.min(cells.length, cells.length <= 4 ? 2 : 3)
  const rows = Math.ceil(cells.length / columns)

  const source = cells[0].image
  const scale = Math.min(1, MAX_CELL_WIDTH / source.width)
  const cellWidth = Math.round(source.width * scale)
  const cellHeight = Math.round(source.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = columns * cellWidth + (columns + 1) * GAP
  canvas.height = rows * (cellHeight + LABEL_HEIGHT) + (rows + 1) * GAP

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // putImageData ignores transforms, so each cell goes through a scratch
  // canvas to get scaled into place.
  const scratch = document.createElement('canvas')
  const scratchCtx = scratch.getContext('2d')
  if (!scratchCtx) throw new Error('Canvas unavailable')

  cells.forEach((cell, index) => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = GAP + column * (cellWidth + GAP)
    const y = GAP + row * (cellHeight + LABEL_HEIGHT + GAP)

    scratch.width = cell.image.width
    scratch.height = cell.image.height
    scratchCtx.putImageData(cell.image, 0, 0)
    ctx.drawImage(scratch, x, y, cellWidth, cellHeight)

    const textY = y + cellHeight + 22
    let textX = x
    if (cell.swatch) {
      ctx.fillStyle = cell.swatch
      ctx.fillRect(x, textY - 11, 14, 14)
      ctx.strokeStyle = '#475569'
      ctx.strokeRect(x + 0.5, textY - 10.5, 13, 13)
      textX = x + 22
    }
    ctx.fillStyle = '#e2e8f0'
    ctx.font = '15px ui-sans-serif, system-ui, sans-serif'
    ctx.fillText(cell.label, textX, textY)
  })

  return canvas
}

export const downloadCanvas = (canvas: HTMLCanvasElement, filename: string) => {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }, 'image/png')
}
