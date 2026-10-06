export type BarcodeMode = 'none' | 'qr' | 'code128'
export type BorderStyle = 'solid' | 'dashed' | 'dotted'

/** 单条标签的字号/换行锁定：锁定后模板改版不再影响该标签 */
export interface LabelLock {
  fontSizePt?: number
  lineHeightMm?: number
}

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
  labelLock?: LabelLock
}

export interface LabelTemplate {
  id: string
  name: string
  /** 乐观并发版本号：旧模板迁移后为初始版本 1，每次成功保存递增 */
  version: number
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
  updatedAt: string
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
