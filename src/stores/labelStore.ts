import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createMockSpecimens, DEFAULT_TEMPLATE } from '../data/mockSpecimens'
import type {
  ImportResult,
  LabelOverride,
  LabelOverrideMap,
  LabelTemplate,
  Specimen,
  ValidationIssue,
} from '../types/label'
import { validateSpecimens } from '../utils/csv'
import { computeSheetLayout } from '../utils/layoutEngine'

const STORAGE_KEY = 'pair-wise-yy-15-label-studio'
const SCHEMA_VERSION = 2

interface PersistedState {
  schemaVersion?: number
  specimens: Specimen[]
  templates: LabelTemplate[]
  activeTemplateId: string
  labelOverrides?: LabelOverrideMap
}

interface Notice {
  text: string
  at: number
}

/** 旧数据缺版本号，迁移为初始版本 v1 */
function migrateTemplate(template: LabelTemplate): LabelTemplate {
  return {
    ...template,
    version: typeof template.version === 'number' ? template.version : 1,
  }
}

function readPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedState
  } catch {
    return null
  }
}

function loadPersisted() {
  const state = readPersisted()
  if (!state || !Array.isArray(state.templates) || !state.templates.length) return null
  const migrated = state.templates.some((item) => typeof item.version !== 'number')
  state.templates = state.templates.map(migrateTemplate)
  return { state, migrated }
}

