<template>
  <v-container class="d-flex flex-column ga-5 py-8" style="max-width: 900px;">
    <!-- Section Heading -->
    <h2 class="text-h5 font-weight-bold align-self-start mb-2">IMAP</h2>

    <!-- IMAP Connections Table -->
    <Table :meta="connectionsMeta" class="w-100 mb-6" />

    <!-- IMAP Searches Table -->
    <Table ref="imapSearchForm" :meta="imapSearchMeta" class="w-100 mb-6" />
  </v-container>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import connectionsMetaFcn from '~/schemas/connections_imap'
import imapSearchMetaFcn from '~/schemas/imap_search'
import ImapSearch from '~/components/imap_search/imap_search.vue'

const t = useI18n().t
const connectionsMeta = connectionsMetaFcn(t)
const imapSearchMeta = imapSearchMetaFcn(t)
const imapSearchForm = ref<any>(null)

watch(() => imapSearchForm.value?.formulate, (formulate) => {
  if (formulate) {
    formulate.register("imap_search_builder", ImapSearch)
  }
})
</script>
