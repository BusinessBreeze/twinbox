<template>
  <div class="d-flex align-center ga-3 mb-6">
    <!-- Export Button -->
    <v-btn
      color="primary"
      variant="tonal"
      prepend-icon="mdi-download"
      :loading="loadingExport"
      :disabled="loadingImport"
      @click="exportAllData"
    >
      {{ t('userinfo_import_export.export_button') }}
    </v-btn>

    <!-- Import Button -->
    <v-btn
      color="secondary"
      variant="tonal"
      prepend-icon="mdi-upload"
      :loading="loadingImport"
      :disabled="loadingExport"
      @click="triggerFileInput"
    >
      {{ t('userinfo_import_export.import_button') }}
    </v-btn>

    <!-- Hidden File Input for Import -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,application/json"
      class="d-none"
      @change="handleFileSelected"
    />

    <!-- Feedback Snackbar -->
    <v-snackbar
      v-model="snackbar.show"
      :color="snackbar.color"
      timeout="4000"
    >
      {{ snackbar.text }}
      <template #actions>
        <v-btn
          variant="text"
          size="small"
          @click="snackbar.show = false"
        >
          {{ t('table.common.close') }}
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost } from '#ba/util/fetch/wrappers';

const { t } = useI18n();

const loadingExport = ref(false);
const loadingImport = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);

const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
});

const showSnackbar = (text: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = {
    show: true,
    text,
    color
  };
};

const triggerFileInput = () => {
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
    fileInputRef.value.click();
  }
};

const exportAllData = async () => {
  loadingExport.value = true;
  try {
    const [connRes, searchRes, filterRes, artifactRes, autoRes, notifRes] = await Promise.all([
      apiGet('/api/v0.1/app/connections_imap/export'),
      apiGet('/api/v0.1/app/imap_search/export'),
      apiGet('/api/v0.1/app/llm_filter/export'),
      apiGet('/api/v0.1/app/llm_create_artifact/export'),
      apiGet('/api/v0.1/app/automation/export'),
      apiGet('/api/user/notification/export')
    ]);

    const backupBundle = {
      version: 'v0.1',
      type: 'user_info_backup',
      timestamp: new Date().toISOString(),
      tables: {
        notification_channels: notifRes?.data?.data !== undefined ? notifRes.data.data : (notifRes?.data || []),
        connections_imap: connRes?.data?.data !== undefined ? connRes.data.data : (connRes?.data || []),
        imap_search: searchRes?.data?.data !== undefined ? searchRes.data.data : (searchRes?.data || []),
        llm_filter: filterRes?.data?.data !== undefined ? filterRes.data.data : (filterRes?.data || []),
        llm_create_artifact: artifactRes?.data?.data !== undefined ? artifactRes.data.data : (artifactRes?.data || []),
        automations: autoRes?.data?.data !== undefined ? autoRes.data.data : (autoRes?.data || [])
      }
    };

    const jsonStr = JSON.stringify(backupBundle, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date().toISOString().split('T')[0];
    const link = document.createElement('a');
    link.href = url;
    link.download = `user_info_backup_${dateStr}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showSnackbar(t('userinfo_import_export.export_success'), 'success');
  } catch (err: any) {
    console.error('Export failed:', err);
    showSnackbar(err?.message || t('userinfo_import_export.export_failed'), 'error');
  } finally {
    loadingExport.value = false;
  }
};

const handleFileSelected = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  loadingImport.value = true;
  try {
    const text = await file.text();
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(t('userinfo_import_export.invalid_file'));
    }

    if (!parsed || typeof parsed !== 'object' || parsed.version !== 'v0.1' || !parsed.tables) {
      throw new Error(t('userinfo_import_export.invalid_file'));
    }

    const { tables } = parsed;

    // 1. Notification channels
    const notifData = tables.notification_channels || tables.notification_config;
    if (notifData && (Array.isArray(notifData) ? notifData.length > 0 : true)) {
      await apiPost('/api/user/notification/import', notifData);
    }

    // 2. Connections IMAP
    if (tables.connections_imap && (Array.isArray(tables.connections_imap) ? tables.connections_imap.length > 0 : true)) {
      await apiPost('/api/v0.1/app/connections_imap/import', tables.connections_imap);
    }

    // 3. IMAP Search
    if (tables.imap_search && (Array.isArray(tables.imap_search) ? tables.imap_search.length > 0 : true)) {
      await apiPost('/api/v0.1/app/imap_search/import', tables.imap_search);
    }

    // 4. LLM Filter
    if (tables.llm_filter && (Array.isArray(tables.llm_filter) ? tables.llm_filter.length > 0 : true)) {
      await apiPost('/api/v0.1/app/llm_filter/import', tables.llm_filter);
    }

    // 5. LLM Create Artifact
    if (tables.llm_create_artifact && (Array.isArray(tables.llm_create_artifact) ? tables.llm_create_artifact.length > 0 : true)) {
      await apiPost('/api/v0.1/app/llm_create_artifact/import', tables.llm_create_artifact);
    }

    // 6. Automations
    const automationsData = tables.automations || tables.automation;
    if (automationsData && (Array.isArray(automationsData) ? automationsData.length > 0 : true)) {
      await apiPost('/api/v0.1/app/automation/import', automationsData);
    }

    showSnackbar(t('userinfo_import_export.import_success'), 'success');
  } catch (err: any) {
    console.error('Import failed:', err);
    showSnackbar(err?.message || t('userinfo_import_export.import_failed'), 'error');
  } finally {
    loadingImport.value = false;
  }
};
</script>