export const useLabelStore = defineStore('label-studio', () => {
  const persisted = loadPersisted()
  const specimens = ref<Specimen[]>(persisted?.state.specimens ?? createMockSpecimens())
  const templates = ref<LabelTemplate[]>(
    persisted?.state.templates?.length ? persisted.state.templates : [{ ...DEFAULT_TEMPLATE }],
  )
  const activeTemplateId = ref(
    persisted?.state.activeTemplateId &&
      templates.value.some((item) => item.id === persisted.state.activeTemplateId)
      ? persisted.state.activeTemplateId
      : templates.value[0].id,
  )
  const labelOverrides = ref<LabelOverrideMap>(persisted?.state.labelOverrides ?? {})
  const selectedSpecimenIds = ref<string[]>([])

  /** 旧模板已迁移为初始版本的标记，启动时提示一次 */
  const migratedLegacy = ref(Boolean(persisted?.migrated))
  const conflictNotice = ref<Notice | null>(null)
  const externalSyncNotice = ref<Notice | null>(null)

  /** 本标签页各模板的编辑基准版本，用于保存时的乐观并发检查 */
  const baseVersions = new Map<string, number>()
  templates.value.forEach((item) => baseVersions.set(item.id, item.version))
  /** 本标签页主动删除的模板，合并远端数据时不再复活 */
  const deletedTemplateIds = new Set<string>()

  const activeTemplate = computed(
    () => templates.value.find((item) => item.id === activeTemplateId.value) ?? templates.value[0],
  )
  const issues = computed(() => validateSpecimens(specimens.value, true))
  const errorCount = computed(() => issues.value.filter((item) => item.severity === 'error').length)
  const warningCount = computed(() => issues.value.filter((item) => item.severity === 'warning').length)
  const lockedCount = computed(() => Object.keys(labelOverrides.value).length)

  /** 模板、标本记录与锁定的同一次改版：任一输入变化即整表失效重算 */
  const sheetLayout = computed(() =>
    computeSheetLayout(specimens.value, activeTemplate.value, labelOverrides.value),
  )

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        specimens: specimens.value,
        templates: templates.value,
        activeTemplateId: activeTemplateId.value,
        labelOverrides: labelOverrides.value,
      } satisfies PersistedState),
    )
  }

  /**
   * 把其他窗口更新的模板拉进本窗口（远端版本更新才覆盖），
   * 避免标本保存等整表持久化把别的窗口先保存的模板覆盖掉。
   */
  function pullRemoteTemplates(exceptId?: string) {
    const remote = readPersisted()
    if (!remote?.templates?.length) return
    const remoteTemplates = remote.templates.map(migrateTemplate)
    const byId = new Map(remoteTemplates.map((item) => [item.id, item]))
    templates.value = templates.value.map((local) => {
      const incoming = byId.get(local.id)
      byId.delete(local.id)
      if (local.id === exceptId || !incoming || incoming.version <= local.version) return local
      baseVersions.set(local.id, incoming.version)
      return incoming
    })
    byId.forEach((incoming) => {
      if (deletedTemplateIds.has(incoming.id)) return
      templates.value.push(incoming)
      baseVersions.set(incoming.id, incoming.version)
    })
  }

  function readRemoteTemplate(id: string) {
    const remote = readPersisted()
    const found = remote?.templates?.find((item) => item.id === id)
    return found ? migrateTemplate(found) : null
  }

  /**
   * 保存模板：先保存的版本生效；若另一窗口已先保存（版本号超前），
   * 本次修改不覆盖，另存为冲突副本。
   */
  function updateTemplate(patch: Partial<LabelTemplate>): 'saved' | 'conflict' | 'ignored' {
    const id = activeTemplateId.value
    const index = templates.value.findIndex((item) => item.id === id)
    if (index < 0) return 'ignored'
    const base = baseVersions.get(id) ?? templates.value[index].version
    const remote = readRemoteTemplate(id)

    if (remote && remote.version !== base) {
      templates.value[index] = remote
      baseVersions.set(id, remote.version)
      const copy: LabelTemplate = {
        ...remote,
        ...patch,
        id: crypto.randomUUID(),
        name: `${remote.name} 冲突副本`,
        version: 1,
        conflictOf: remote.id,
        updatedAt: new Date().toISOString(),
      }
      templates.value.push(copy)
      baseVersions.set(copy.id, copy.version)
      persist()
      conflictNotice.value = {
        text: `模板「${remote.name}」已在其他窗口先保存（v${remote.version}），本次修改已保留为冲突副本`,
        at: Date.now(),
      }
      return 'conflict'
    }

    pullRemoteTemplates(id)
    const currentIndex = templates.value.findIndex((item) => item.id === id)
    if (currentIndex < 0) return 'ignored'
    const next: LabelTemplate = {
      ...templates.value[currentIndex],
      ...patch,
      version: base + 1,
      updatedAt: new Date().toISOString(),
    }
    templates.value[currentIndex] = next
    baseVersions.set(id, next.version)
    persist()
    return 'saved'
  }

  function saveAsTemplate(name: string) {
    const template: LabelTemplate = {
      ...activeTemplate.value,
      id: crypto.randomUUID(),
      name: name.trim() || `标签模板 ${templates.value.length + 1}`,
      version: 1,
      conflictOf: undefined,
      updatedAt: new Date().toISOString(),
    }
    templates.value.push(template)
    baseVersions.set(template.id, template.version)
    activeTemplateId.value = template.id
    persist()
  }

  function activateTemplate(id: string) {
    if (!templates.value.some((item) => item.id === id)) return
    activeTemplateId.value = id
    pullRemoteTemplates()
    persist()
  }

  function duplicateTemplate(id: string) {
    const source = templates.value.find((item) => item.id === id)
    if (!source) return
    const copy: LabelTemplate = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} 副本`,
      version: 1,
      conflictOf: undefined,
      updatedAt: new Date().toISOString(),
    }
    templates.value.push(copy)
    baseVersions.set(copy.id, copy.version)
    activeTemplateId.value = copy.id
    persist()
  }

  function removeTemplate(id: string) {
    if (templates.value.length <= 1) return
    templates.value = templates.value.filter((item) => item.id !== id)
    baseVersions.delete(id)
    deletedTemplateIds.add(id)
    if (activeTemplateId.value === id) activeTemplateId.value = templates.value[0].id
    persist()
  }

  function importResult(result: ImportResult) {
    specimens.value = [...result.specimens, ...specimens.value]
    const ids = new Set(result.specimens.map((item) => item.id))
    selectedSpecimenIds.value = [...ids]
    pullRemoteTemplates()
    persist()
  }

  function updateSpecimen(id: string, patch: Partial<Specimen>) {
    const index = specimens.value.findIndex((item) => item.id === id)
    if (index < 0) return
    specimens.value[index] = { ...specimens.value[index], ...patch }
    pullRemoteTemplates()
    persist()
  }

  function removeSpecimens(ids: string[]) {
    const targets = new Set(ids)
    specimens.value = specimens.value.filter((item) => !targets.has(item.id))
    selectedSpecimenIds.value = selectedSpecimenIds.value.filter((id) => !targets.has(id))
    pullRemoteTemplates()
    persist()
  }

  function setSelection(ids: string[]) {
    selectedSpecimenIds.value = ids
  }

  function removeIssues(ids: string[]) {
    const records = specimens.value.filter((specimen) =>
      validateSpecimens([specimen], true).some((issue) => ids.includes(issue.id)),
    )
    removeSpecimens(records.map((item) => item.id))
  }

  function resetMockData() {
    specimens.value = createMockSpecimens()
    selectedSpecimenIds.value = []
    pullRemoteTemplates()
    persist()
  }

  function setLabelOverride(specimenId: string, patch: LabelOverride) {
    const current = labelOverrides.value[specimenId] ?? {}
    const next: LabelOverride = { ...current, ...patch }
    if (next.fontSizePt == null) delete next.fontSizePt
    if (!next.noWrap) delete next.noWrap
    const rest = { ...labelOverrides.value }
    if (next.fontSizePt == null && !next.noWrap) delete rest[specimenId]
    else rest[specimenId] = next
    labelOverrides.value = rest
    pullRemoteTemplates()
    persist()
  }

  function clearLabelOverride(specimenId: string) {
    if (!(specimenId in labelOverrides.value)) return
    const rest = { ...labelOverrides.value }
    delete rest[specimenId]
    labelOverrides.value = rest
    pullRemoteTemplates()
    persist()
  }

  function getIssueById(id: string): ValidationIssue | undefined {
    return issues.value.find((issue) => issue.id === id)
  }

  /** 其他窗口保存后，本窗口收敛到最新状态并提示 */
  function handleStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    let state: PersistedState | null = null
    try {
      state = JSON.parse(event.newValue) as PersistedState
    } catch {
      return
    }
    if (!state?.templates?.length) return
    templates.value = state.templates.map(migrateTemplate)
    specimens.value = state.specimens ?? specimens.value
    labelOverrides.value = state.labelOverrides ?? {}
    activeTemplateId.value = templates.value.some((item) => item.id === state!.activeTemplateId)
      ? state!.activeTemplateId
      : templates.value[0].id
    baseVersions.clear()
    templates.value.forEach((item) => baseVersions.set(item.id, item.version))
    externalSyncNotice.value = {
      text: '已同步其他窗口对模板或清单的更改',
      at: Date.now(),
    }
  }
  window.addEventListener('storage', handleStorage)

  // 旧数据迁移为初始版本后回写一次，之后按带版本号的数据打开
  if (persisted?.migrated) persist()

  return {
    specimens,
    templates,
    activeTemplate,
    activeTemplateId,
    selectedSpecimenIds,
    labelOverrides,
    lockedCount,
    sheetLayout,
    issues,
    errorCount,
    warningCount,
    migratedLegacy,
    conflictNotice,
    externalSyncNotice,
    updateTemplate,
    saveAsTemplate,
    activateTemplate,
    duplicateTemplate,
    removeTemplate,
    importResult,
    updateSpecimen,
    removeSpecimens,
    setSelection,
    removeIssues,
    resetMockData,
    setLabelOverride,
    clearLabelOverride,
    getIssueById,
    persist,
  }
})
