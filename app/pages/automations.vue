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

const handleRouteState = () => {
  if (typeof window === 'undefined' || !automationsForm.value) return;
  const state = window.history.state;
  if (!state) return;

  if (state.action === 'create' || state.openCreate) {
    automationsForm.value.openCreate();
    history.replaceState({ ...state, action: undefined, openCreate: undefined }, '');
  } else if (state.action === 'edit' || state.openEdit) {
    const target = state.item || state.id || state.title || state.name;
    automationsForm.value.openEdit(target);
    history.replaceState({ ...state, action: undefined, openEdit: undefined, item: undefined, id: undefined, title: undefined, name: undefined }, '');
  }
};

watch(automationsForm, (form) => {
  if (form) {
    handleRouteState();
  }
}, { flush: 'post' });

onMounted(async () => {
  automationMeta.value = await automationMetaFcn(t);
});
</script>
