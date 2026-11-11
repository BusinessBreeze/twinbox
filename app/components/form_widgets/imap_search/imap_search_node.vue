<template>
  <v-card
    v-if="node.type === 'group'"
    variant="outlined"
    class="my-3 pa-4 position-relative"
    :style="groupStyle"
  >
    <!-- Group Label & Actions -->
    <div class="d-flex flex-wrap align-center justify-space-between mb-4 ga-3">
      <div v-if="!showJsonView" class="d-flex align-center ga-2">
        <v-chip
          :color="node.operator === 'or' ? 'secondary' : 'primary'"
          size="small"
          variant="tonal"
          class="font-weight-bold text-uppercase ps-3"
        >
          <v-icon start icon="mdi-group" class="ms-1 me-1"></v-icon>
          {{ node.operator === 'or' ? $t('imap_search.builder.or') : $t('imap_search.builder.and') }}
        </v-chip>
      </div>
      <div v-else></div>

      <div class="d-flex align-center ga-2">
        <template v-if="!showJsonView">
          <v-btn
            color="primary"
            size="small"
            prepend-icon="mdi-plus"
            variant="elevated"
            @click="addRule"
          >
            {{ $t('imap_search.builder.add_rule') }}
          </v-btn>
          <v-btn
            color="primary"
            size="small"
            prepend-icon="mdi-plus"
            variant="tonal"
            @click="addAndGroup"
          >
            {{ $t('imap_search.builder.add_and') }}
          </v-btn>
          <v-btn
            color="secondary"
            size="small"
            prepend-icon="mdi-plus"
            variant="tonal"
            @click="addOrGroup"
          >
            {{ $t('imap_search.builder.add_or') }}
          </v-btn>
        </template>
        <v-btn
          v-if="depth === 0"
          color="info"
          size="small"
          :icon="showJsonView ? 'mdi-email-search' : 'mdi-code-json'"
          variant="tonal"
          v-tooltip="showJsonView ? $t('imap_search.builder.gui_builder') : $t('imap_search.builder.json_view')"
          @click="$emit('toggleJsonView')"
        ></v-btn>
        <v-btn
          v-if="depth > 0 && !showJsonView"
          color="error"
          size="small"
          icon="mdi-close"
          variant="text"
          v-tooltip="$t('imap_search.builder.delete_group')"
          @click="$emit('delete')"
        ></v-btn>
      </div>
    </div>

    <!-- Children list (GUI View Mode) -->
    <template v-if="!showJsonView">
      <div v-if="node.children.length > 0" class="d-flex flex-column ga-2 pl-2 border-left-dashed">
        <div
          v-for="(child, idx) in node.children"
          :key="idx"
          class="d-flex align-center w-100"
        >
          <imap_search_node
            v-if="child.type === 'group'"
            :node="child"
            :depth="depth + 1"
            :search-fields="searchFields"
            :show-json-view="showJsonView"
            :serialized-query="serializedQuery"
            class="w-100"
            @delete="deleteChild(idx)"
          />
          <div v-else class="d-flex align-center ga-3 py-2 w-100 rule-row">
            <!-- Field Selector -->
            <v-select
              v-model="child.field"
              :items="getSearchFieldsForChild(idx)"
              item-title="title"
              item-value="value"
              :rules="[valueRequiredRule]"
              density="compact"
              variant="outlined"
              hide-details="auto"
              class="field-selector"
              style="max-width: 200px; min-width: 150px;"
              @update:modelValue="onFieldChange(child)"
            ></v-select>

            <!-- Not/Equals Operator Toggle Button -->
            <v-btn
              size="small"
              variant="outlined"
              :color="child.not ? 'warning' : 'default'"
              class="font-weight-bold px-2"
              style="min-width: 36px; height: 40px;"
              v-tooltip="child.not ? $t('imap_search.builder.not_matches') : $t('imap_search.builder.matches')"
              @click="toggleRuleNot(child)"
            >
              {{ child.not ? '≠' : '=' }}
            </v-btn>

            <!-- Input fields depending on type -->
            <div class="flex-grow-1">
              <!-- Text Field -->
              <v-text-field
                v-if="getFieldType(child.field) === 'text'"
                v-model="child.value"
                :placeholder="$t('imap_search.builder.placeholder_search_value')"
                :rules="[valueRequiredRule]"
                density="compact"
                variant="outlined"
                hide-details="auto"
              ></v-text-field>

              <!-- Number Field -->
              <v-text-field
                v-else-if="getFieldType(child.field) === 'number'"
                v-model.number="child.value"
                type="number"
                :placeholder="$t('imap_search.builder.placeholder_bytes')"
                :rules="[valueRequiredRule]"
                density="compact"
                variant="outlined"
                hide-details="auto"
              ></v-text-field>

              <!-- Boolean Field -->
              <v-btn-toggle
                v-else-if="getFieldType(child.field) === 'boolean'"
                v-model="child.value"
                mandatory
                color="primary"
                density="compact"
                variant="outlined"
              >
                <v-btn :value="true" size="small" class="px-4">{{ $t('imap_search.builder.yes') }}</v-btn>
                <v-btn :value="false" size="small" class="px-4">{{ $t('imap_search.builder.no') }}</v-btn>
              </v-btn-toggle>

              <!-- Date Field -->
              <DatePicker
                v-else-if="getFieldType(child.field) === 'date'"
                v-model="child.value"
                :rules="[valueRequiredRule]"
                :label="$t('imap_search.builder.select_date')"
              />

              <!-- Header Field -->
              <div v-else-if="getFieldType(child.field) === 'header'" class="d-flex ga-2">
                <v-text-field
                  v-model="child.value.name"
                  :placeholder="$t('imap_search.builder.placeholder_header_name')"
                  :rules="[valueRequiredRule]"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                ></v-text-field>
                <v-text-field
                  v-model="child.value.value"
                  :placeholder="$t('imap_search.builder.placeholder_header_value')"
                  :rules="[valueRequiredRule]"
                  density="compact"
                  variant="outlined"
                  hide-details="auto"
                ></v-text-field>
              </div>
            </div>

            <!-- Remove Rule Button -->
            <v-btn
              color="error"
              icon="mdi-close"
              variant="text"
              size="small"
              v-tooltip="$t('imap_search.builder.remove_rule')"
              @click="deleteChild(idx)"
            ></v-btn>
          </div>
        </div>
      </div>
      
      <div v-else class="text-caption text-center text-disabled py-4">
        {{ $t('imap_search.builder.empty_group') }}
      </div>
    </template>

    <!-- Read-Only JSON View Mode -->
    <div v-else-if="depth === 0" class="mt-2">
      <pre class="overflow-x-auto text-caption font-mono pa-4 bg-grey-darken-4 text-white rounded-lg">{{ JSON.stringify(serializedQuery, null, 2) }}</pre>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DatePicker from './ui/date_picker.vue'

