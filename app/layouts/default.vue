<template>
  <v-app>
    <Header />
    <NavDrawer />
    <v-main>
      <slot />
    </v-main>
    <Footer />
    <Alert />
    <ImapConnectionReminder />
  </v-app>
</template>

<script setup lang="ts">
import ImapConnectionReminder from '~/components/imap_connection_reminder.vue';
</script>