<template>
  <v-container>
    <v-alert v-if="pruned" type="info" variant="tonal" closable class="mb-4" @click:close="pruned = false">
      {{ t('repositories.message_pruned') }}
    </v-alert>
    <Table :meta="emailTableMeta" v-if="emailTableMeta" />
    <MediaViewer v-model="showViewer" :title="emailTitle" :mime="MESSAGE_RECORD_MIME" :data="emailRecord" :loading="loadingEmail" :download-url="emailDownload" />
    <AutomationDraftDialog v-model="showDraft" />
  </v-container>
</template>

<script setup lang="ts">
import emailTableMetaFcn from '~/schemas/email'
import AutomationDraftDialog from '~/components/automation_draft/dialog.vue'
import { apiGet } from '#ba/utils/fetch/wrappers'
import { MESSAGE_RECORD_MIME } from '#shared/types/email'

const { t } = useI18n()
const route = useRoute()
const showViewer = ref(false)
const pruned = ref(false)
const selectedEmail = ref<Record<string, any> | null>(null)
const showDraft = ref(false)

const emailTitle = computed(() => selectedEmail.value?.subject || t('table.email.no_subject'))
// The viewer gets the stored record (structure, renditions, attachments) as JSON; Download is the server's .eml
const emailRecord = ref<string | null>(null)
const loadingEmail = ref(false)
const emailDownload = computed(() => selectedEmail.value ? `/api/v0.1/app/email/${encodeURIComponent(selectedEmail.value.id)}?format=eml` : undefined)

const onViewEmail = async (item: any) => {
  selectedEmail.value = item
  emailRecord.value = null
  showViewer.value = true
  loadingEmail.value = true
  try {
    const res = await apiGet(`/api/v0.1/app/email/${encodeURIComponent(item.id)}`)
    if (selectedEmail.value?.id === item.id) emailRecord.value = JSON.stringify(res?.data ?? item)
  } catch (e) {
    console.error('Failed to load the email:', e)
  } finally {
    loadingEmail.value = false
  }
}

const emailTableMeta = ref<any>(null)

onMounted(async () => {
  emailTableMeta.value = emailTableMetaFcn(t, { onViewEmail, onDraftAutomation: () => { showDraft.value = true } })

  const messageId = route.query.message_id || route.query.messageId
  if (messageId) {
    try {
      const res = await apiGet(`/api/v0.1/app/email?message_id=${encodeURIComponent(String(messageId))}`)
      const emailList = res?.data
      const email = Array.isArray(emailList) ? emailList[0] : emailList
      if (email) {
        onViewEmail(email)
      } else {
        // Links in notifications outlive the stored email (retention pruning)
        pruned.value = true
      }
    } catch (e) {
      console.error('Failed to fetch email by message_id:', e)
    }
  }
})
</script>
