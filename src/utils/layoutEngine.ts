import type {
  LabelMetrics,
  LabelOverride,
  LabelOverrideMap,
  LabelTemplate,
  LayoutIssue,
  SheetLayout,
  Specimen,
} from '../types/label'
import { labelInnerWidth, labelsPerPage, rowsPerPage } from './layout'

const PT_TO_MM = 0.3528
const PAD_X_MM = 1.5
const PAD_Y_MM = 1.3
const MARK_COLUMN_MM = 14
const MARK_GAP_MM = 1
const SCIENTIFIC_LINE_MM = 3.5
const TOP_ROW_GAP_MM = 0.8
const OVERFLOW_TOLERANCE_MM = 0.05
const CJK_RE = /[⺀-鿿豈-﫿＀-￿]/

/** 估算文本宽度：拉丁字符约 0.54em，中日韩字符约 1em */
function textWidthMm(text: string, fontSizePt: number) {
  let units = 0
  for (const char of text) units += CJK_RE.test(char) ? 1 : 0.54
  return units * fontSizePt * PT_TO_MM
}

/**
 * 版面签名：纸张、栏数、边距、学名字号等任一版面参数变化，
 * 签名即变化，分页与溢出提醒整表失效重算。
 */
export function layoutSignature(template: LabelTemplate) {
  return [
    template.paperWidthMm,
    template.paperHeightMm,
    template.marginTopMm,
    template.marginRightMm,
    template.marginBottomMm,
    template.marginLeftMm,
    template.columns,
    template.rowHeightMm,
    template.columnGapMm,
    template.rowGapMm,
    template.lineHeightMm,
    template.fontSizePt,
    template.borderWidthMm,
    template.barcodeMode,
    template.includeCollection ? 1 : 0,
    template.includeHabitat ? 1 : 0,
    template.includeNotes ? 1 : 0,
  ].join('|')
}

/** 单标签排版指标：渲染、溢出提醒与导出共用同一套估算 */
export function computeLabelMetrics(
  specimen: Specimen,
  template: LabelTemplate,
  override?: LabelOverride,
): LabelMetrics {
  const locked = Boolean(override && (override.fontSizePt != null || override.noWrap))
  const basePt = override?.fontSizePt ?? template.fontSizePt
  const wrap = !override?.noWrap
  const borderMm = template.borderWidthMm
  const markMm = template.barcodeMode === 'none' ? 0 : MARK_COLUMN_MM + MARK_GAP_MM
  const availableMm = Math.max(
    4,
    labelInnerWidth(template) - PAD_X_MM * 2 - borderMm * 2 - markMm,
  )

  // 锁定字号的标签不随模板自动缩放
  const rawScientificWidth = textWidthMm(specimen.scientificName || '学名待补', basePt)
  const scale =
    override?.fontSizePt == null && rawScientificWidth > availableMm
      ? Math.max(0.74, availableMm / rawScientificWidth)
      : 1
  const fontSizePt = basePt * scale
  const scientificWidth = rawScientificWidth * scale
  const scientificLines = wrap ? Math.max(1, Math.ceil(scientificWidth / availableMm)) : 1

  let truncated = !wrap && scientificWidth > availableMm
  const topWidth =
    textWidthMm(specimen.taxonName || '待鉴定类群', template.fontSizePt) +
    textWidthMm(specimen.accessionNo, template.fontSizePt * 0.78) +
    TOP_ROW_GAP_MM
  if (topWidth > availableMm) truncated = true

  let contentHeightMm =
    PAD_Y_MM * 2 + borderMm * 2 + template.lineHeightMm + scientificLines * SCIENTIFIC_LINE_MM
  if (template.includeCollection) {
    if (textWidthMm(specimen.locality || '采集地待补', template.fontSizePt) > availableMm) {
      truncated = true
    }
    const collectorLine = `${specimen.collectedAt} · ${specimen.collector}${
      template.includeHabitat && specimen.habitat ? ` · ${specimen.habitat}` : ''
    }`
    if (textWidthMm(collectorLine, template.fontSizePt) > availableMm) truncated = true
    contentHeightMm += template.lineHeightMm * 2
  }
  if (template.includeNotes && specimen.notes) {
    if (textWidthMm(specimen.notes, template.fontSizePt) > availableMm) truncated = true
    contentHeightMm += template.lineHeightMm
  }

  return {
    fontSizePt,
    scale,
    wrap,
    scientificLines,
    contentHeightMm,
    overflowMm: contentHeightMm - template.rowHeightMm,
    truncated,
    locked,
  }
}

