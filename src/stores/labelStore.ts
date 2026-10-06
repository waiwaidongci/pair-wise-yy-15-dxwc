import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createMockSpecimens, DEFAULT_TEMPLATE } from '../data/mockSpecimens'
import type { ImportResult, LabelLock, LabelTemplate, Specimen, ValidationIssue } from '../types/label'
import { validateSpecimens } from '../utils/csv'
import { migrateSpecimen, migrateTemplate, TEMPLATE_INITIAL_VERSION } from '../utils/migration'

const STORAGE_KEY = 'pair-wise-yy-15-label-studio'

interface PersistedState {
  specimens: Specimen[]
  templates: LabelTemplate[]
  activeTemplateId: string
}

/** 读取并迁移本地存档：旧模板缺版本号时补为初始版本后再打开 */
function loadPersisted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const templates = Array.isArray(parsed.templates) ? parsed.templates.map(migrateTemplate) : []
    const specimens = Array.isArray(parsed.specimens) ? parsed.specimens.map(migrateSpecimen) : []
    return {
      specimens,
      templates,
      activeTemplateId: typeof parsed.activeTemplateId === 'string' ? parsed.activeTemplateId : '',
    }
  } catch {
    return null
  }
}

function readCommitted(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PersistedState
  } catch {
    return null
  }
}

