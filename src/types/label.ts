export type BarcodeMode = 'none' | 'qr' | 'code128'
export type BorderStyle = 'solid' | 'dashed' | 'dotted'

export interface Specimen {
  id: string
  accessionNo: string
  taxonName: string
  scientificName: string
  locality: string
  collectedAt: string
  collector: string
  habitat: string
  notes: string
}

export interface LabelTemplate {
  id: string
  name: string
  paperWidthMm: number
  paperHeightMm: number
  marginTopMm: number
  marginRightMm: number
  marginBottomMm: number
  marginLeftMm: number
  columns: number
  rowHeightMm: number
  columnGapMm: number
  rowGapMm: number
  lineHeightMm: number
  fontSizePt: number
  borderWidthMm: number
  borderStyle: BorderStyle
  italicScientific: boolean
  barcodeMode: BarcodeMode
  includeCollection: boolean
  includeHabitat: boolean
  includeNotes: boolean
  /** 乐观并发版本号，每次成功保存 +1；旧数据迁移时补为 1 */
  version: number
  /** 冲突副本指向原模板 id */
  conflictOf?: string
  updatedAt: string
}

/** 个别标签的人工锁定：锁定后不再跟随模板自动调整 */
export interface LabelOverride {
  /** 锁定学名字号（pt），不再随模板字号或自动缩放变化 */
  fontSizePt?: number
  /** 锁定换行：学名禁止自动换行，保持单行 */
  noWrap?: boolean
}

export type LabelOverrideMap = Record<string, LabelOverride>

/** 单标签排版指标（布局引擎输出，可缓存复用） */
export interface LabelMetrics {
  /** 实际生效的学名字号 */
  fontSizePt: number
  /** 自动缩放系数，锁定时为 1 */
  scale: number
  /** 是否允许学名自动换行 */
  wrap: boolean
  scientificLines: number
  contentHeightMm: number
  /** 超出标签行高的毫米数，> 0 即溢出 */
  overflowMm: number
  /** 单行字段被截断（采集地 / 编号等超宽） */
  truncated: boolean
  locked: boolean
}

export interface LayoutIssue {
  id: string
  specimenId: string
  kind: 'overflow' | 'truncated'
  message: string
}

/** 一次整表排版的结果：分页 + 单标签指标 + 溢出提醒 */
export interface SheetLayout {
  templateId: string
  templateVersion: number
  signature: string
  perPage: number
  rows: number
  pageCount: number
  pages: Specimen[][]
  metrics: Record<string, LabelMetrics>
  issues: LayoutIssue[]
  /** 本次重算中直接沿用缓存的标签数 */
  reused: number
  computedAt: number
}

export interface ValidationIssue {
  id: string
  specimenId: string
  field: keyof Specimen
  severity: 'error' | 'warning'
  message: string
}

export interface ImportResult {
  specimens: Specimen[]
  issues: ValidationIssue[]
  ignoredRows: number
}
