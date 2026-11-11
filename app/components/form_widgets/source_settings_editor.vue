<template>
  <v-card v-if="fields.length" variant="outlined" class="w-100 pa-4 mt-6 position-relative overflow-visible">
    <template v-for="field in fields" :key="field.key">
      <FormSetNote v-if="field.set_type === 'note'" :header="field" />
      <div
        v-else-if="field.title"
        class="position-absolute px-1"
        style="top: 0; left: 12px; transform: translateY(-50%); background-color: rgb(var(--v-theme-surface, 255, 255, 255)); z-index: 2; color: rgba(var(--v-theme-on-surface), 0.6); font-size: 12px;"
      >
        {{ t(field.title) }}
      </div>
      <v-checkbox
        v-if="field.set_type === 'checkbox'"
        v-model="settings[field.key]"
        :label="t(field.opts?.label ?? field.key)"
        :disabled="field.opts?.disabled"
        :hint="field.opts?.hint ? t(field.opts.hint) : undefined"
        persistent-hint
        density="compact"
        color="primary"
        class="mt-2"
        @update:model-value="emitChange"
      />
      <component
        :is="widgets[field.set_type]"
        v-else-if="widgets[field.set_type]"
        v-model="settings[field.key]"
        @update:model-value="emitChange"
      />
      <v-text-field v-else-if="field.set_type !== 'note' && field.set_type !== 'checkbox'" v-model="settings[field.key]" :label="t(field.title)" density="compact" @update:model-value="emitChange" />
    </template>
  </v-card>
</template>

<script setup lang="ts">
// Saved, non-secret data of a source (docs/specs/SPEC_sources.md): the settings fields of the selected type's form
// (app/schemas/source_types/). Types without settings (staging) show nothing. Type-specific widgets are looked up by set_type;
// 'note' fields are text only (no value), 'checkbox' fields a checkbox (opts: label, disabled, hint).
import { ref, computed, watch, type Component } from 'vue';
import { useI18n } from 'vue-i18n';
import ImapSearches from '~/components/form_widgets/imap_searches.vue';
import FormSetNote from '#ba/components/form/set/note.vue';
import { sourceForm } from '~/schemas/source_types';

// set_type → widget; a source type with its own settings widget adds one line here
const widgets: Record<string, Component> = {
  imap_searches: ImapSearches,
};

const props = defineProps<{ modelValue?: Record<string, any>; header: any; formData?: any }>();
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

const settings = ref<Record<string, any>>({});

const fields = computed(() => sourceForm(props.formData?.type)?.settings() ?? []);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null));

watch(() => props.modelValue, (val) => {
  const incoming = val && typeof val === 'object' ? val : {};
  if (JSON.stringify(incoming) !== JSON.stringify(settings.value)) settings.value = clone(incoming);
}, { immediate: true, deep: true });

const emitChange = () => emit('update:modelValue', clone(settings.value));
</script>
