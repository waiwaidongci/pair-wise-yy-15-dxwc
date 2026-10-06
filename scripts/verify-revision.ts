// 临时验证脚本：布局引擎失效重算、单标签锁定、模板版本冲突、旧数据迁移
import { createPinia, setActivePinia } from 'pinia'

// ---- localStorage / window 模拟（在导入 store 前装好）----
const storageData = new Map<string, string>()
const localStorageShim = {
  getItem: (k: string) => storageData.get(k) ?? null,
  setItem: (k: string, v: string) => void storageData.set(k, String(v)),
  removeItem: (k: string) => void storageData.delete(k),
  clear: () => storageData.clear(),
}
;(globalThis as any).localStorage = localStorageShim
;(globalThis as any).window = globalThis
const storageListeners: Array<(e: any) => void> = []
;(globalThis as any).addEventListener = (type: string, fn: any) => {
  if (type === 'storage') storageListeners.push(fn)
}
if (!(globalThis as any).crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => `uuid-${Math.random()}` },
    configurable: true,
  })
}

const { computeSheetLayout } = await import('../src/utils/layoutEngine')
const { createMockSpecimens, DEFAULT_TEMPLATE } = await import('../src/data/mockSpecimens')

let failures = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.log(`  ✗ ${name} ${extra}`)
  }
}

// ---------- 1. 布局引擎：分页 + 失效重算 + 缓存沿用 ----------
console.log('1. 布局引擎')
const specimens = createMockSpecimens(64)
const t1 = { ...DEFAULT_TEMPLATE }
const l1 = computeSheetLayout(specimens, t1, {})
check('A4 四栏分页容量 40/页', l1.perPage === 40 && l1.pageCount === 2, `perPage=${l1.perPage} pages=${l1.pageCount}`)

const l1Again = computeSheetLayout(specimens, t1, {})
check('参数不变时整表命中缓存（同一对象）', l1Again === l1)

// 纸张高度变化 → 分页失效重算，但标签内容区不变，指标全部沿用
const t2 = { ...t1, paperHeightMm: 210 }
const l2 = computeSheetLayout(specimens, t2, {})
check('纸张变化后分页重算', l2 !== l1 && l2.perPage !== l1.perPage, `perPage=${l2.perPage}`)
check('纸张高度不牵连单标签指标（全部沿用）', l2.reused === 64, `reused=${l2.reused}`)

// 纸张宽度变化 → 标签内宽变化，全部标签重算
const l2b = computeSheetLayout(specimens, { ...t1, paperWidthMm: 160 }, {})
check('纸张宽度牵连全部标签（无缓存沿用）', l2b.reused === 0, `reused=${l2b.reused}`)

// 学名字号变化 → 溢出提醒重算，但锁字号的标签不被牵连
const overrides = { [specimens[0].id]: { fontSizePt: 7 } }
computeSheetLayout(specimens, t1, overrides) // 建立基线
const t3 = { ...t1, fontSizePt: 9 }
const l3 = computeSheetLayout(specimens, t3, overrides)
check('模板字号变化后整表失效重算', l3 !== l1)
check('锁字号的标签沿用原结果', l3.reused === 1, `reused=${l3.reused}`)
check('锁定标签字号保持 7pt', l3.metrics[specimens[0].id].fontSizePt === 7)
check('未锁定标签按新字号重算', l3.metrics[specimens[1].id].fontSizePt !== l1.metrics[specimens[1].id].fontSizePt || l3.metrics[specimens[1].id].scale !== l1.metrics[specimens[1].id].scale)

// 锁定换行
computeSheetLayout(specimens, t1, {}) // 重建基线
const l4 = computeSheetLayout(specimens, t1, { [specimens[5].id]: { noWrap: true } })
check('锁定换行的标签 wrap=false', l4.metrics[specimens[5].id].wrap === false)
check('其余标签未受牵连', l4.reused === 63, `reused=${l4.reused}`)

// 溢出提醒随模板参数重算：行高压缩后应出现溢出
const t5 = { ...t1, rowHeightMm: 10 }
const l5 = computeSheetLayout(specimens, t5, {})
check('行高压缩后产生溢出提醒', l5.issues.some((i) => i.kind === 'overflow'))

