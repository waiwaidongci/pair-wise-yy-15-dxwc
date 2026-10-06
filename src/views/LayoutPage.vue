<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useLabelStore } from '../stores/labelStore'
import LabelSheet from '../components/LabelSheet.vue'
import type { BorderStyle } from '../types/label'
import { barcodeLabel, labelInnerWidth } from '../utils/layout'

const store = useLabelStore()
const zoom = ref(0.68)
const selectedSpecimenId = ref('')
const layout = computed(() => store.sheetLayout)
const previewSpecimens = computed(() =>
  store.selectedSpecimenIds.length
    ? store.specimens.filter((item) => store.selectedSpecimenIds.includes(item.id))
    : (layout.value.pages[0] ?? []),
)
const template = computed(() => store.activeTemplate)
const selectedSpecimen = computed(() =>
  store.specimens.find((item) => item.id === selectedSpecimenId.value),
)
const selectedOverride = computed(() =>
  selectedSpecimenId.value ? store.labelOverrides[selectedSpecimenId.value] : undefined,
)

watch(
  () => template.value.id,
  () => {
    const value = Number(localStorage.getItem(`label-zoom-${template.value.id}`))
    if (value >= 0.35 && value <= 1.2) zoom.value = value
  },
  { immediate: true },
)

function updateNumber(key: keyof typeof template.value, value: number | string) {
  store.updateTemplate({ [key]: Number(value) })
}

function updateBoolean(key: keyof typeof template.value, value: string | number | boolean) {
  store.updateTemplate({ [key]: Boolean(value) })
}

function setZoom(value: number) {
  zoom.value = Math.min(1.2, Math.max(0.35, value))
  localStorage.setItem(`label-zoom-${template.value.id}`, String(zoom.value))
}

function toggleFontLock(locked: boolean) {
  if (!selectedSpecimen.value) return
  store.setLabelOverride(selectedSpecimen.value.id, {
    fontSizePt: locked ? template.value.fontSizePt : undefined,
  })
}

function setLockedFontSize(value: number) {
  if (!selectedSpecimen.value || !Number.isFinite(value)) return
  store.setLabelOverride(selectedSpecimen.value.id, { fontSizePt: value })
}

function toggleNoWrap(locked: boolean) {
  if (!selectedSpecimen.value) return
  store.setLabelOverride(selectedSpecimen.value.id, { noWrap: locked })
}

function clearLock() {
  if (!selectedSpecimen.value) return
  store.clearLabelOverride(selectedSpecimen.value.id)
  MessagePlugin.success('已清除该标签的锁定')
}
</script>