// Local reference name to allow recursive rendering
defineOptions({
  name: 'imap_search_node'
})

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  depth: {
    type: Number,
    default: 0
  },
  searchFields: {
    type: Array,
    required: true
  },
  showJsonView: {
    type: Boolean,
    default: false
  },
  serializedQuery: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['delete', 'toggleJsonView'])

// Stylize the group border based on depth
const groupStyle = computed(() => {
  const colors = [
    'rgba(var(--v-theme-primary), 0.15)',
    'rgba(var(--v-theme-secondary), 0.12)',
    'rgba(var(--v-theme-info), 0.1)'
  ]
  const color = colors[props.depth % colors.length]
  return {
    borderLeft: `4px solid ${color}`,
    background: 'rgba(var(--v-theme-surface), 0.02)',
    borderRadius: '8px'
  }
})

const relativeDatePairs: Record<string, string> = {
  since: '_since_days',
  _since_days: 'since',
  before: '_before_days',
  _before_days: 'before',
  on: '_on_days',
  _on_days: 'on',
  sentSince: '_sentSince_days',
  _sentSince_days: 'sentSince',
  sentBefore: '_sentBefore_days',
  _sentBefore_days: 'sentBefore',
  sentOn: '_sentOn_days',
  _sentOn_days: 'sentOn',
}

