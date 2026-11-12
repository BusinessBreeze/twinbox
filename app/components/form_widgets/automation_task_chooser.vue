<template>
  <v-card variant="outlined" class="w-100 pa-4 mt-6 position-relative overflow-visible">
    <!-- Floating Label on Border -->
    <div
      class="position-absolute px-1"
      style="top: 0; left: 12px; transform: translateY(-50%); background-color: rgb(var(--v-theme-surface, 255, 255, 255)); z-index: 2; color: rgba(var(--v-theme-on-surface), 0.6); font-size: 12px; font-weight: 400; letter-spacing: 0.0333333333em;"
    >
      {{ t('automation.component.task_chooser.title') }}
    </div>

    <div class="d-flex align-center justify-end mb-3">
      <v-menu offset-y>
        <template v-slot:activator="{ props: menuProps }">
          <v-btn v-bind="menuProps" color="primary" icon="mdi-plus" size="small" :title="t('automation.component.task_chooser.add')" />
        </template>
        <v-list>
          <v-list-item v-for="def in definitions" :key="def.type" @click="addTask(def)">
            <v-list-item-title>{{ t(def.title) }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </div>

    <div
      v-if="tasks.length === 0"
      class="d-flex flex-column align-center justify-center py-8 rounded-lg text-grey-darken-1"
      style="border: 2px dashed #ccc;"
    >
      <v-icon size="40" class="mb-2">mdi-robot-vacuum</v-icon>
      <div class="text-body-2">{{ t('automation.component.task_chooser.empty') }}</div>
    </div>

    <v-expansion-panels v-else v-model="openPanel" variant="accordion">
      <v-expansion-panel v-for="(task, index) in tasks" :key="task.id" :value="task.id">
        <v-expansion-panel-title>
          <div class="d-flex align-center w-100 ga-2" style="min-width: 0;">
            <v-icon v-if="taskProblems(task, index).length > 0" color="error" size="small">mdi-alert-circle</v-icon>
            <span class="font-weight-bold text-truncate">{{ t(defOf(task)?.title || task.type) }}</span>
            <v-chip size="x-small" variant="tonal" class="flex-shrink-0">{{ t(defOf(task)?.title || task.type) }}</v-chip>
            <span class="text-caption text-medium-emphasis text-truncate flex-grow-1">{{ summaryOf(task) }}</span>
            <div class="d-flex flex-shrink-0 me-2" @click.stop>
              <v-btn icon="mdi-chevron-up" variant="text" size="x-small" :disabled="index === 0" :title="t('automation.component.task_chooser.move_up')" @click="move(index, -1)" />
              <v-btn icon="mdi-chevron-down" variant="text" size="x-small" :disabled="index === tasks.length - 1" :title="t('automation.component.task_chooser.move_down')" @click="move(index, 1)" />
              <v-btn icon="mdi-close" color="error" variant="text" size="x-small" :title="t('automation.component.task_chooser.delete')" @click="removeTask(index)" />
            </div>
          </div>
        </v-expansion-panel-title>

        <v-expansion-panel-text>
          <div v-for="problem in taskProblems(task, index)" :key="problem" class="text-error text-caption mb-2">
            {{ t(problem) }}
          </div>

          <v-text-field
            v-model="task.label"
            :label="t('automation.component.task_chooser.label')"
            density="compact"
            @update:model-value="emitChange"
            @update:focused="(focused: boolean) => { if (!focused) ensureUniqueLabel(task) }"
          />

          <v-select
            v-model="task.inputs"
            :items="inputOptions(index)"
            :label="t('automation.component.task_chooser.inputs')"
            :multiple="defOf(task)?.inputs.max !== 1"
            :chips="defOf(task)?.inputs.max !== 1"
            density="compact"
            @update:model-value="(v: any) => { task.inputs = Array.isArray(v) ? v : (v ? [v] : []); emitChange() }"
          >
            <!-- An input that is no longer available here (task moved or deleted) shows nothing instead of its id;
                 it stays in the data, and the card shows a warning, until it is replaced. -->
            <template #chip="{ item, props: chipProps }">
              <v-chip v-if="isAvailableInput(index, item.value)" v-bind="chipProps" :text="item.title" />
            </template>
            <template #selection="{ item }">
              <span v-if="isAvailableInput(index, item.value)">{{ item.title }}</span>
            </template>
          </v-select>

          <v-checkbox
            v-model="task.aggregate"
            :label="t('automation.component.task_chooser.aggregate')"
            :hint="t('automation.component.task_chooser.aggregate_hint')"
            persistent-hint
            density="compact"
            class="mb-3"
            @update:model-value="emitChange"
          />

          <template v-for="arg in visibleArgs(task)" :key="arg.key">
            <div v-if="arg.set_type === 'prompt'" class="mb-2">
              <v-textarea
                v-model="task.args[arg.key]"
                :label="t(arg.title)"
                :rules="promptRules(arg)"
                :counter="arg.opts?.max_chars"
                :persistent-counter="!!arg.opts?.max_chars"
                auto-grow
                rows="3"
                max-rows="10"
                density="compact"
                @update:model-value="emitChange"
              >
                <template #append-inner>
                  <!-- ✨ drafts the instruction from the staged emails (improves what is already written) -->
                  <v-btn icon="mdi-creation" variant="text" size="x-small" color="primary" :loading="drafting === `${task.id}:${arg.key}`"
                    :title="t('automation_draft.suggest_task_prompt')" @click="suggestPrompt(task, arg)" />
                  <v-btn icon="mdi-arrow-expand" variant="text" size="x-small" :title="t('automation.component.task_chooser.expand_prompt')" @click="openPromptEditor(task, arg)" />
                </template>
              </v-textarea>
            </div>

            <v-select
              v-else-if="arg.set_type === 'channel'"
              v-model="task.args[arg.key]"
              :items="channels"
              :label="t(arg.title)"
              :rules="arg.required ? [requiredRule] : []"
              :no-data-text="t('automation.component.task_chooser.no_channels')"
              density="compact"
              @update:model-value="emitChange"
            />

            <v-checkbox
              v-else-if="arg.set_type === 'boolean'"
              v-model="task.args[arg.key]"
              :label="t(arg.title)"
              density="compact"
              hide-details
              @update:model-value="emitChange"
            />

            <v-select
              v-else-if="arg.set_type === 'enum'"
              v-model="task.args[arg.key]"
              :items="arg.enum_values || []"
              :label="t(arg.title)"
              density="compact"
              @update:model-value="emitChange"
            />

            <v-text-field
              v-else
              v-model="task.args[arg.key]"
              :label="t(arg.title)"
              :rules="arg.required ? [requiredRule] : []"
              density="compact"
              @update:model-value="emitChange"
            />
          </template>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <!-- Joins the form's validation: Save stays disabled while a task has a problem, also on cards never opened -->
    <v-input :model-value="problemCount" :rules="[noProblemsRule]" hide-details="auto" class="mt-2" />

    <!-- Full-size prompt editor -->
    <v-dialog v-model="promptEditor.open" max-width="1000">
      <v-card>
        <v-card-title>{{ promptEditor.title }}</v-card-title>
        <v-card-text>
          <v-textarea
            v-if="promptEditor.task && promptEditor.key"
            v-model="promptEditor.task.args[promptEditor.key]"
            :rules="promptEditor.arg ? promptRules(promptEditor.arg) : []"
            :counter="promptEditor.arg?.opts?.max_chars"
            :persistent-counter="!!promptEditor.arg?.opts?.max_chars"
            rows="20"
            class="prompt-editor"
            @update:model-value="emitChange"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="promptEditor.open = false">{{ t('automation.component.task_chooser.close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
// Task chooser: edits automations.tasks (TaskInstance[]). Task types come from GET /api/v0.1/app/automation/tasks.
// Tasks reference each other by id; 'source' is the reserved input for the items the source fetched.
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost } from '#ba/utils/fetch/wrappers';
import type { TaskArgInfo as TaskArg, TaskDefinitionInfo as TaskDefinition, TaskInstance } from '#shared/types/automation_tasks';
import { SOURCE_INPUT, mimeMatches } from '#shared/utils/automation_tasks';
import { getUniqueName } from '#shared/utils/unique_name';

// header.opts.sourceMime(formData): what the selected source produces (its type's itemMime), null while none is chosen
const props = defineProps<{ modelValue?: TaskInstance[] | any; header?: any; formData?: any }>();
const emit = defineEmits(['update:modelValue']);
const { t } = useI18n();

const definitions = ref<TaskDefinition[]>([]);
const channels = ref<{ title: string; value: string; provider: string }[]>([]);
const tasks = ref<TaskInstance[]>([]);

/** The task's arguments to show: one with `show_if` only when the channel picked in its `arg` has a listed provider. */
const visibleArgs = (task: TaskInstance) => (defOf(task)?.args || []).filter((arg) => {
  if (!arg.show_if) return true;
  const provider = channels.value.find((c) => c.value === task.args[arg.show_if!.arg])?.provider;
  return !!provider && arg.show_if.provider.includes(provider);
});
const openPanel = ref<string | null>(null);
const promptEditor = reactive<{ open: boolean; title: string; task: TaskInstance | null; key: string | null; arg: TaskArg | null }>({
  open: false, title: '', task: null, key: null, arg: null,
});

const requiredRule = (v: any) => (v !== undefined && v !== null && String(v).trim() !== '') || t('automation.component.task_chooser.required');
// ✨ on a prompt: the drafted instruction replaces the field (the current text is passed as what to improve)
const drafting = ref<string | null>(null);
const suggestPrompt = async (task: TaskInstance, arg: TaskArg) => {
  if (drafting.value) return;
  drafting.value = `${task.id}:${arg.key}`;
  try {
    const res = await apiPost<any>('/api/v0.1/app/automation/draft', { target: 'task_prompt', current: task.args[arg.key] || '' });
    if (res?.data?.text) {
      task.args[arg.key] = res.data.text;
      emitChange();
    }
  } catch {
    // the error is shown by apiPost
  } finally {
    drafting.value = null;
  }
};

// A prompt: required if the task needs it, and no longer than its limit (opts.max_chars, the LLM prompt limit)
const promptRules = (arg: TaskArg) => [
  ...(arg.required ? [requiredRule] : []),
  (v: any) => !arg.opts?.max_chars || String(v ?? '').length <= arg.opts.max_chars || t('table.automation.rules.tasks.prompt.too_long'),
];

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// Older automations stored { multiple, tasks: [...] }; anything that is not a list starts empty.
watch(() => props.modelValue, (val) => {
  const incoming = Array.isArray(val) ? val : [];
  if (JSON.stringify(incoming) !== JSON.stringify(tasks.value)) {
    tasks.value = clone(incoming).map((task: TaskInstance) => ({ ...task, args: task.args || {}, inputs: task.inputs || [] }));
  }
}, { immediate: true, deep: true });

const emitChange = () => emit('update:modelValue', clone(tasks.value));

const defOf = (task: TaskInstance) => definitions.value.find((d) => d.type === task.type);

const sourceMime = (): string | null => props.header?.opts?.sourceMime?.(props.formData) ?? null;

const outputMimeOf = (inputId: string): string | null => {
  if (inputId === SOURCE_INPUT) return sourceMime();
  const producer = tasks.value.find((task) => task.id === inputId);
  return producer ? defOf(producer)?.output?.mime ?? null : null;
};

/** Inputs a task may use: the source and earlier tasks that produce something it accepts. */
const inputOptions = (index: number) => {
  const accepts = defOf(tasks.value[index]!)?.inputs.accepts || ['*'];
  const options = [{ title: t('automation.component.task_chooser.source'), value: SOURCE_INPUT }];
  for (const earlier of tasks.value.slice(0, index)) {
    const mime = defOf(earlier)?.output?.mime;
    if (mime) options.push({ title: earlier.label || t(defOf(earlier)?.title || earlier.type), value: earlier.id });
  }
  return options.filter((o) => {
    if (o.value === SOURCE_INPUT && !sourceMime()) return true;   // no source chosen yet: can't tell
    const mime = outputMimeOf(o.value);
    return mime && mimeMatches(mime, accepts);
  });
};

const isAvailableInput = (index: number, id: string) => inputOptions(index).some((o) => o.value === id);

/** Problems shown on the card; the server checks the same things on save. */
const taskProblems = (task: TaskInstance, index: number): string[] => {
  const def = defOf(task);
  if (!def) return definitions.value.length > 0 ? ['automation.component.task_chooser.unknown_type'] : [];
  const problems: string[] = [];
  const allowed = new Set(inputOptions(index).map((o) => o.value));
  if (task.inputs.length < def.inputs.min) problems.push('automation.component.task_chooser.inputs_missing');
  if (task.inputs.some((id) => !allowed.has(id))) problems.push('automation.component.task_chooser.input_invalid');
  if (def.args.some((arg) => arg.required && requiredRule(task.args[arg.key]) !== true)) {
    problems.push('automation.component.task_chooser.args_missing');
  }
  if (def.args.some((arg) => arg.opts?.max_chars && String(task.args[arg.key] ?? '').length > arg.opts.max_chars)) {
    problems.push('automation.component.task_chooser.args_too_long');
  }
  return problems;
};

const problemCount = computed(() => tasks.value.reduce((n, task, index) => n + taskProblems(task, index).length, 0));
const noProblemsRule = (count: number) => count === 0 || t('automation.component.task_chooser.has_problems');

const summaryOf = (task: TaskInstance) => {
  const key = defOf(task)?.summaryArg;
  if (!key) return '';
  const value = task.args[key];
  if (defOf(task)?.args.find((a) => a.key === key)?.set_type === 'channel') {
    return channels.value.find((c) => c.value === value)?.title || '';
  }
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').slice(0, 80) : '';
};

const newId = () => `t_${(globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 8)}`;

const addTask = (def: TaskDefinition) => {
  const task: TaskInstance = {
    id: newId(),
    type: def.type,
    version: def.version,
    label: getUniqueName(t(def.title), tasks.value.map((other) => other.label)),
    inputs: [],
    args: Object.fromEntries(def.args.filter((a) => a.default !== undefined).map((a) => [a.key, clone(a.default)])),
    aggregate: false,
  };
  tasks.value.push(task);
  // Default input: the latest compatible step (an earlier task's output, else the source).
  const options = inputOptions(tasks.value.length - 1);
  const preferred = options[options.length - 1];
  if (preferred) task.inputs = [preferred.value];
  openPanel.value = task.id;
  emitChange();
};

/** Labels name the outputs, so they must be unique: a duplicate gets " (1)", " (2)" ... when the field is left. */
const ensureUniqueLabel = (task: TaskInstance) => {
  const others = tasks.value.filter((other) => other !== task).map((other) => other.label);
  const unique = getUniqueName(task.label.trim() || t(defOf(task)?.title || task.type), others);
  if (unique !== task.label) {
    task.label = unique;
    emitChange();
  }
};

const removeTask = (index: number) => {
  tasks.value.splice(index, 1);
  emitChange();
};

const move = (index: number, delta: number) => {
  const target = index + delta;
  if (target < 0 || target >= tasks.value.length) return;
  const [task] = tasks.value.splice(index, 1);
  tasks.value.splice(target, 0, task!);
  emitChange();
};

const openPromptEditor = (task: TaskInstance, arg: TaskArg) => {
  promptEditor.task = task;
  promptEditor.key = arg.key;
  promptEditor.arg = arg;
  promptEditor.title = `${task.label} — ${t(arg.title)}`;
  promptEditor.open = true;
};

onMounted(async () => {
  try {
    const [defs, channelRes] = await Promise.all([
      apiGet<TaskDefinition[]>('/api/v0.1/app/automation/tasks'),
      apiGet<any>('/api/user/notification'),
    ]);
    definitions.value = Array.isArray(defs) ? defs : [];
    const list = Array.isArray(channelRes) ? channelRes : (channelRes?.data || []);
    channels.value = list.map((c: any) => ({ title: c.name || c.id, value: c.id, provider: String(c.provider || '').toLowerCase() }));
  } catch (err) {
    console.error('Failed to load task chooser data', err);
  }
});
</script>

<style scoped>
.prompt-editor :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>
