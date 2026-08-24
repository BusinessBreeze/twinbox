<template>
  <v-container class="d-flex flex-column align-center ga-5">
    <Table :meta="llmFilterMeta" class="mb-6" />
  </v-container>
</template>

<script setup lang="ts">
import llmFilterMetaFcn from '~/schemas/llm_filter'

const t = useI18n().t;
const llmFilterMeta = llmFilterMetaFcn(t);
</script>
