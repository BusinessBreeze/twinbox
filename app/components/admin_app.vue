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
import { ref, onMounted } from 'vue'
import hasPerm from '#ba/utils/hasPerm'
import emailMetaFcn from '~/schemas/admin/email'
import sourcesMetaFcn from '~/schemas/admin/sources'
import automationMetaFcn from '~/schemas/admin/automation'

const i18n = useI18n()
const admin_app = ref<any[]>([])
const tableRefs = ref<Record<string, any>>({})

const setTableRef = (el: any, name: string) => {
  if (el) {
    tableRefs.value[name] = el
  }
}

onMounted(() => {
  admin_app.value = [
    {
      name: 'app_management',
      items: [
        { name: 'email', data: emailMetaFcn(i18n.t), type: 'table', permissions: ['email.crud.read'], icon: 'mdi-email-outline' },
        { name: 'sources', data: sourcesMetaFcn(i18n.t), type: 'table', permissions: ['sources.crud.read'], icon: 'mdi-server' },
        { name: 'automation', data: automationMetaFcn(i18n.t), type: 'table', permissions: ['automation.crud.read'], icon: 'mdi-cog-sync' }
      ]
    }
  ]
})
</script>