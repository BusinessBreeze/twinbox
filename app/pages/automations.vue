<template>
  <v-container class="d-flex flex-column align-center ga-5">
    <Table ref="automationsForm" v-if="automationMeta" :meta="automationMeta" class="mb-6" />
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import automationMetaFcn from '~/schemas/automation'
import automationTaskChooser from '~/components/automation_task_chooser.vue';

const { t } = useI18n();
const automationMeta = ref<any>(null);
const automationsForm = ref<any>(null);

watch(() => automationsForm.value?.formulate, (formulate) => {
  if (formulate) {
    formulate.register("automation_task_chooser", automationTaskChooser);
  }
});

onMounted(async () => {
  automationMeta.value = await automationMetaFcn(t);
});
</script>
