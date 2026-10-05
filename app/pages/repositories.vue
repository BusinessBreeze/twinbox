<template>
  <v-container>
    <Table :meta="emailTableMeta" v-if="emailTableMeta" />
    <EmailViewer v-model="showViewer" :email="selectedEmail" />
  </v-container>
</template>

<script setup lang="ts">
import emailTableMetaFcn from '~/schemas/email'
import { apiGet } from '#ba/utils/fetch/wrappers'

const { t } = useI18n()
const route = useRoute()
const showViewer = ref(false)
const selectedEmail = ref<Record<string, any> | null>(null)

const onViewEmail = (item: any) => {
  selectedEmail.value = item
  showViewer.value = true
}

const emailTableMeta = ref<any>(null)

onMounted(async () => {
  emailTableMeta.value = emailTableMetaFcn(t, { onViewEmail })

  const messageId = route.query.message_id || route.query.messageId
  if (messageId) {
    try {
      const res = await apiGet(`/api/v0.1/app/email?message_id=${encodeURIComponent(String(messageId))}`)
      const emailList = res?.data
      const email = Array.isArray(emailList) ? emailList[0] : emailList
      if (email) {
        onViewEmail(email)
      }
    } catch (e) {
      console.error('Failed to fetch email by message_id:', e)
    }
  }
})
</script>
