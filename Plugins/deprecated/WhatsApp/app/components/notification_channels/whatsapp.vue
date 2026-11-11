<template>
  <v-card class="pa-4" variant="outlined">
    <v-card-title class="d-flex align-center">
      <v-icon color="success" class="me-2">mdi-whatsapp</v-icon>
      WhatsApp
    </v-card-title>
    
    <v-card-text>
      <div v-if="status === 'idle'" class="mt-2">
        <p class="mb-4">Connect your WhatsApp account to receive reports directly via chat.</p>
        <v-btn color="primary" @click="startConnection">Connect WhatsApp</v-btn>
      </div>
      
      <div v-else-if="status === 'generating'" class="d-flex flex-column align-center py-4">
        <v-progress-circular indeterminate color="primary" class="mb-4"></v-progress-circular>
        <p>Initializing connection...</p>
      </div>

      <div v-else-if="status === 'qr'" class="d-flex flex-column align-center py-4">
        <qrcode-vue v-if="qrData" :value="qrData" :size="250" level="H" class="mb-4 bg-white pa-2 rounded" />
        <p class="text-center font-weight-medium">Scan this QR code with WhatsApp on your phone</p>
        <v-btn variant="text" color="error" class="mt-4" @click="cancel">Cancel</v-btn>
      </div>

      <div v-else-if="status === 'success'" class="d-flex flex-column align-center py-4 text-success">
        <v-icon size="64" color="success" class="mb-4">mdi-check-circle</v-icon>
        <p class="text-h6">Successfully Connected!</p>
        <p>Your WhatsApp is now linked.</p>
      </div>

      <div v-else-if="status === 'error'" class="d-flex flex-column align-center py-4">
        <v-icon size="64" color="error" class="mb-4">mdi-alert-circle</v-icon>
        <p class="text-h6 text-error">Connection failed</p>
        <p class="text-center mb-4">{{ errorMessage }}</p>
        <v-btn color="primary" @click="startConnection">Try Again</v-btn>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import QrcodeVue from 'qrcode.vue'

const emit = defineEmits(['cancel'])

const status = ref<'idle' | 'generating' | 'qr' | 'success' | 'error'>('idle')
const qrData = ref('')
const errorMessage = ref('')
let eventSource: EventSource | null = null

const startConnection = () => {
  status.value = 'generating'
  errorMessage.value = ''
  qrData.value = ''
  
  if (eventSource) {
    eventSource.close()
  }

  // Use the API route that streams Server-Sent Events
  eventSource = new EventSource('/api/v0.1/app/notification_channels/whatsapp/create')

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      
      if (data.type === 'qr') {
        qrData.value = data.data
        status.value = 'qr'
      } else if (data.type === 'success') {
        status.value = 'success'
        closeConnection()
      } else if (data.type === 'error') {
        status.value = 'error'
        errorMessage.value = data.message || 'An unknown error occurred.'
        closeConnection()
      }
    } catch (e) {
      console.error('Failed to parse SSE message', e)
    }
  }

  eventSource.onerror = (err) => {
    console.error('EventSource error:', err)
    status.value = 'error'
    errorMessage.value = 'Lost connection to server. Please try again.'
    closeConnection()
  }
}

const closeConnection = () => {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
}

const cancel = () => {
  closeConnection()
  status.value = 'idle'
  emit('cancel')
}

onBeforeUnmount(() => {
  closeConnection()
})
</script>