// 标本记录修改 → 只重算该标签
computeSheetLayout(specimens, t1, {}) // 重建基线
const edited = specimens.map((s, i) => (i === 10 ? { ...s, locality: s.locality + '后山' } : s))
const l6 = computeSheetLayout(edited, t1, {})
check('修改一条标本记录后其余标签沿用缓存', l6.reused === 63, `reused=${l6.reused}`)

// ---------- 2. 版本迁移 + 乐观并发 ----------
console.log('2. 模板版本与并发')
const KEY = 'pair-wise-yy-15-label-studio'
// 旧数据：无 version 字段
const legacyTemplate = { ...DEFAULT_TEMPLATE }
delete (legacyTemplate as any).version
storageData.set(KEY, JSON.stringify({
  specimens: createMockSpecimens(5),
  templates: [legacyTemplate],
  activeTemplateId: legacyTemplate.id,
}))

const { useLabelStore } = await import('../src/stores/labelStore')
setActivePinia(createPinia())
const store = useLabelStore()
check('旧模板迁移为初始版本 v1', store.templates[0].version === 1)
check('迁移标记已置位', store.migratedLegacy === true)
const persistedAfterMigration = JSON.parse(storageData.get(KEY)!)
check('迁移结果已回写存储', persistedAfterMigration.templates[0].version === 1)

// 正常保存 → 版本 +1
const r1 = store.updateTemplate({ columns: 3 })
check('正常保存生效', r1 === 'saved' && store.activeTemplate.columns === 3 && store.activeTemplate.version === 2)

// 模拟另一窗口先保存（直接改写 localStorage 为 v3）
const otherTab = JSON.parse(storageData.get(KEY)!)
otherTab.templates[0].version = 3
otherTab.templates[0].columns = 6
storageData.set(KEY, JSON.stringify(otherTab))

// 本窗口随后保存 → 冲突副本，先保存的 v3 生效
const r2 = store.updateTemplate({ columns: 2 })
check('后到保存转为冲突副本', r2 === 'conflict')
check('原模板保持先保存的 v3 / 6 栏', store.activeTemplate.version === 3 && store.activeTemplate.columns === 6)
const copy = store.templates.find((t) => t.conflictOf === store.activeTemplateId)
check('冲突副本已保留（含本次修改 columns=2）', !!copy && copy.columns === 2 && copy.version === 1)
check('冲突副本未成为使用中模板', store.activeTemplateId !== copy?.id)
check('冲突提醒已产生', !!store.conflictNotice)

// 冲突后基准已对齐，下一次保存正常生效
const r3 = store.updateTemplate({ rowGapMm: 3 })
check('冲突收敛后再次保存正常', r3 === 'saved' && store.activeTemplate.version === 4)

// 模拟 storage 事件收敛
const remote = JSON.parse(storageData.get(KEY)!)
remote.templates[0].version = 9
remote.templates[0].paperWidthMm = 420
storageData.set(KEY, JSON.stringify(remote))
storageListeners.forEach((fn) => fn({ key: KEY, newValue: storageData.get(KEY) }))
check('收到其他窗口更改后收敛', store.activeTemplate.version === 9 && store.activeTemplate.paperWidthMm === 420)
const r4 = store.updateTemplate({ columns: 5 })
check('收敛后保存基于新版本', r4 === 'saved' && store.activeTemplate.version === 10)

// ---------- 3. 单标签锁定持久化 ----------
console.log('3. 标签锁定')
const sid = store.specimens[0].id
store.setLabelOverride(sid, { fontSizePt: 6.5, noWrap: true })
check('锁定已生效', store.labelOverrides[sid]?.fontSizePt === 6.5 && store.labelOverrides[sid]?.noWrap === true)
const layoutAfterLock = store.sheetLayout
check('引擎使用锁定字号', layoutAfterLock.metrics[sid].fontSizePt === 6.5 && layoutAfterLock.metrics[sid].wrap === false)
store.setLabelOverride(sid, { fontSizePt: undefined, noWrap: false })
check('清除锁定后记录移除', !(sid in store.labelOverrides))

console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`)
process.exit(failures === 0 ? 0 : 1)
