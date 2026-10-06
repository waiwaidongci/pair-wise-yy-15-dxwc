import type { BarcodeMode, LabelTemplate, Specimen } from '../types/label'

/**
 * 排版结构指纹：只收录影响分页与溢出的模板属性。
 * 纸张、栏数、边距、学名字号一变，指纹就变，分页与溢出随之失效重算；
 * 边框、识别方式等非结构属性变化不触发重算。
 */
export function layoutFingerprint(template: LabelTemplate): string {
  return [
    template.paperWidthMm,
    template.paperHeightMm,
    template.columns,
    template.marginTopMm,
    template.marginRightMm,
    template.marginBottomMm,
    template.marginLeftMm,
    template.fontSizePt,
  ].join('|')
}

export function rowsPerPage(template: LabelTemplate) {
  const contentHeight =
    template.paperHeightMm - template.marginTopMm - template.marginBottomMm
  return Math.max(1, Math.floor((contentHeight + template.rowGapMm) / (template.rowHeightMm + template.rowGapMm)))
}

export function labelsPerPage(template: LabelTemplate) {
  return Math.max(1, template.columns * rowsPerPage(template))
}

export function paginateSpecimens(specimens: Specimen[], template: LabelTemplate) {
  const perPage = labelsPerPage(template)
  const pages: Specimen[][] = []
  for (let index = 0; index < specimens.length; index += perPage) {
    pages.push(specimens.slice(index, index + perPage))
  }
  return pages.length ? pages : [[]]
}

export function formatDate(value: string) {
  if (!value) return '日期待补'
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

export function scientificFontScale(name: string, template: LabelTemplate) {
  const availableMm = labelInnerWidth(template) - 4
  const estimatedWidth = name.length * template.fontSizePt * 0.19
  if (estimatedWidth <= availableMm) return 1
  return Math.max(0.74, availableMm / estimatedWidth)
}

export function labelInnerWidth(template: LabelTemplate) {
  const contentWidth =
    template.paperWidthMm - template.marginLeftMm - template.marginRightMm
  return (
    contentWidth -
    (template.columns - 1) * template.columnGapMm
  ) / template.columns
}

/** 单条标签的有效排版结果：字号与行高优先取锁定值，否则按模板自动缩放。 */
export interface LabelLayout {
  fontSizePt: number
  lineHeightMm: number
  scale: number
  /** 字号或行高是否被单独锁定 */
  locked: boolean
  /** 学名是否因过长而被缩小（溢出提醒依据） */
  shrunk: boolean
}

/**
 * 逐标签排版结果缓存。键只包含决定该标签排版的因素：
 * - 锁定标签：只取决于锁定值，模板改版不影响 → 命中缓存、沿用原结果；
 * - 自动标签：取决于学名长度、模板字号与标签内宽，任一变化才重算。
 */
const labelLayoutCache = new Map<string, LabelLayout>()

export function effectiveLabelLayout(specimen: Specimen, template: LabelTemplate): LabelLayout {
  const lock = specimen.labelLock
  const locked = Boolean(lock?.fontSizePt !== undefined || lock?.lineHeightMm !== undefined)
  const key = locked
    ? `lock|${specimen.id}|${lock?.fontSizePt ?? ''}|${lock?.lineHeightMm ?? ''}`
    : `auto|${specimen.id}|${specimen.scientificName}|${template.fontSizePt}|${labelInnerWidth(template).toFixed(3)}`
  const cached = labelLayoutCache.get(key)
  if (cached) return cached

  const scale = locked ? 1 : scientificFontScale(specimen.scientificName, template)
  const result: LabelLayout = {
    fontSizePt: lock?.fontSizePt ?? template.fontSizePt * scale,
    lineHeightMm: lock?.lineHeightMm ?? template.lineHeightMm,
    scale,
    locked,
    shrunk: !locked && scale < 1,
  }
  labelLayoutCache.set(key, result)
  return result
}

/** 学名溢出判定：自动排版下缩到下限仍可能放不下时给出提醒。 */
export function labelOverflow(specimen: Specimen, template: LabelTemplate) {
  if (specimen.labelLock?.fontSizePt !== undefined) return false
  const scale = scientificFontScale(specimen.scientificName, template)
  if (scale >= 1) return false
  const availableMm = labelInnerWidth(template) - 4
  const estimatedWidth = specimen.scientificName.length * template.fontSizePt * 0.19
  return estimatedWidth * 0.74 > availableMm
}

export function barcodeLabel(mode: BarcodeMode) {
  if (mode === 'qr') return '二维码'
  if (mode === 'code128') return 'Code 128'
  return '不打印'
}

export function safeFilePart(value: string) {
  return value.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').replace(/-+/g, '-')
}
