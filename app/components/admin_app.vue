<template>
  <div v-for="section in admin_app" :key="section.name">
    <div v-for="item in section.items" :key="item.name">
      <div class="mb-4">
        <Table
          :ref="(el) => setTableRef(el, item.name)"
          v-slot:default
          v-if="item.type === 'table' && hasPerm(item.permissions)"
          :meta="item.data"
        />
        <span v-if="item.type === 'label' && hasPerm(item.permissions)">{{ item.data || item.name }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watchEffect, onMounted } from 'vue'
import hasPerm from '#ba/util/hasPerm'
import emailMetaFcn from '~/schemas/admin/email'
import notificationChannelsMetaFcn from '~/schemas/admin/notification_channels'
import connectionsImapMetaFcn from '~/schemas/admin/connections_imap'
import imapSearchMetaFcn from '~/schemas/admin/imap_search'
import llmFilterMetaFcn from '~/schemas/admin/llm_filter'
import llmCreateArtifactMetaFcn from '~/schemas/admin/llm_create_artifact'
import automationMetaFcn from '~/schemas/admin/automation'
import ImapSearch from '~/components/imap_search/imap_search.vue'

const i18n = useI18n()
const admin_app = ref<any[]>([])
const tableRefs = ref<Record<string, any>>({})

const setTableRef = (el: any, name: string) => {
  if (el) {
    tableRefs.value[name] = el
  }
}

watchEffect(() => {
  const imapSearchTable = tableRefs.value['imap_search']
  if (imapSearchTable?.formulate) {
    imapSearchTable.formulate.register('imap_search_builder', ImapSearch)
  }
})

onMounted(() => {
  admin_app.value = [
    {
      name: 'app_management',
      items: [
        { name: 'email', data: emailMetaFcn(i18n.t), type: 'table', permissions: ['email.crud.read'], icon: 'mdi-email-outline' },
        { name: 'connections_imap', data: connectionsImapMetaFcn(i18n.t), type: 'table', permissions: ['connections_imap.crud.read'], icon: 'mdi-server' },
        { name: 'imap_search', data: imapSearchMetaFcn(i18n.t), type: 'table', permissions: ['imap_search.crud.read'], icon: 'mdi-magnify' },
        { name: 'llm_filter', data: llmFilterMetaFcn(i18n.t), type: 'table', permissions: ['llm_filter.crud.read'], icon: 'mdi-filter-cog-outline' },
        { name: 'llm_create_artifact', data: llmCreateArtifactMetaFcn(i18n.t), type: 'table', permissions: ['llm_create_artifact.crud.read'], icon: 'mdi-file-code-outline' },
        { name: 'automation', data: automationMetaFcn(i18n.t), type: 'table', permissions: ['automation.crud.read'], icon: 'mdi-cog-sync' }
      ]
    }
  ]
})
</script>