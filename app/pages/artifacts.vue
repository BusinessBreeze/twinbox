<template>
  <v-container class="d-flex flex-column align-center ga-5 py-8" style="max-width: 900px;">
    <Table :meta="artifactsMeta" class="w-100 mb-6" />
    <MediaViewer v-model="viewDialog" :title="selected?.filename" :filename="selected?.filename" :mime="selected?.mime ?? ''" :data="selected?.data ?? null" :loading="loading" />
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import artifactsMetaFcn from '~/schemas/artifacts';
import type { MediaData } from '~/components/media_viewer/renderers';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const viewDialog = ref(false);
const loading = ref(false);
const selected = ref<{ id: string; filename: string; mime: string; data: MediaData | null } | null>(null);

// The bytes of an artifact are its file (the list gives file_id, name and type)
const fileUrl = (fileId: string) => `/api/v0.1/app/files/${encodeURIComponent(fileId)}`;

const onView = async (item: any) => {
  if (!item?.id) return;
  selected.value = { id: item.id, filename: item.filename, mime: item.mime, data: null };
  viewDialog.value = true;
  loading.value = true;
  try {
    const blob = await $fetch<Blob>(fileUrl(item.file_id), { responseType: 'blob' });
    if (selected.value?.id === item.id) selected.value.data = blob;
  } catch (err) {
    console.error('Failed to load artifact content:', err);
  } finally {
    loading.value = false;
  }
};

const onDownload = (item: any) => {
  if (item?.file_id) window.open(fileUrl(item.file_id), '_blank');
};

const artifactsMeta = artifactsMetaFcn(t, { onView, onDownload });
</script>
