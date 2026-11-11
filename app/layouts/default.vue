<template>
  <!-- No v-app here: the base layer's app.vue is the one v-app (a second one would nest the layout) -->
  <div class="fill-height">
    <Header />
    <NavDrawer />
    <v-main>
      <InitialPasswordBanner />
      <slot />
    </v-main>
    <Footer />
    <Alert />
    <SourceConnectionReminder />
  </div>
</template>

<script setup lang="ts">
import SourceConnectionReminder from '~/components/source_connection_reminder.vue';
</script>