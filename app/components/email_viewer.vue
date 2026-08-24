<template>
  <v-dialog v-model="dialog" max-width="800px" scrollable>
    <v-card v-if="email" class="rounded-lg">
      <v-card-title class="d-flex align-center justify-space-between bg-surface-variant pa-4">
        <span class="text-h6 font-weight-bold text-truncate ms-2">
          {{ email.subject || t('table.email.no_subject') }}
        </span>
        <v-btn icon="mdi-close" variant="text" size="small" @click="dialog = false" />
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4" style="max-height: 70vh;">
        <div class="d-flex flex-column gap-2 mb-4">
          <div class="d-flex align-baseline">
            <span class="font-weight-medium text-caption text-uppercase me-2 text-medium-emphasis" style="min-width: 100px;">
              {{ t('table.email.from') }}:
            </span>
            <span class="text-body-2 font-weight-semibold">{{ email.from }}</span>
          </div>

          <div class="d-flex align-baseline">
            <span class="font-weight-medium text-caption text-uppercase me-2 text-medium-emphasis" style="min-width: 100px;">
              {{ t('table.email.to') }}:
            </span>
            <span class="text-body-2">{{ email.to }}</span>
          </div>

          <div class="d-flex align-baseline">
            <span class="font-weight-medium text-caption text-uppercase me-2 text-medium-emphasis" style="min-width: 100px;">
              {{ t('table.email.subject') }}:
            </span>
            <span class="text-body-2 font-weight-medium">{{ email.subject }}</span>
          </div>

          <div class="d-flex align-baseline">
            <span class="font-weight-medium text-caption text-uppercase me-2 text-medium-emphasis" style="min-width: 100px;">
              {{ t('table.email.messageId') }}:
            </span>
            <code class="text-caption bg-surface pa-1 rounded" style="word-break: break-all;">
              {{ email.messageId || email.message_id || 'N/A' }}
            </code>
          </div>

          <div v-if="email.date" class="d-flex align-baseline">
            <span class="font-weight-medium text-caption text-uppercase me-2 text-medium-emphasis" style="min-width: 100px;">
              {{ t('table.email.date') }}:
            </span>
            <span class="text-caption text-medium-emphasis">{{ new Date(email.date).toLocaleString() }}</span>
          </div>
        </div>

        <v-divider class="my-3" />

        <div class="email-body-container pt-2">
          <div v-if="email.html" class="email-html-content pa-2" v-html="email.html"></div>
          <div v-else class="email-text-content pa-2 text-body-2" style="white-space: pre-wrap; font-family: inherit;">
            {{ email.text }}
          </div>
        </div>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-3 justify-end bg-surface-variant">
        <v-btn color="primary" variant="flat" @click="dialog = false">
          {{ t('table.common.close') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
  email: Record<string, any> | null
}>()

const emit = defineEmits(['update:modelValue'])

const dialog = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val)
})
</script>

<style scoped>
.email-body-container {
  overflow-x: auto;
}
.email-html-content {
  line-height: 1.6;
}
</style>
