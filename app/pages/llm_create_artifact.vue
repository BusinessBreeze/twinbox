<template>
  <v-container class="d-flex flex-column align-center ga-5">
    <Table :meta="meta" class="mb-6" />
  </v-container>
</template>

<script setup lang="ts">
import metaFcn from '~/schemas/llm_create_artifact'

const t = useI18n().t;
const meta = metaFcn(t);
</script>
