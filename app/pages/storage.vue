<template>
  <v-container class="d-flex flex-column ga-5 py-8" style="max-width: 900px;">
    <h2 class="text-h5 font-weight-bold align-self-start mb-2">{{ t('storage.title') }}</h2>
    <v-card variant="outlined" class="w-100">
      <v-progress-linear v-if="!usage" indeterminate color="primary" />
      <template v-else>
        <v-card-item>
          <v-card-title class="text-body-1">{{ t('storage.files') }}</v-card-title>
          <v-card-subtitle>{{ t('storage.of_quota', { used: formatSize(usage.files.bytes), limit: formatSize(usage.files.limit_bytes) }) }}</v-card-subtitle>
        </v-card-item>
        <v-card-text>
          <v-progress-linear :model-value="percent" :color="percent >= 90 ? 'error' : 'primary'" height="8" rounded class="storage-quota" />
        </v-card-text>
        <v-divider />
        <v-list density="compact">
          <v-list-item v-for="row in rows" :key="row.key" :prepend-icon="row.icon" :title="t(`storage.${row.key}`)" :subtitle="t('storage.count', { count: row.count })">
            <template #append>
              <span class="text-body-2 font-weight-medium" :data-category="row.key">{{ formatSize(row.bytes) }}</span>
            </template>
          </v-list-item>
        </v-list>
        <v-card-text class="text-caption text-medium-emphasis pt-0">{{ t('storage.note') }}</v-card-text>
      </template>
    </v-card>
  </v-container>
</template>

<script setup lang="ts">
// What the user stores, per category, and the quota over all files (limits.files.max_user_mb). Totals only: space is
// freed by source pruning, artifact retention and the deletes on the emails and artifacts pages.
import { formatSize } from '~/components/media_viewer/renderers';
import { apiGet } from '#ba/utils/fetch/wrappers';

interface Usage {
  emails: { bytes: number; count: number };
  attachments: { bytes: number; count: number };
  artifacts: { bytes: number; count: number };
  files: { bytes: number; limit_bytes: number };
}

const { t } = useI18n();
const usage = ref<Usage | null>(null);

const percent = computed(() => (usage.value ? Math.min(100, (usage.value.files.bytes / Math.max(usage.value.files.limit_bytes, 1)) * 100) : 0));
const rows = computed(() => (usage.value ? [
  { key: 'emails', icon: 'mdi-email-outline', ...usage.value.emails },
  { key: 'attachments', icon: 'mdi-paperclip', ...usage.value.attachments },
  { key: 'artifacts', icon: 'mdi-file-multiple-outline', ...usage.value.artifacts },
] : []));

onMounted(async () => {
  usage.value = (await apiGet<any>('/api/v0.1/app/storage'))?.data ?? null;
});
</script>