<template>
  <div class="page-grid layout-page">
    <section class="control-panel">
      <div class="panel-heading">
        <div>
          <span>模板参数 · v{{ template.version }}</span>
          <strong>{{ template.name }}</strong>
        </div>
        <t-button size="small" variant="outline" @click="store.saveAsTemplate(`标签模板 ${store.templates.length + 1}`); MessagePlugin.success('已另存为新模板')">
          另存模板
        </t-button>
      </div>
      <t-form label-align="left" label-width="92px" size="small">
        <t-form-item label="纸张宽 mm">
          <t-input-number
            :model-value="template.paperWidthMm"
            :min="50"
            :max="600"
            :step="1"
            theme="column"
            @change="(value: any) => updateNumber('paperWidthMm', value as number)"
          />
        </t-form-item>
        <t-form-item label="纸张高 mm">
          <t-input-number
            :model-value="template.paperHeightMm"
            :min="50"
            :max="600"
            :step="1"
            theme="column"
            @change="(value: any) => updateNumber('paperHeightMm', value as number)"
          />
        </t-form-item>
        <div class="field-caption">边距（毫米）</div>
        <div class="two-column">
          <t-input-number
            label="上"
            :model-value="template.marginTopMm"
            :min="0"
            :max="50"
            :step="0.5"
            @change="(value: any) => updateNumber('marginTopMm', value as number)"
          />
          <t-input-number
            label="右"
            :model-value="template.marginRightMm"
            :min="0"
            :max="50"
            :step="0.5"
            @change="(value: any) => updateNumber('marginRightMm', value as number)"
          />
          <t-input-number
            label="下"
            :model-value="template.marginBottomMm"
            :min="0"
            :max="50"
            :step="0.5"
            @change="(value: any) => updateNumber('marginBottomMm', value as number)"
          />
          <t-input-number
            label="左"
            :model-value="template.marginLeftMm"
            :min="0"
            :max="50"
            :step="0.5"
            @change="(value: any) => updateNumber('marginLeftMm', value as number)"
          />
        </div>
        <div class="two-column">
          <t-input-number
            label="栏数"
            :model-value="template.columns"
            :min="1"
            :max="8"
            :step="1"
            @change="(value: any) => updateNumber('columns', value as number)"
          />
          <t-input-number
            label="行高 mm"
            :model-value="template.rowHeightMm"
            :min="10"
            :max="80"
            :step="0.5"
            @change="(value: any) => updateNumber('rowHeightMm', value as number)"
          />
          <t-input-number
            label="栏间距"
            :model-value="template.columnGapMm"
            :min="0"
            :max="20"
            :step="0.5"
            @change="(value: any) => updateNumber('columnGapMm', value as number)"
          />
          <t-input-number
            label="行间距"
            :model-value="template.rowGapMm"
            :min="0"
            :max="20"
            :step="0.5"
            @change="(value: any) => updateNumber('rowGapMm', value as number)"
          />
          <t-input-number
            label="行距 mm"
            :model-value="template.lineHeightMm"
            :min="2"
            :max="12"
            :step="0.1"
            @change="(value: any) => updateNumber('lineHeightMm', value as number)"
          />
          <t-input-number
            label="字号 pt"
            :model-value="template.fontSizePt"
            :min="4"
            :max="18"
            :step="0.5"
            @change="(value: any) => updateNumber('fontSizePt', value as number)"
          />
        </div>
        <div class="two-column">
          <t-input-number
            label="边框 mm"
            :model-value="template.borderWidthMm"
            :min="0"
            :max="2"
            :step="0.1"
            @change="(value: any) => updateNumber('borderWidthMm', value as number)"
          />
          <t-select
            :model-value="template.borderStyle"
            @change="(value: any) => store.updateTemplate({ borderStyle: value as BorderStyle })"
          >
            <t-option value="solid" label="实线" />
            <t-option value="dashed" label="虚线" />
            <t-option value="dotted" label="点线" />
          </t-select>
        </div>
        <t-form-item label="标签识别">
          <t-radio-group
            :model-value="template.barcodeMode"
            variant="default-filled"
            @change="(value: any) => store.updateTemplate({ barcodeMode: value as typeof template.barcodeMode })"
          >
            <t-radio-button value="qr">二维码</t-radio-button>
            <t-radio-button value="code128">条码</t-radio-button>
            <t-radio-button value="none">不打印</t-radio-button>
          </t-radio-group>
        </t-form-item>
        <div class="switch-row">
          <t-checkbox
            :checked="template.italicScientific"
            @change="(value: any) => updateBoolean('italicScientific', value)"
          >
            拉丁学名斜体
          </t-checkbox>
          <t-checkbox
            :checked="template.includeCollection"
            @change="(value: any) => updateBoolean('includeCollection', value)"
          >
            采集信息
          </t-checkbox>
          <t-checkbox
            :checked="template.includeHabitat"
            @change="(value: any) => updateBoolean('includeHabitat', value)"
          >
            生境
          </t-checkbox>
          <t-checkbox
            :checked="template.includeNotes"
            @change="(value: any) => updateBoolean('includeNotes', value)"
          >
            备注
          </t-checkbox>
        </div>
      </t-form>

      <div class="lock-panel">
        <div class="field-caption">单标签锁定（在预览中点击标签选定）</div>
        <template v-if="selectedSpecimen">
          <div class="lock-panel__target">
            <strong>{{ selectedSpecimen.accessionNo || '编号待补' }}</strong>
            <span>{{ selectedSpecimen.scientificName || '学名待补' }}</span>
          </div>
          <div class="lock-panel__row">
            <t-checkbox
              :checked="selectedOverride?.fontSizePt != null"
              @change="(value: any) => toggleFontLock(Boolean(value))"
            >
              锁定学名字号
            </t-checkbox>
            <t-input-number
              v-if="selectedOverride?.fontSizePt != null"
              :model-value="selectedOverride.fontSizePt"
              :min="4"
              :max="18"
              :step="0.5"
              size="small"
              @change="(value: any) => setLockedFontSize(Number(value))"
            />
          </div>
          <t-checkbox
            :checked="Boolean(selectedOverride?.noWrap)"
            @change="(value: any) => toggleNoWrap(Boolean(value))"
          >
            锁定换行（学名保持单行）
          </t-checkbox>
          <t-button size="small" variant="text" theme="danger" :disabled="!selectedOverride" @click="clearLock">
            清除该标签锁定
          </t-button>
        </template>
        <p v-else class="lock-panel__hint">未选定标签。已锁定 {{ store.lockedCount }} 张，锁定的标签不随模板字号与换行规则变化。</p>
      </div>

      <div class="layout-summary">
        <span>单张标签宽 <strong>{{ labelInnerWidth(template).toFixed(1) }} mm</strong></span>
        <span>每页行数 <strong>{{ layout.rows }}</strong></span>
        <span>每页容量 <strong>{{ layout.perPage }}</strong></span>
        <span>整批页数 <strong>{{ layout.pageCount }}</strong></span>
        <span>识别方式 <strong>{{ barcodeLabel(template.barcodeMode) }}</strong></span>
        <span>
          溢出提醒
          <strong :class="{ 'summary-warn': layout.issues.length }">{{ layout.issues.length }} 条</strong>
        </span>
        <span>本次重算 <strong>{{ store.specimens.length - layout.reused }} 张</strong></span>
        <span>沿用缓存 <strong>{{ layout.reused }} 张</strong></span>
      </div>
    </section>

    <section class="preview-panel">
      <div class="preview-toolbar">
        <div>
          <strong>实时版面预览</strong>
          <span>纸张与标签均按真实毫米尺寸渲染，红框为溢出或截断</span>
        </div>
        <div class="zoom-tools">
          <t-button size="small" variant="outline" @click="setZoom(zoom - 0.08)">−</t-button>
          <span>{{ Math.round(zoom * 100) }}%</span>
          <t-button size="small" variant="outline" @click="setZoom(zoom + 0.08)">＋</t-button>
          <t-button size="small" variant="outline" @click="setZoom(1)">100%</t-button>
        </div>
      </div>
      <div class="preview-stage">
        <div class="preview-scaler" :style="{ transform: `scale(${zoom})` }">
          <LabelSheet
            :specimens="previewSpecimens"
            :template="template"
            :overrides="store.labelOverrides"
            :metrics="layout.metrics"
            :selected-id="selectedSpecimenId"
            @select="(specimen) => (selectedSpecimenId = specimen.id)"
          />
        </div>
      </div>
      <div class="preview-footnote">
        预览第 1 页，共 {{ Math.max(1, Math.ceil(previewSpecimens.length / layout.perPage)) }} 页
      </div>
    </section>
  </div>
</template>

<style scoped>
.lock-panel { margin-top: 14px; padding-top: 4px; }
.lock-panel__target { display: grid; gap: 2px; margin-bottom: 8px; }
.lock-panel__target strong { color: #2d4433; font-size: 12px; }
.lock-panel__target span { color: #8b998e; font-size: 10px; font-style: italic; }
.lock-panel__row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.lock-panel__row .t-input-number { width: 110px; }
.lock-panel__hint { margin: 0; color: #8b998e; font-size: 11px; line-height: 1.7; }
.summary-warn { color: #b74343 !important; }
</style>
