<template>
  <div class="w-100">
    <!-- Recursive Tree Entry -->
    <imap_search_node
      :node="rootNode"
      :depth="0"
      :search-fields="searchFields"
      :show-json-view="showJsonView"
      :serialized-query="serializedQuery"
      @toggle-json-view="showJsonView = !showJsonView"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import imap_search_node from './imap_search_node.vue'

const props = defineProps({
  modelValue: {
    type: [Object, String, Array],
    default: () => ({})
  },
  header: {
    type: Object,
    default: () => ({})
  },
  rules: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

// Supported search fields (excluding Google-specific filters)
const searchFields = computed(() => [
  { value: 'from', label: t('imap_search.builder.fields.from'), type: 'text' },
  { value: 'to', label: t('imap_search.builder.fields.to'), type: 'text' },
  { value: 'cc', label: t('imap_search.builder.fields.cc'), type: 'text' },
  { value: 'bcc', label: t('imap_search.builder.fields.bcc'), type: 'text' },
  { value: 'subject', label: t('imap_search.builder.fields.subject'), type: 'text' },
  { value: 'body', label: t('imap_search.builder.fields.body'), type: 'text' },
  { value: 'text', label: t('imap_search.builder.fields.text'), type: 'text' },
  { value: 'seq', label: t('imap_search.builder.fields.seq'), type: 'text' },
  { value: 'uid', label: t('imap_search.builder.fields.uid'), type: 'text' },
  { value: 'seen', label: t('imap_search.builder.fields.seen'), type: 'boolean' },
  { value: 'flagged', label: t('imap_search.builder.fields.flagged'), type: 'boolean' },
  { value: 'answered', label: t('imap_search.builder.fields.answered'), type: 'boolean' },
  { value: 'deleted', label: t('imap_search.builder.fields.deleted'), type: 'boolean' },
  { value: 'draft', label: t('imap_search.builder.fields.draft'), type: 'boolean' },
  { value: 'recent', label: t('imap_search.builder.fields.recent'), type: 'boolean' },
  { value: 'since', label: t('imap_search.builder.fields.since'), type: 'date' },
  { value: '_since_days', label: t('imap_search.builder.fields._since_days'), type: 'number' },
  { value: 'before', label: t('imap_search.builder.fields.before'), type: 'date' },
  { value: '_before_days', label: t('imap_search.builder.fields._before_days'), type: 'number' },
  { value: 'on', label: t('imap_search.builder.fields.on'), type: 'date' },
  { value: '_on_days', label: t('imap_search.builder.fields._on_days'), type: 'number' },
  { value: 'sentSince', label: t('imap_search.builder.fields.sentSince'), type: 'date' },
  { value: '_sentSince_days', label: t('imap_search.builder.fields._sentSince_days'), type: 'number' },
  { value: 'sentBefore', label: t('imap_search.builder.fields.sentBefore'), type: 'date' },
  { value: '_sentBefore_days', label: t('imap_search.builder.fields._sentBefore_days'), type: 'number' },
  { value: 'sentOn', label: t('imap_search.builder.fields.sentOn'), type: 'date' },
  { value: '_sentOn_days', label: t('imap_search.builder.fields._sentOn_days'), type: 'number' },
  { value: 'larger', label: t('imap_search.builder.fields.larger'), type: 'number' },
  { value: 'smaller', label: t('imap_search.builder.fields.smaller'), type: 'number' },
  { value: 'header', label: t('imap_search.builder.fields.header'), type: 'header' },
])

// Parser: translates SearchObject to internal tree structure
function parseSearchObject(obj: any): any {
  if (typeof obj === 'string') {
    try {
      obj = JSON.parse(obj)
    } catch {
      return { type: 'group', operator: 'and', children: [] }
    }
  }
  if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
    return { type: 'group', operator: 'and', children: [] }
  }

  const children: any[] = []

  function processObj(sourceObj: any, isNot: boolean = false) {
    if (!sourceObj || typeof sourceObj !== 'object') return

    // 1. Handle logical OR
    if (Array.isArray(sourceObj.or)) {
      children.push({
        type: 'group',
        operator: 'or',
        children: sourceObj.or.map((child: any) => parseSearchObject(child))
      })
    }

    // 2. Handle NOT block
    if (sourceObj.not && typeof sourceObj.not === 'object') {
      if (Array.isArray(sourceObj.not)) {
        for (const item of sourceObj.not) {
          processObj(item, true)
        }
      } else {
        processObj(sourceObj.not, true)
      }
    }

    // 3. Handle standard fields
    for (const [key, val] of Object.entries(sourceObj)) {
      if (key === 'or' || key === 'not') continue

      if (key === 'header' && val && typeof val === 'object') {
        for (const [hName, hVal] of Object.entries(val)) {
          children.push({
            type: 'rule',
            field: 'header',
            value: { name: hName, value: String(hVal) },
            not: isNot
          })
        }
      } else if (['_since_days', '_before_days', '_on_days', '_sentSince_days', '_sentBefore_days', '_sentOn_days'].includes(key)) {
        children.push({
          type: 'rule',
          field: key,
          value: typeof val === 'number' ? val : parseInt(String(val), 10) || 0,
          not: isNot
        })
      } else if (['before', 'on', 'since', 'sentBefore', 'sentOn', 'sentSince'].includes(key)) {
        children.push({
          type: 'rule',
          field: key,
          value: val ? new Date(val as any) : '',
          not: isNot
        })
      } else {
        children.push({
          type: 'rule',
          field: key,
          value: val,
          not: isNot
        })
      }
    }
  }

  processObj(obj, false)

  // Unpack single inner group wrapper if applicable
  if (children.length === 1 && children[0].type === 'group') {
    return children[0]
  }

  return {
    type: 'group',
    operator: 'and',
    children
  }
}

// Serializer: translates internal tree structure back to SearchObject
function serializeRule(node: any): any {
  let baseObj: any = {}

  if (node.field === 'header') {
    const headerVal = node.value || { name: '', value: '' }
    if (headerVal.name) {
      baseObj = {
        header: {
          [headerVal.name]: headerVal.value || ''
        }
      }
    }
  } else if (['before', 'on', 'since', 'sentBefore', 'sentOn', 'sentSince'].includes(node.field)) {
    if (node.value) {
      const d = new Date(node.value)
      if (!isNaN(d.getTime())) {
        baseObj = { [node.field]: d }
      }
    }
  } else if (['larger', 'smaller'].includes(node.field)) {
    const num = Number(node.value)
    if (!isNaN(num)) {
      baseObj = { [node.field]: num }
    }
  } else if (node.field) {
    baseObj = { [node.field]: node.value }
  }

  if (Object.keys(baseObj).length === 0) return {}

  if (node.not) {
    return { not: baseObj }
  }

  return baseObj
}

function serializeTree(node: any): any {
  if (!node) return {}

  if (node.type === 'rule') {
    return serializeRule(node)
  }

  if (node.type === 'group') {
    if (node.operator === 'or') {
      const serializedChildren = node.children
        .map((child: any) => serializeTree(child))
        .filter((c: any) => Object.keys(c).length > 0)
      
      if (serializedChildren.length > 0) {
        return { or: serializedChildren }
      }
      return {}
    }

    // Default 'and' operator
    const result: any = {}
    for (const child of node.children) {
      const serialized = serializeTree(child)
      if (!serialized || Object.keys(serialized).length === 0) continue

      if ('not' in serialized) {
        if (!result.not) result.not = {}
        const notContent = serialized.not
        if (typeof notContent === 'object' && notContent !== null) {
          for (const [k, v] of Object.entries(notContent)) {
            if (k === 'header') {
              result.not.header = { ...result.not.header, ...v }
            } else if (k === 'or') {
              result.not.or = Array.isArray(result.not.or) ? [...result.not.or, ...(v as any)] : v
            } else {
              result.not[k] = v
            }
          }
        }
      } else {
        for (const [key, val] of Object.entries(serialized)) {
          if (key === 'header') {
            result.header = { ...result.header, ...val }
          } else if (key === 'or') {
            if (result.or) {
              result.or = [...result.or, ...(val as any)]
            } else {
              result.or = val
            }
          } else {
            result[key] = val
          }
        }
      }
    }
    return result
  }

  return {}
}

const showJsonView = ref(false)
const rootNode = ref({ type: 'group', operator: 'and', children: [] })

// Synchronize prop changes to internal tree state
watch(() => props.modelValue, (newVal) => {
  let valToParse = newVal
  if (typeof newVal === 'string' && newVal.trim() !== '') {
    try {
      valToParse = JSON.parse(newVal)
    } catch {
      valToParse = {}
    }
  }
  const currentSerialized = serializeTree(rootNode.value)
  if (JSON.stringify(currentSerialized) !== JSON.stringify(valToParse)) {
    rootNode.value = parseSearchObject(valToParse)
  }
}, { deep: true, immediate: true })

// Emit updates back when tree state is mutated
watch(rootNode, (newTree) => {
  const serialized = serializeTree(newTree)
  if (JSON.stringify(serialized) !== JSON.stringify(props.modelValue)) {
    emit('update:modelValue', serialized)
  }
}, { deep: true })

const serializedQuery = computed(() => {
  return serializeTree(rootNode.value)
})
</script>

<style scoped>
pre {
  background-color: #1e1e1e;
  padding: 12px;
  border-radius: 6px;
  font-family: Consolas, Monaco, monospace;
}
</style>
