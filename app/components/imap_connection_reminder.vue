<template>
  <v-dialog v-model="dialog" max-width="500" persistent>
    <v-card class="rounded-xl pa-2 pa-sm-4 elevation-6">
      <v-card-item class="pb-2">
        <template #prepend>
          <v-avatar color="primary" variant="tonal" size="48" class="me-3">
            <v-icon size="28" color="primary">mdi-email-sync-outline</v-icon>
          </v-avatar>
        </template>
        <v-card-title class="text-h6 font-weight-bold">
          {{ $t('imap_reminder.title') }}
        </v-card-title>
      </v-card-item>

      <v-card-text class="text-body-1 text-medium-emphasis pt-2 pb-4">
        {{ $t('imap_reminder.message_prefix') }}
        <NuxtLink
          to="/sources"
          class="text-primary font-weight-bold text-decoration-underline cursor-pointer"
          @click="handleSourcesClick"
        >
          {{ $t('imap_reminder.sources_link') }}
        </NuxtLink>
        {{ $t('imap_reminder.message_suffix') }}
      </v-card-text>

      <v-card-actions class="px-4 pb-2 pt-0 justify-end">
        <v-btn
          color="primary"
          variant="flat"
          rounded="pill"
          class="px-6 font-weight-medium text-capitalize"
          @click="dismiss"
        >
          {{ $t('imap_reminder.ok') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { apiGet } from '#ba/utils/fetch/wrappers';

const SESSION_KEY = 'twinbox_imap_reminder_dismissed';

const dialog = ref(false);
const { loggedIn } = useUserSession();

const checkImapConnections = async () => {
  if (!import.meta.client) return;
  if (!loggedIn.value) return;

  try {
    const isDismissed = sessionStorage.getItem(SESSION_KEY);
    if (isDismissed === 'true') {
      return;
    }

    const res: any = await apiGet('/api/v0.1/app/connections_imap');
    const connections = res?.data ?? res;
    const list = Array.isArray(connections) ? connections : (connections ? [connections] : []);

    if (list.length === 0) {
      dialog.value = true;
    }
  } catch (err) {
    console.error('Failed to check IMAP connections for reminder:', err);
  }
};

const dismiss = () => {
  if (import.meta.client) {
    sessionStorage.setItem(SESSION_KEY, 'true');
  }
  dialog.value = false;
};

const handleSourcesClick = () => {
  dismiss();
};

onMounted(() => {
  checkImapConnections();
});

watch(loggedIn, (isLoggedIn) => {
  if (isLoggedIn) {
    checkImapConnections();
  } else {
    dialog.value = false;
  }
});
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
