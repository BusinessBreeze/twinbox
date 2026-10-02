<template>
  <v-card
    class="add-automation-card flex-grow-0 rounded-lg d-flex flex-column align-center justify-center pa-3 cursor-pointer"
    variant="flat"
    @click="onAddClick"
  >
    <div class="circle-btn d-flex align-center justify-center">
      <v-icon size="24" color="white" icon="mdi-plus" />
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const onAddClick = () => {
  router.push({
    path: '/automations',
    state: {
      action: 'create',
      openCreate: true
    }
  });
};
</script>

<style scoped>
.add-automation-card {
  height: 100%;
  min-height: 100px;
  min-width: 90px;
  max-width: 120px;
  background-color: rgb(var(--v-theme-surface));
  border: 2px dashed rgb(var(--v-theme-primary)) !important;
  box-shadow: 0 2px 8px rgba(var(--v-theme-primary), 0.08);
  transition: border-width 0.15s ease, box-shadow 0.15s ease, border-style 0.15s ease;
}

.add-automation-card:hover {
  border-width: 3px !important;
  border-style: solid !important;
  box-shadow: 0 4px 14px rgba(var(--v-theme-primary), 0.2);
}

.circle-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background-color: rgb(var(--v-theme-primary));
  border: 1.5px solid rgb(var(--v-theme-primary));
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.add-automation-card:hover .circle-btn {
  transform: scale(1.08);
  box-shadow: 0 4px 14px rgba(var(--v-theme-primary), 0.35);
}
</style>
