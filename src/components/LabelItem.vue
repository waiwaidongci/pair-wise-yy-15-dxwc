<script setup lang="ts">
import { computed } from 'vue'
import type { LabelTemplate, Specimen } from '../types/label'
import { effectiveLabelLayout, formatDate, labelOverflow } from '../utils/layout'
import BarcodeMark from './BarcodeMark.vue'

const props = defineProps<{
  specimen: Specimen
  template: LabelTemplate
  /** 是否显示字号/换行锁定按钮 */
  lockable?: boolean
}>()

const layout = computed(() => effectiveLabelLayout(props.specimen, props.template))
const overflow = computed(() => labelOverflow(props.specimen, props.template))
const style = computed(() => ({
  borderWidth: `${props.template.borderWidthMm}mm`,
  borderStyle: props.template.borderStyle,
  fontSize: `${layout.value.fontSizePt}pt`,
  lineHeight: `${layout.value.lineHeightMm}mm`,
  gridTemplateColumns:
    props.template.barcodeMode === 'none' ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 14mm',
}))

const emit = defineEmits<{
  (e: 'toggle-lock', specimen: Specimen): void
}>()

function toggleLock() {
  emit('toggle-lock', props.specimen)
}
</script>

<template>
  <article class="label-item" :class="{ 'label-item--locked': layout.locked, 'label-item--overflow': overflow }" :style="style">
    <button
      v-if="lockable"
      type="button"
      class="label-item__lock"
      :class="{ 'label-item__lock--on': layout.locked }"
      :title="layout.locked ? '字号与换行已锁定，点击解除' : '锁定当前字号与换行'"
      @click.stop="toggleLock"
    >
      <svg v-if="layout.locked" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </svg>
      <svg v-else viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="10" width="16" height="10" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 7.5-2" />
      </svg>
    </button>
    <div class="label-item__main">
      <div class="label-item__top">
        <strong>{{ specimen.taxonName || '待鉴定类群' }}</strong>
        <span>{{ specimen.accessionNo || '编号待补' }}</span>
      </div>
      <div
        class="label-item__scientific"
        :style="{
          fontSize: `${layout.fontSizePt}pt`,
          fontStyle: template.italicScientific ? 'italic' : 'normal',
        }"
      >
        {{ specimen.scientificName || '学名待补' }}
      </div>
      <div v-if="template.includeCollection" class="label-item__line">{{ specimen.locality || '采集地待补' }}</div>
      <div v-if="template.includeCollection" class="label-item__line">
        {{ formatDate(specimen.collectedAt) }} · {{ specimen.collector || '采集人待补' }}
        <template v-if="template.includeHabitat && specimen.habitat"> · {{ specimen.habitat }}</template>
      </div>
      <div v-if="template.includeNotes && specimen.notes" class="label-item__line">
        {{ specimen.notes }}
      </div>
    </div>
    <div class="label-item__mark" v-if="template.barcodeMode !== 'none'">
      <BarcodeMark :value="specimen.accessionNo" :mode="template.barcodeMode" />
    </div>
  </article>
</template>

<style scoped>
.label-item {
  display: grid;
  position: relative;
  min-width: 0;
  min-height: 0;
  padding: 1.3mm 1.5mm;
  gap: 1mm;
  overflow: hidden;
  border-color: #222;
  color: #141414;
  font-family: "Songti SC", "SimSun", serif;
}
.label-item--locked { box-shadow: inset 0 0 0 1px rgba(185, 156, 83, .55); }
.label-item--overflow { box-shadow: inset 0 0 0 1px rgba(183, 67, 67, .45); }
.label-item__lock {
  position: absolute;
  top: 1px;
  right: 1px;
  z-index: 2;
  display: grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: rgba(255, 255, 255, .82);
  color: #9aa89d;
  cursor: pointer;
  opacity: 0;
  transition: opacity .15s ease, color .15s ease;
}
.label-item:hover .label-item__lock { opacity: 1; }
.label-item__lock--on { opacity: 1; color: #a8842f; background: rgba(255, 248, 230, .95); }
.label-item__lock:hover { color: #5b7063; }
.label-item__main { min-width: 0; overflow: hidden; }
.label-item__top { display: flex; justify-content: space-between; gap: .8mm; white-space: nowrap; }
.label-item__top strong { overflow: hidden; text-overflow: ellipsis; }
.label-item__top span { font-family: Menlo, monospace; font-size: .78em; }
.label-item__scientific {
  min-height: 3.5mm;
  font-family: "Times New Roman", serif;
  line-height: 3.5mm;
  white-space: normal;
  overflow-wrap: anywhere;
}
.label-item__line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label-item__mark { display: grid; min-width: 0; place-items: center; }
.label-item__mark :deep(.barcode-mark) { display: block; width: 100%; height: 15mm; object-fit: contain; }
</style>
