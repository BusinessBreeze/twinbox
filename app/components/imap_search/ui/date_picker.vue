<template>
  <v-menu
    v-model="menu"
    :close-on-content-click="false"
    transition="scale-transition"
    min-width="auto"
  >
    <template v-slot:activator="{ props }">
      <v-text-field
        :model-value="formattedDate"
        :label="label"
        :rules="rules"
        prepend-inner-icon="mdi-calendar"
        readonly
        v-bind="props"
        density="compact"
        variant="outlined"
        clearable
        hide-details="auto"
        @click:clear="clearDate"
      ></v-text-field>
    </template>
    <v-date-picker
      v-model="dateVal"
      color="primary"
      @update:modelValue="onDateSelected"
    ></v-date-picker>
  </v-menu>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps({
  modelValue: {
    type: [String, Date],
    default: ''
  },
  label: {
    type: String,
    default: 'Select Date'
  },
  rules: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const menu = ref(false)
const dateVal = ref<Date | null>(null)

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    const parsed = new Date(newVal)
    if (!isNaN(parsed.getTime())) {
      dateVal.value = parsed
    } else {
      dateVal.value = null
    }
  } else {
    dateVal.value = null
  }
}, { immediate: true })

const formattedDate = computed(() => {
  if (!dateVal.value) return ''
  const yyyy = dateVal.value.getFullYear()
  const mm = String(dateVal.value.getMonth() + 1).padStart(2, '0')
  const dd = String(dateVal.value.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
})

const onDateSelected = (val: any) => {
  menu.value = false
  if (val) {
    const d = new Date(val)
    emit('update:modelValue', d)
  } else {
    emit('update:modelValue', '')
  }
}

const clearDate = () => {
  dateVal.value = null
  emit('update:modelValue', '')
}
</script>
