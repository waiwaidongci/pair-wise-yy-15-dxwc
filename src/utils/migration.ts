import type { LabelLock, LabelTemplate, Specimen } from '../types/label'

/** 模板初始版本号：旧模板升级后按此版本打开 */
export const TEMPLATE_INITIAL_VERSION = 1

export const DEFAULT_TEMPLATE_FIELDS = {
  paperWidthMm: 210,
  paperHeightMm: 297,
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  columns: 4,
  rowHeightMm: 25,
  columnGapMm: 2,
  rowGapMm: 2,
  lineHeightMm: 4.2,
  fontSizePt: 7,
  borderWidthMm: 0.2,
  borderStyle: 'solid' as const,
  italicScientific: true,
  barcodeMode: 'qr' as const,
  includeCollection: true,
  includeHabitat: false,
  includeNotes: false,
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function migrateLabelLock(raw: unknown): LabelLock | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const source = raw as Record<string, unknown>
  const lock: LabelLock = {}
  if (typeof source.fontSizePt === 'number' && Number.isFinite(source.fontSizePt)) {
    lock.fontSizePt = source.fontSizePt
  }
  if (typeof source.lineHeightMm === 'number' && Number.isFinite(source.lineHeightMm)) {
    lock.lineHeightMm = source.lineHeightMm
  }
  return lock.fontSizePt !== undefined || lock.lineHeightMm !== undefined ? lock : undefined
}

/**
 * 迁移单条模板：旧模板缺版本号时补为初始版本，缺失字段补默认值。
 * 已是新版本（version >= 1）的模板原样保留。
 */
export function migrateTemplate(raw: unknown): LabelTemplate {
  const source = (raw ?? {}) as Record<string, unknown>
  const hasVersion =
    typeof source.version === 'number' && Number.isFinite(source.version) && source.version >= 1
  return {
    id: str(source.id, '') || crypto.randomUUID(),
    name: str(source.name, '未命名模板'),
    version: hasVersion ? (source.version as number) : TEMPLATE_INITIAL_VERSION,
    paperWidthMm: num(source.paperWidthMm, DEFAULT_TEMPLATE_FIELDS.paperWidthMm),
    paperHeightMm: num(source.paperHeightMm, DEFAULT_TEMPLATE_FIELDS.paperHeightMm),
    marginTopMm: num(source.marginTopMm, DEFAULT_TEMPLATE_FIELDS.marginTopMm),
    marginRightMm: num(source.marginRightMm, DEFAULT_TEMPLATE_FIELDS.marginRightMm),
    marginBottomMm: num(source.marginBottomMm, DEFAULT_TEMPLATE_FIELDS.marginBottomMm),
    marginLeftMm: num(source.marginLeftMm, DEFAULT_TEMPLATE_FIELDS.marginLeftMm),
    columns: num(source.columns, DEFAULT_TEMPLATE_FIELDS.columns),
    rowHeightMm: num(source.rowHeightMm, DEFAULT_TEMPLATE_FIELDS.rowHeightMm),
    columnGapMm: num(source.columnGapMm, DEFAULT_TEMPLATE_FIELDS.columnGapMm),
    rowGapMm: num(source.rowGapMm, DEFAULT_TEMPLATE_FIELDS.rowGapMm),
    lineHeightMm: num(source.lineHeightMm, DEFAULT_TEMPLATE_FIELDS.lineHeightMm),
    fontSizePt: num(source.fontSizePt, DEFAULT_TEMPLATE_FIELDS.fontSizePt),
    borderWidthMm: num(source.borderWidthMm, DEFAULT_TEMPLATE_FIELDS.borderWidthMm),
    borderStyle: oneOf(source.borderStyle, ['solid', 'dashed', 'dotted'], DEFAULT_TEMPLATE_FIELDS.borderStyle),
    italicScientific: bool(source.italicScientific, DEFAULT_TEMPLATE_FIELDS.italicScientific),
    barcodeMode: oneOf(source.barcodeMode, ['none', 'qr', 'code128'], DEFAULT_TEMPLATE_FIELDS.barcodeMode),
    includeCollection: bool(source.includeCollection, DEFAULT_TEMPLATE_FIELDS.includeCollection),
    includeHabitat: bool(source.includeHabitat, DEFAULT_TEMPLATE_FIELDS.includeHabitat),
    includeNotes: bool(source.includeNotes, DEFAULT_TEMPLATE_FIELDS.includeNotes),
    updatedAt: str(source.updatedAt, '') || new Date().toISOString(),
  }
}

/** 迁移单条标本：补全缺失字段，保留已有的字号/换行锁定。 */
export function migrateSpecimen(raw: unknown): Specimen {
  const source = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(source.id, '') || crypto.randomUUID(),
    accessionNo: str(source.accessionNo, ''),
    taxonName: str(source.taxonName, ''),
    scientificName: str(source.scientificName, ''),
    locality: str(source.locality, ''),
    collectedAt: str(source.collectedAt, ''),
    collector: str(source.collector, ''),
    habitat: str(source.habitat, ''),
    notes: str(source.notes, ''),
    labelLock: migrateLabelLock(source.labelLock),
  }
}