/**
 * 单标签缓存键：只包含与该标签真正相关的输入。
 * 例如锁定字号的标签不含模板字号，模板改字号时它的键不变，
 * 重算时直接沿用缓存结果；生境开关只牵连有生境内容的标签。
 */
function labelKey(specimen: Specimen, template: LabelTemplate, override?: LabelOverride) {
  const collection = template.includeCollection
  return [
    specimen.accessionNo,
    specimen.taxonName,
    specimen.scientificName,
    collection ? specimen.locality : '',
    collection ? specimen.collectedAt : '',
    collection ? specimen.collector : '',
    collection && template.includeHabitat ? specimen.habitat : '',
    template.includeNotes ? specimen.notes : '',
    override?.fontSizePt ?? template.fontSizePt,
    // 区分“锁定 7pt（不自动缩放）”与“模板 7pt（自动缩放）”，避免键碰撞
    override?.fontSizePt != null ? 1 : 0,
    override?.noWrap ? 1 : 0,
    template.lineHeightMm,
    template.rowHeightMm,
    template.borderWidthMm,
    template.barcodeMode,
    template.paperWidthMm,
    template.marginLeftMm,
    template.marginRightMm,
    template.columns,
    template.columnGapMm,
  ].join('~')
}

function specimenListKey(specimens: Specimen[]) {
  return specimens
    .map((item) =>
      [
        item.id,
        item.accessionNo,
        item.taxonName,
        item.scientificName,
        item.locality,
        item.collectedAt,
        item.collector,
        item.habitat,
        item.notes,
      ].join('~'),
    )
    .join('|')
}

interface SheetCacheEntry {
  key: string
  layout: SheetLayout
}

const sheetCache = new Map<string, SheetCacheEntry>()
const labelCaches = new Map<string, Map<string, { key: string; metrics: LabelMetrics }>>()

/**
 * 整表排版：签名、清单或锁定变化时整表失效，
 * 分页与溢出提醒重算；未受牵连的标签沿用上一次的指标。
 */
export function computeSheetLayout(
  specimens: Specimen[],
  template: LabelTemplate,
  overrides: LabelOverrideMap,
): SheetLayout {
  const signature = layoutSignature(template)
  const cacheKey = `${signature}#${specimenListKey(specimens)}#${JSON.stringify(overrides)}`
  const cached = sheetCache.get(template.id)
  if (cached && cached.key === cacheKey) return cached.layout

  const rows = rowsPerPage(template)
  const perPage = labelsPerPage(template)
  const pages: Specimen[][] = []
  for (let index = 0; index < specimens.length; index += perPage) {
    pages.push(specimens.slice(index, index + perPage))
  }
  if (!pages.length) pages.push([])

  let labelCache = labelCaches.get(template.id)
  if (!labelCache) {
    labelCache = new Map()
    labelCaches.set(template.id, labelCache)
  }

  let reused = 0
  const metrics: Record<string, LabelMetrics> = {}
  const issues: LayoutIssue[] = []
  const seen = new Set<string>()
  for (const specimen of specimens) {
    seen.add(specimen.id)
    const key = labelKey(specimen, template, overrides[specimen.id])
    const hit = labelCache.get(specimen.id)
    let item: LabelMetrics
    if (hit && hit.key === key) {
      item = hit.metrics
      reused += 1
    } else {
      item = computeLabelMetrics(specimen, template, overrides[specimen.id])
      labelCache.set(specimen.id, { key, metrics: item })
    }
    metrics[specimen.id] = item
    const label = specimen.accessionNo || specimen.id
    if (item.overflowMm > OVERFLOW_TOLERANCE_MM) {
      issues.push({
        id: `overflow-${specimen.id}`,
        specimenId: specimen.id,
        kind: 'overflow',
        message: `「${label}」内容约超高 ${item.overflowMm.toFixed(1)} mm，超出标签行高`,
      })
    }
    if (item.truncated) {
      issues.push({
        id: `truncated-${specimen.id}`,
        specimenId: specimen.id,
        kind: 'truncated',
        message: `「${label}」单行内容超宽，打印时会被截断`,
      })
    }
  }
  for (const id of Array.from(labelCache.keys())) {
    if (!seen.has(id)) labelCache.delete(id)
  }

  const layout: SheetLayout = {
    templateId: template.id,
    templateVersion: template.version,
    signature,
    perPage,
    rows,
    pageCount: pages.length,
    pages,
    metrics,
    issues,
    reused,
    computedAt: Date.now(),
  }
  sheetCache.set(template.id, { key: cacheKey, layout })
  return layout
}
