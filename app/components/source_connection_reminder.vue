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
// "No mailbox connected" reminder, mounted on every page (layouts/default.vue). After login it lists the user's
// sources; when there is none besides the built-in staging source, a dialog points to the Sources page. Dismissing it
// (OK or the Sources link) hides it for the rest of the browser session (sessionStorage); a new tab or login shows it
// again until a source exists.
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

    const res: any = await apiGet('/api/v0.1/app/sources');
    const rows = res?.data ?? res;
    // The built-in staging source doesn't count: the reminder is about a real mailbox
    const list = (Array.isArray(rows) ? rows : (rows ? [rows] : [])).filter((s: any) => s.type !== 'staging');

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
