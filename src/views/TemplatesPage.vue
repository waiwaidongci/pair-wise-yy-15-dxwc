<script setup lang="ts">
import { computed, ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { CopyIcon, DeleteIcon, Edit1Icon } from 'tdesign-icons-vue-next'
import { useLabelStore } from '../stores/labelStore'
import LabelSheet from '../components/LabelSheet.vue'
import { barcodeLabel, labelsPerPage } from '../utils/layout'

const store = useLabelStore()
const createOpen = ref(false)
const templateName = ref('')
const previewTemplateId = ref(store.activeTemplateId)
const previewTemplate = () => store.templates.find((item) => item.id === previewTemplateId.value) ?? store.activeTemplate
const conflictCount = computed(() => store.templates.filter((item) => item.name.endsWith('冲突副本')).length)

function saveTemplate() {
  store.saveAsTemplate(templateName.value)
  previewTemplateId.value = store.activeTemplateId
  createOpen.value = false
  templateName.value = ''
  MessagePlugin.success('模板已保存')
}
</script>

<template>
  <div class="page-stack">
    <section class="page-heading">
      <div>
        <h2>标签模板库</h2>
        <p>保存不同馆藏和纸张规格的排版方案，应用到当前批次后可继续微调。</p>
      </div>
      <t-space>
        <t-tag v-if="conflictCount" theme="warning" variant="light">{{ conflictCount }} 份冲突副本</t-tag>
        <t-button theme="primary" @click="createOpen = true">从当前模板新建</t-button>
      </t-space>
    </section>

    <t-alert
      v-if="store.remoteOutdated"
      class="remote-alert"
      theme="warning"
      message="其他标签页已保存该模板的新版本"
      description="本页工作副本已落后，继续保存将生成冲突副本。可刷新同步后再编辑。"
    >
      <template #action>
        <t-button size="small" variant="outline" @click="store.refreshFromRemote()">刷新同步</t-button>
      </template>
    </t-alert>

    <section class="template-grid">
      <article
        v-for="template in store.templates"
        :key="template.id"
        class="template-card"
        :class="{ 'template-card--active': template.id === store.activeTemplateId, 'template-card--conflict': template.name.endsWith('冲突副本') }"
      >
        <div class="template-card__preview">
          <div class="mini-page" :style="{ aspectRatio: `${template.paperWidthMm} / ${template.paperHeightMm}` }">
            <span v-for="index in template.columns * 3" :key="index" />
          </div>
        </div>
        <div class="template-card__body">
          <div class="template-card__title">
            <strong>{{ template.name }}</strong>
            <t-space size="4">
              <t-tag size="small" theme="primary" variant="light">v{{ template.version }}</t-tag>
              <t-tag v-if="template.id === store.activeTemplateId" size="small" theme="success" variant="light">使用中</t-tag>
            </t-space>
          </div>
          <div class="template-meta">
            <span>{{ template.paperWidthMm }} × {{ template.paperHeightMm }} mm</span>
            <span>{{ template.columns }} 栏 / {{ labelsPerPage(template) }} 张每页</span>
            <span>{{ template.fontSizePt }}pt / {{ barcodeLabel(template.barcodeMode) }}</span>
          </div>
          <div class="template-actions">
            <t-button
              size="small"
              variant="outline"
              :disabled="template.id === store.activeTemplateId"
              @click="store.activateTemplate(template.id); MessagePlugin.success('已应用模板')"
            >
              应用
            </t-button>
            <t-button size="small" variant="text" @click="previewTemplateId = template.id; store.activateTemplate(template.id)">
              <Edit1Icon />编辑
            </t-button>
            <t-button size="small" variant="text" @click="store.duplicateTemplate(template.id); MessagePlugin.success('已复制模板')">
              <CopyIcon />复制
            </t-button>
            <t-button
              size="small"
              theme="danger"
              variant="text"
              :disabled="store.templates.length <= 1"
              @click="store.removeTemplate(template.id)"
            >
              <DeleteIcon />删除
            </t-button>
          </div>
        </div>
      </article>
    </section>

    <section class="content-card template-preview-card">
      <div class="section-heading">
        <div><strong>模板缩略比例预览</strong><span>{{ previewTemplate().name }}</span></div>
      </div>
      <div class="mini-sheet-stage">
        <div class="mini-sheet-scale">
          <LabelSheet
            :specimens="store.specimens.slice(0, labelsPerPage(previewTemplate()))"
            :template="previewTemplate()"
          />
        </div>
      </div>
    </section>

    <t-dialog
      v-model:visible="createOpen"
      header="新建标签模板"
      width="480px"
      :confirm-btn="{ content: '保存模板', theme: 'primary' }"
      @confirm="saveTemplate"
    >
      <t-input v-model="templateName" label="模板名称" placeholder="例如：小号采集标签 · 六栏" />
    </t-dialog>
  </div>
</template>
