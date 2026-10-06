<script setup lang="ts">
import { computed } from 'vue'
import type { LabelMetrics, LabelOverride, LabelTemplate, Specimen } from '../types/label'
import { formatDate } from '../utils/layout'
import { computeLabelMetrics } from '../utils/layoutEngine'
import BarcodeMark from './BarcodeMark.vue'

const props = defineProps<{
  specimen: Specimen
  template: LabelTemplate
  override?: LabelOverride
  metrics?: LabelMetrics
  selected?: boolean
}>()

const metrics = computed(
  () => props.metrics ?? computeLabelMetrics(props.specimen, props.template, props.override),
)
const overflowing = computed(() => metrics.value.overflowMm > 0.05 || metrics.value.truncated)
const style = computed(() => ({
  borderWidth: `${props.template.borderWidthMm}mm`,
  borderStyle: props.template.borderStyle,
  fontSize: `${props.template.fontSizePt}pt`,
  lineHeight: `${props.template.lineHeightMm}mm`,
  gridTemplateColumns:
    props.template.barcodeMode === 'none' ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) 14mm',
}))
</script>

<template>
  <article
    class="label-item"
    :class="{ 'label-item--overflow': overflowing, 'label-item--selected': selected }"
    :style="style"
  >
    <div class="label-item__main">
      <div class="label-item__top">
        <strong>{{ specimen.taxonName || '待鉴定类群' }}</strong>
        <span>{{ specimen.accessionNo || '编号待补' }}</span>
      </div>
      <div
        class="label-item__scientific"
        :class="{ 'label-item__scientific--nowrap': !metrics.wrap }"
        :style="{
          fontSize: `${metrics.fontSizePt}pt`,
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
    <i v-if="metrics.locked" class="label-item__lock" title="已锁定字号或换行">锁</i>
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
.label-item__scientific--nowrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label-item__line { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.label-item__mark { display: grid; min-width: 0; place-items: center; }
.label-item__mark :deep(.barcode-mark) { display: block; width: 100%; height: 15mm; object-fit: contain; }
.label-item--overflow { outline: 1.5px dashed #c45a4a; outline-offset: -1.5px; }
.label-item--selected { outline: 1.5px solid #2c8b61; outline-offset: -1.5px; }
.label-item__lock {
  position: absolute;
  top: .6mm;
  right: .6mm;
  padding: 0 .8mm;
  border-radius: 1mm;
  background: rgba(44, 139, 97, .9);
  color: #fff;
  font-size: 5pt;
  font-style: normal;
  line-height: 2.6mm;
}
@media print {
  .label-item--overflow, .label-item--selected { outline: none; }
  .label-item__lock { display: none; }
}
</style>