export const useLabelStore = defineStore('label-studio', () => {
  const persisted = loadPersisted()
  const specimens = ref<Specimen[]>(persisted?.specimens ?? createMockSpecimens())
  const templates = ref<LabelTemplate[]>(
    persisted?.templates?.length ? persisted.templates : [{ ...DEFAULT_TEMPLATE }],
  )
  const activeTemplateId = ref(
    persisted?.activeTemplateId && templates.value.some((item) => item.id === persisted.activeTemplateId)
      ? persisted.activeTemplateId
      : templates.value[0].id,
  )
  const selectedSpecimenIds = ref<string[]>([])

  /** 最近一次冲突副本信息（后保存的版本被留成冲突副本） */
  const lastConflict = ref<{ name: string; at: string } | null>(null)
  /** 其他标签页已保存更新、本页工作副本落后时置为 true */
  const remoteOutdated = ref(false)

  const activeTemplate = computed(
    () => templates.value.find((item) => item.id === activeTemplateId.value) ?? templates.value[0],
  )
  const issues = computed(() => validateSpecimens(specimens.value, true))
  const errorCount = computed(() => issues.value.filter((item) => item.severity === 'error').length)
  const warningCount = computed(() => issues.value.filter((item) => item.severity === 'warning').length)

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        specimens: specimens.value,
        templates: templates.value,
        activeTemplateId: activeTemplateId.value,
      }),
    )
  }

  /**
   * 模板更新（乐观并发）：
   * 以工作副本的版本为基准，若存档中该模板已有更高版本（其他标签页先保存），
   * 则先保存的版本生效，本次改动另存为冲突副本，不覆盖存档。
   */
  function updateTemplate(patch: Partial<LabelTemplate>) {
    const index = templates.value.findIndex((item) => item.id === activeTemplateId.value)
    if (index < 0) return
    const working = templates.value[index]
    const committed = readCommitted()
    const committedTemplate = committed?.templates?.find((item) => item.id === working.id)

    if (committedTemplate && committedTemplate.version > working.version) {
      const conflictCopy: LabelTemplate = {
        ...working,
        ...patch,
        id: crypto.randomUUID(),
        name: `${working.name} 冲突副本`,
        version: TEMPLATE_INITIAL_VERSION,
        updatedAt: new Date().toISOString(),
      }
      // 以存档为基础（保留先保存版本的模板与标本修改），追加冲突副本
      const baseTemplates = (committed?.templates ?? []).map(migrateTemplate)
      const baseSpecimens = (committed?.specimens ?? []).map(migrateSpecimen)
      templates.value = [...baseTemplates, conflictCopy]
      activeTemplateId.value = conflictCopy.id
      lastConflict.value = { name: conflictCopy.name, at: new Date().toISOString() }
      remoteOutdated.value = false
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          specimens: baseSpecimens,
          templates: templates.value,
          activeTemplateId: activeTemplateId.value,
        }),
      )
      return
    }

    templates.value[index] = {
      ...working,
      ...patch,
      version: working.version + 1,
      updatedAt: new Date().toISOString(),
    }
    remoteOutdated.value = false
    persist()
  }

  function saveAsTemplate(name: string) {
    const template: LabelTemplate = {
      ...activeTemplate.value,
      id: crypto.randomUUID(),
      name: name.trim() || `标签模板 ${templates.value.length + 1}`,
      version: TEMPLATE_INITIAL_VERSION,
      updatedAt: new Date().toISOString(),
    }
    templates.value.push(template)
    activeTemplateId.value = template.id
    persist()
  }

  function activateTemplate(id: string) {
    if (!templates.value.some((item) => item.id === id)) return
    activeTemplateId.value = id
    remoteOutdated.value = false
    persist()
  }

  function duplicateTemplate(id: string) {
    const source = templates.value.find((item) => item.id === id)
    if (!source) return
    const copy: LabelTemplate = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} 副本`,
      version: TEMPLATE_INITIAL_VERSION,
      updatedAt: new Date().toISOString(),
    }
    templates.value.push(copy)
    activeTemplateId.value = copy.id
    persist()
  }

  function removeTemplate(id: string) {
    if (templates.value.length <= 1) return
    templates.value = templates.value.filter((item) => item.id !== id)
    if (activeTemplateId.value === id) activeTemplateId.value = templates.value[0].id
    persist()
  }

  /** 跨标签页同步：其他标签页保存后，本页工作副本落后时给出提示 */
  function handleStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return
    const committed = readCommitted()
    if (!committed) return
    const working = templates.value.find((item) => item.id === activeTemplateId.value)
    const committedTemplate = committed.templates.find((item) => item.id === activeTemplateId.value)
    const deleted = !committedTemplate
    const newer = committedTemplate && working && committedTemplate.version > working.version
    if (deleted || newer) remoteOutdated.value = true
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage)
  }

  /** 拉取其他标签页已保存的最新版本，覆盖本页工作副本 */
  function refreshFromRemote() {
    const committed = readCommitted()
    if (!committed) return
    templates.value = committed.templates.map(migrateTemplate)
    specimens.value = committed.specimens.map(migrateSpecimen)
    if (!templates.value.some((item) => item.id === activeTemplateId.value)) {
      activeTemplateId.value = templates.value[0].id
    }
    remoteOutdated.value = false
    persist()
  }

  function importResult(result: ImportResult) {
    specimens.value = [...result.specimens, ...specimens.value]
    const ids = new Set(result.specimens.map((item) => item.id))
    selectedSpecimenIds.value = [...ids]
    persist()
  }

  function updateSpecimen(id: string, patch: Partial<Specimen>) {
    const index = specimens.value.findIndex((item) => item.id === id)
    if (index < 0) return
    specimens.value[index] = { ...specimens.value[index], ...patch }
    persist()
  }

  function removeSpecimens(ids: string[]) {
    const targets = new Set(ids)
    specimens.value = specimens.value.filter((item) => !targets.has(item.id))
    selectedSpecimenIds.value = selectedSpecimenIds.value.filter((id) => !targets.has(id))
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
    persist()
  }

  function getIssueById(id: string): ValidationIssue | undefined {
    return issues.value.find((issue) => issue.id === id)
  }

  /** 锁定单条标签的字号与行高（锁定后模板改版不再影响该标签） */
  function setLabelLock(specimenId: string, lock: LabelLock) {
    const index = specimens.value.findIndex((item) => item.id === specimenId)
    if (index < 0) return
    const current = specimens.value[index].labelLock ?? {}
    specimens.value[index] = {
      ...specimens.value[index],
      labelLock: { ...current, ...lock },
    }
    persist()
  }

  /** 解除单条标签的字号/行高锁定 */
  function clearLabelLock(specimenId: string) {
    const index = specimens.value.findIndex((item) => item.id === specimenId)
    if (index < 0) return
    const next = { ...specimens.value[index] }
    delete next.labelLock
    specimens.value[index] = next
    persist()
  }

  return {
    specimens,
    templates,
    activeTemplate,
    activeTemplateId,
    selectedSpecimenIds,
    lastConflict,
    remoteOutdated,
    issues,
    errorCount,
    warningCount,
    updateTemplate,
    saveAsTemplate,
    activateTemplate,
    duplicateTemplate,
    removeTemplate,
    refreshFromRemote,
    importResult,
    updateSpecimen,
    removeSpecimens,
    setSelection,
    removeIssues,
    resetMockData,
    getIssueById,
    setLabelLock,
    clearLabelLock,
    persist,
  }
})