const valueRequiredRule = (val: any) => {
  if (val === null || val === undefined || val === '') return 'Field is required'
  if (typeof val === 'string' && val.trim() === '') return 'Field is required'
  return true
}

const getFieldType = (fieldName: string) => {
  const f = props.searchFields.find((x: any) => x.value === fieldName) as any
  return f ? f.type : 'text'
}

const getSearchFieldsForChild = (childIdx: number) => {
  if (props.node.operator !== 'and') {
    return props.searchFields.map((f: any) => ({
      title: f.label,
      value: f.value,
      props: { disabled: false }
    }))
  }

  const childRule = props.node.children[childIdx]
  const targetIsNot = !!childRule?.not

  const usedFields = new Set(
    props.node.children
      .filter((c: any, index: number) => index !== childIdx && c.type === 'rule' && c.field && !!c.not === targetIsNot)
      .map((c: any) => c.field)
  )

  return props.searchFields.map((f: any) => {
    const pairedField = relativeDatePairs[f.value]
    const isUsed = usedFields.has(f.value) || (pairedField && usedFields.has(pairedField))
    return {
      title: f.label,
      value: f.value,
      props: { disabled: isUsed }
    }
  })
}

const toggleRuleNot = (child: any) => {
  child.not = !child.not
  sanitizeAndGroup()
}

const onOperatorChange = (val: string) => {
  if (val === 'and') {
    sanitizeAndGroup()
  }
}

const sanitizeAndGroup = () => {
  if (props.node.operator !== 'and') return
  const usedPositive = new Set<string>()
  const usedNegative = new Set<string>()

  for (const child of props.node.children) {
    if (child.type === 'rule') {
      const isNot = !!child.not
      const usedSet = isNot ? usedNegative : usedPositive
      const pairedField = relativeDatePairs[child.field]

      if (usedSet.has(child.field) || (pairedField && usedSet.has(pairedField))) {
        const available = props.searchFields.find((f: any) => {
          const pair = relativeDatePairs[f.value]
          return !usedSet.has(f.value) && (!pair || !usedSet.has(pair))
        }) as any
        if (available) {
          child.field = available.value
          onFieldChange(child)
        }
      }
      if (child.field) {
        usedSet.add(child.field)
      }
    }
  }
}

const onFieldChange = (child: any) => {
  const type = getFieldType(child.field)
  if (type === 'boolean') {
    child.value = true
  } else if (type === 'number') {
    child.value = 0
  } else if (type === 'date') {
    child.value = ''
  } else if (type === 'header') {
    child.value = { name: '', value: '' }
  } else {
    child.value = ''
  }
}

const addRule = () => {
  let defaultField = 'subject'
  if (props.node.operator === 'and') {
    const usedFields = new Set(
      props.node.children
        .filter((c: any) => c.type === 'rule' && c.field && !c.not)
        .map((c: any) => c.field)
    )
    const available = props.searchFields.find((f: any) => {
      const pair = relativeDatePairs[f.value]
      return !usedFields.has(f.value) && (!pair || !usedFields.has(pair))
    }) as any
    if (available) {
      defaultField = available.value
    }
  }

  props.node.children.push({
    type: 'rule',
    field: defaultField,
    value: '',
    not: false
  })
}

const addAndGroup = () => {
  props.node.children.push({
    type: 'group',
    operator: 'and',
    children: []
  })
}

const addOrGroup = () => {
  props.node.children.push({
    type: 'group',
    operator: 'or',
    children: []
  })
}

const deleteChild = (idx: number) => {
  props.node.children.splice(idx, 1)
}
</script>

<style scoped>
.border-left-dashed {
  border-left: 1px dashed rgba(var(--v-border-color), 0.4);
}
.rule-row {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.05);
}
.rule-row:last-child {
  border-bottom: none;
}
</style>
