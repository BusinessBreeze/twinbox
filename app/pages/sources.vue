<template>
  <v-container class="d-flex flex-column ga-5 py-8" style="max-width: 900px;">
    <h2 class="text-h5 font-weight-bold align-self-start mb-2">{{ t('table.sources.title') }}</h2>
    <Table v-if="sourcesMeta" ref="sourcesTable" :meta="sourcesMeta" class="w-100 mb-6" />
  </v-container>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import sourcesMetaFcn from '~/schemas/sources'
import SourceSettingsEditor from '~/components/form_widgets/source_settings_editor.vue'
import { apiPost } from '#ba/utils/fetch/wrappers'

const { t } = useI18n()
const sourcesMeta = ref<any>(null)
const sourcesTable = ref<any>(null)

watch(() => sourcesTable.value?.formulate, (formulate) => {
  if (formulate) formulate.register('source_settings_editor', SourceSettingsEditor)
})

const onRunNow = async (item: any) => {
  try {
    await apiPost(`/api/v0.1/app/sources/${item.id}/run`, {})
  } catch (e) {
    console.error('Run now failed', e)
  }
}

onMounted(async () => {
  sourcesMeta.value = await sourcesMetaFcn(t, { onRunNow })
})
</script>
