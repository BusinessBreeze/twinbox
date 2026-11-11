<template>
  <div>
    <div class="d-flex align-center mb-3">
      <span class="text-body-2 text-medium-emphasis">{{ t('sources.searches.hint') }}</span>
      <v-spacer />
      <v-btn color="primary" icon="mdi-plus" size="small" :title="t('sources.searches.add')" @click="add" />
    </div>
    <div v-if="searches.length === 0" class="text-body-2 text-medium-emphasis py-4 text-center">{{ t('sources.searches.empty') }}</div>
    <v-expansion-panels v-else v-model="openPanel" variant="accordion">
      <v-expansion-panel v-for="(search, index) in searches" :key="search.id || index" :value="index">
        <v-expansion-panel-title>
          <div class="d-flex align-center w-100 ga-2" style="min-width: 0;">
            <span class="font-weight-bold text-truncate flex-grow-1">{{ search.name || t('sources.searches.unnamed') }}</span>
            <v-btn icon="mdi-close" color="error" variant="text" size="x-small" class="me-2" :title="t('sources.searches.delete')" @click.stop="remove(index)" />
          </div>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-text-field v-model="search.name" :label="t('sources.searches.name')" :rules="[nameRule, uniqueRule(search)]" density="compact" @update:model-value="emitChange" />
          <ImapSearch v-model="search.search" @update:model-value="emitChange" />
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
// IMAP saved searches (settings.searches): name + search builder. Automation keys reference them by id
// ('<source>:<folder>:<searchId>'); the server assigns ids to new ones.
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ImapSearch from '~/components/form_widgets/imap_search/imap_search.vue';
import { getUniqueName } from '#shared/utils/unique_name';
import { searchName } from '#shared/source_types/imap';

const props = defineProps<{ modelValue?: any[] }>();
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

const searches = ref<any[]>([]);
const openPanel = ref<number | null>(null);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

watch(() => props.modelValue, (val) => {
  const incoming = Array.isArray(val) ? val : [];
  if (JSON.stringify(incoming) !== JSON.stringify(searches.value)) searches.value = clone(incoming);
}, { immediate: true, deep: true });

const emitChange = () => emit('update:modelValue', clone(searches.value));
// Same as the server: a search needs a name, unique within the source (case-insensitive; the server refuses duplicates)
const nameRule = (v: string) => {
  const issue = searchName.safeParse(v).error?.issues[0];
  return issue ? t(issue.message) : true;
};
const uniqueRule = (search: any) => (v: string) =>
  !searches.value.some((other) => other !== search && other.name?.trim().toLowerCase() === v?.trim().toLowerCase())
  || t('sources.searches.name_duplicate');

const add = () => {
  const name = getUniqueName(t('sources.searches.default_name'), searches.value.map((s) => s.name));
  searches.value.push({ name, search: {} });   // the server adds the since date when it saves a new search
  openPanel.value = searches.value.length - 1;
  emitChange();
};

const remove = (index: number) => {
  searches.value.splice(index, 1);
  emitChange();
};
</script>
