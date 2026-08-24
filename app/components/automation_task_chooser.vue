<template>
  <v-card variant="outlined" class="w-100 pa-4 mt-6 position-relative overflow-visible">
    <!-- Floating Label on Border -->
    <div
      class="position-absolute px-1"
      style="top: 0; left: 12px; transform: translateY(-50%); background-color: rgb(var(--v-theme-surface, 255, 255, 255)); z-index: 2; color: rgba(var(--v-theme-on-surface), 0.6); font-size: 12px; font-weight: 400; letter-spacing: 0.0333333333em;"
    >
      {{ t('automation.component.task_chooser.title', 'Task Chooser') }}
    </div>

    <div class="d-flex align-center justify-space-between mb-4">
      <div class="d-flex align-center ga-4">
        <!-- Checkbox for Multiple -->
        <v-checkbox
          v-if="firstCreateArtifact"
          v-model="localMultiple"
          :label="t('automation.component.task_chooser.arguments.multiple', 'Multiple')"
          hide-details
          density="compact"
          color="primary"
          class="mt-0"
        />
        <!-- Checkbox for Mark as Read -->
        <v-checkbox
          v-model="localMarkRead"
          :label="t('automation.component.task_chooser.imap_mark_read', 'Mark as Read')"
          hide-details
          density="compact"
          color="primary"
          class="mt-0"
        />
        <!-- Checkbox for Only New -->
        <v-checkbox
          v-model="localOnlyNew"
          :label="t('automation.component.task_chooser.only_new', 'Only New')"
          hide-details
          density="compact"
          color="primary"
          class="mt-0"
        />
        <!-- Checkbox for Source Links -->
        <v-checkbox
          v-model="localSourceLinks"
          :label="t('automation.component.task_chooser.source_links', 'Source Links')"
          hide-details
          density="compact"
          color="primary"
          class="mt-0"
        />
      </div>
      <div class="d-flex align-center ga-2">
        <v-btn
          v-if="localTasks.length > 0"
          color="error"
          variant="text"
          icon="mdi-close"
          size="small"
          :title="t('automation.component.task_chooser.clear_all', 'Clear All')"
          @click="clearTasks"
        />
        <v-menu offset-y>
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" color="primary" icon="mdi-plus" size="small" />
          </template>
          <v-list>
            <v-list-item
              v-for="task in tasksSchema"
              :key="task.name"
              @click="addTask(task)"
            >
              <v-list-item-title>
                {{ t('automation.component.task_chooser.' + task.name) }}
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
    </div>

    <!-- Blank initial state / Empty state -->
    <div
      v-if="localTasks.length === 0"
      class="d-flex flex-column align-center justify-center py-8 border-dashed rounded-lg text-grey-darken-1"
      style="border: 2px dashed #ccc;"
    >
      <v-icon size="40" class="mb-2">mdi-robot-vacuum</v-icon>
      <div class="text-body-2">
        {{ t('automation.component.task_chooser.empty', 'No operations added yet. Click the "+" button to add an operation.') }}
      </div>
    </div>

    <!-- Operations List -->
    <div v-else class="d-flex flex-column ga-3">
      <transition-group name="task-list">
        <v-sheet
          v-for="(item, index) in localTasks"
          :key="item._id || index"
          border
          rounded
          class="pa-3 d-flex flex-column ga-3 position-relative"
          style="background-color: var(--v-theme-surface-variant, #f8f9fa);"
        >
          <!-- Task Header with Reordering / Delete Actions -->
          <div class="d-flex align-center justify-space-between">
            <div class="text-subtitle-1 font-weight-bold text-secondary">
              {{ t('automation.component.task_chooser.' + item.name) }}
            </div>
            <div class="d-flex align-center ga-1">
              <!-- Move Up -->
              <v-btn
                icon="mdi-chevron-up"
                variant="text"
                size="x-small"
                :disabled="isMoveUpDisabled(index)"
                @click="moveUp(index)"
              />
              <!-- Move Down -->
              <v-btn
                icon="mdi-chevron-down"
                variant="text"
                size="x-small"
                :disabled="isMoveDownDisabled(index)"
                @click="moveDown(index)"
              />
              <!-- Delete -->
              <v-btn
                icon="mdi-close"
                color="error"
                variant="text"
                size="x-small"
                @click="removeTask(index)"
              />
            </div>
          </div>

          <!-- Dynamic Arguments Fields -->
          <v-row density="comfortable">
            <v-col
              v-for="(argType, argName) in getVisibleTaskArgumentsSchema(item, index)"
              :key="argName"
              cols="12"
              sm="6"
              md="4"
            >
              <!-- String field -->
              <v-text-field
                v-if="argType === 'string'"
                v-model="item.arguments[argName]"
                :label="t('automation.component.task_chooser.arguments.' + argName, argName)"
                density="compact"
                variant="outlined"
                hide-details="auto"
                :rules="getArgRules(item, argName, argType, index)"
              />

              <!-- Boolean field -->
              <v-checkbox
                v-else-if="argType === 'boolean'"
                v-model="item.arguments[argName]"
                :label="t('automation.component.task_chooser.arguments.' + argName, argName)"
                density="compact"
                hide-details
                color="primary"
              />

              <!-- Notification Channel dropdown -->
              <v-select
                v-else-if="argType === 'notification_channel_id'"
                v-model="item.arguments[argName]"
                :items="notificationChannels"
                item-title="title"
                item-value="value"
                :label="t('automation.component.task_chooser.arguments.' + argName, argName)"
                density="compact"
                variant="outlined"
                hide-details="auto"
                :rules="getArgRules(item, argName, argType, index)"
              />

              <!-- Task ID dropdown -->
              <v-select
                v-else-if="argType === 'task_id'"
                v-model="item.arguments[argName]"
                :items="llmCreateArtifactTasks"
                item-title="title"
                item-value="value"
                :label="t('automation.component.task_chooser.arguments.' + argName, argName)"
                density="compact"
                variant="outlined"
                hide-details="auto"
                :rules="getArgRules(item, argName, argType, index)"
              />

              <!-- Artifact Name dropdown -->
              <v-select
                v-else-if="argType === 'artifact_name'"
                v-model="item.arguments[argName]"
                :items="getArtifactOptions(index)"
                item-title="name"
                item-value="name"
                :label="t('automation.component.task_chooser.arguments.' + argName, argName)"
                density="compact"
                variant="outlined"
                hide-details="auto"
                :rules="getArgRules(item, argName, argType, index)"
              />

              <!-- Artifact Names multi-select dropdown -->
              <v-select
                v-else-if="argType === 'artifact_names'"
                v-model="item.arguments[argName]"
                :items="getArtifactOptions(index)"
                item-title="name"
                item-value="name"
                return-object
                :value-comparator="(a: any, b: any) => (a && b && typeof a === 'object' && typeof b === 'object' ? a.name === b.name : a === b)"
                :label="t('automation.component.task_chooser.arguments.' + argName, argName)"
                density="compact"
                variant="outlined"
                multiple
                chips
                closable-chips
                hide-details="auto"
                :rules="getArgRules(item, argName, argType, index)"
              />
            </v-col>
          </v-row>
        </v-sheet>
      </transition-group>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet } from '#ba/util/fetch/wrappers';

interface TaskSchema {
  name: string;
  arguments: Record<string, string>;
}

interface LocalTaskInstance {
  _id: string; // Internal key to keep Vue key binding unique and stable
  name: string;
  arguments: Record<string, any>;
}

const props = defineProps<{
  modelValue?: {
    multiple?: boolean;
    imap_mark_read?: boolean;
    source_links?: boolean;
    tasks?: any[];
  } | string;
}>();

const emit = defineEmits(['update:modelValue']);

const { t } = useI18n();

const tasksSchema = ref<TaskSchema[]>([]);
const notificationChannels = ref<{ title: string; value: string; provider?: string }[]>([]);
const llmCreateArtifactTasks = ref<{ title: string; value: string }[]>([]);
const localTasks = ref<LocalTaskInstance[]>([]);
const localMultiple = ref(false);
const localMarkRead = ref(false);
const localSourceLinks = ref(false);
const localOnlyNew = ref(false);

// Track last emitted JSON payload to prevent feedback loops
let lastEmittedJson = '';

// Generate a random stable ID for list tracking
const generateId = () => Math.random().toString(36).substring(2, 9);

// Computed check for first create_artifact task in the list
const firstCreateArtifact = computed(() => localTasks.value.find(t => t.name === 'create_artifact'));

// Helper to look up argument definitions of a task name
const getTaskArgumentsSchema = (name: string) => {
  const schema = tasksSchema.value.find(t => t.name === name);
  return (schema && schema.arguments) ? schema.arguments : {};
};

// Helper to get available artifact options based on preceding mapped tasks
const getArtifactOptionsForMapped = (mappedTasks: LocalTaskInstance[]) => {
  const options: Array<{ name: string; mime_type: string }> = [
    { name: 'email', mime_type: 'text/plain' }
  ];

  for (const prevTask of mappedTasks) {
    if (prevTask && prevTask.arguments?.name && typeof prevTask.arguments.name === 'string' && prevTask.arguments.name.trim() !== '') {
      const taskDef = tasksSchema.value.find(t => t.name === prevTask.name);
      const mimeType = (taskDef as any)?.mime_type || 'text/plain';
      options.push({
        name: prevTask.arguments.name.trim(),
        mime_type: mimeType
      });
    }
  }

  return options;
};

// Get dynamic options for artifact name select fields
const getArtifactOptions = (index: number) => {
  const options: Array<{ name: string; mime_type: string }> = [
    { name: 'email', mime_type: 'text/plain' }
  ];

  for (let j = 0; j < index; j++) {
    const prevTask = localTasks.value[j];
    if (prevTask && prevTask.arguments?.name && typeof prevTask.arguments.name === 'string' && prevTask.arguments.name.trim() !== '') {
      const taskDef = tasksSchema.value.find(t => t.name === prevTask.name);
      const mimeType = (taskDef as any)?.mime_type || 'text/plain';
      options.push({
        name: prevTask.arguments.name.trim(),
        mime_type: mimeType
      });
    }
  }

  return options;
};

// Helper to prune orphaned artifact references when upstream tasks are deleted or renamed
const sanitizeArtifactSelections = () => {
  if (!tasksSchema.value || tasksSchema.value.length === 0) return;

  for (let index = 0; index < localTasks.value.length; index++) {
    const item = localTasks.value[index];
    const schema = getTaskArgumentsSchema(item.name);
    if (!schema) continue;

    const availableOptions = getArtifactOptions(index);
    const availableNames = new Set(availableOptions.map(opt => opt.name));

    for (const [argName, argType] of Object.entries(schema)) {
      if (argType === 'artifact_name') {
        const val = item.arguments[argName];
        if (val && !availableNames.has(val)) {
          item.arguments[argName] = availableOptions[0]?.name || t('automation.component.task_chooser.message');
        }
      } else if (argType === 'artifact_names') {
        const val = item.arguments[argName];
        if (Array.isArray(val)) {
          const filtered = val.filter((src: any) => {
            const srcName = typeof src === 'string' ? src : src?.name;
            return availableNames.has(srcName);
          });
          if (filtered.length === 0 && availableOptions.length > 0) {
            item.arguments[argName] = [availableOptions[0]];
          } else if (filtered.length !== val.length) {
            item.arguments[argName] = filtered;
          }
        }
      }
    }
  }
};

// Parse incoming props modelValue into localTasks state
const updateLocalTasksFromProps = (newVal: any) => {
  let parsedVal = newVal;
  if (typeof newVal === 'string') {
    try {
      parsedVal = JSON.parse(newVal);
    } catch (e) {
      console.error('Failed to parse tasks modelValue string:', e);
      parsedVal = null;
    }
  }

  if (!parsedVal) {
    localTasks.value = [];
    localMultiple.value = false;
    localMarkRead.value = false;
    localSourceLinks.value = false;
    localOnlyNew.value = false;
    return;
  }

  // Support direct array format fallback
  if (Array.isArray(parsedVal)) {
    parsedVal = { multiple: false, imap_mark_read: false, source_links: false, only_new: false, tasks: parsedVal };
  }

  localMultiple.value = !!parsedVal.multiple;
  localMarkRead.value = !!parsedVal.imap_mark_read;
  localSourceLinks.value = !!parsedVal.source_links;
  localOnlyNew.value = !!parsedVal.only_new;

  const rawTasks = parsedVal.tasks || [];
  let mapped: LocalTaskInstance[] = [];

  for (let index = 0; index < rawTasks.length; index++) {
    const t = rawTasks[index];
    if (!t) continue;

    // Backward compatibility migration: if old tasks array contains imap_mark_read task
    if (t.name === 'imap_mark_read') {
      localMarkRead.value = true;
      continue;
    }

    const args = { ...(t.arguments || {}) };
    const schema = getTaskArgumentsSchema(t.name);
    if (schema) {
      for (const [argName, argType] of Object.entries(schema)) {
        if (argType === 'artifact_names' && args[argName]) {
          if (!Array.isArray(args[argName])) {
            args[argName] = [args[argName]];
          }
          const availableOptions = getArtifactOptionsForMapped(mapped);
          args[argName] = args[argName].map((item: any) => {
            const itemName = typeof item === 'string' ? item : item?.name;
            const matchedOption = availableOptions.find(opt => opt.name === itemName);
            if (matchedOption) {
              return matchedOption;
            }
            if (typeof item === 'string') {
              return { name: item, mime_type: 'text/plain' };
            }
            return item;
          });
        }
      }
    }
    mapped.push({
      _id: generateId(),
      name: t.name,
      arguments: args
    });
  }

  localTasks.value = mapped;
  sanitizeArtifactSelections();
};

// Watch modelValue prop changes from parent
watch(() => props.modelValue, (newVal) => {
  const currentSerialized = JSON.stringify(newVal);
  if (currentSerialized !== lastEmittedJson) {
    updateLocalTasksFromProps(newVal);
  }
}, { immediate: true, deep: true });

// Watch tasksSchema changes (e.g. when API fetch completes)
watch(tasksSchema, () => {
  lastEmittedJson = '';
  updateLocalTasksFromProps(props.modelValue);
}, { deep: true });

// Emit updates back to parent
const emitUpdate = () => {
  sanitizeArtifactSelections();
  const tasksOutput = localTasks.value.map(t => ({
    name: t.name,
    arguments: { ...t.arguments }
  }));
  const payload = {
    multiple: localMultiple.value,
    imap_mark_read: localMarkRead.value,
    source_links: localSourceLinks.value,
    only_new: localOnlyNew.value,
    tasks: tasksOutput
  };
  lastEmittedJson = JSON.stringify(payload);
  emit('update:modelValue', payload);
};

// Watch local modifications and emit
watch([localTasks, localMultiple, localMarkRead, localSourceLinks, localOnlyNew], () => {
  emitUpdate();
}, { deep: true });

// Fetch schemas and notification channels
onMounted(async () => {
  try {
    // 1. Fetch task definitions
    const taskRes = await apiGet('/api/v0.1/app/automation/tasks');
    tasksSchema.value = Array.isArray(taskRes) ? taskRes : [];

    // Re-evaluate local tasks with loaded schemas
    lastEmittedJson = '';
    updateLocalTasksFromProps(props.modelValue);

    // 2. Fetch notification channels
    const channelRes = await apiGet('/api/user/notification');
    const rawChannels = Array.isArray(channelRes) ? channelRes : (channelRes?.data || []);
    notificationChannels.value = rawChannels.map((item: any) => ({
      title: item.name || item.provider || item.id,
      value: item.id,
      provider: item.provider
    }));

    // 3. Fetch LLM Create Artifact config options
    const artifactRes = await apiGet('/api/v0.1/app/llm_create_artifact');
    const rawArtifacts = Array.isArray(artifactRes) ? artifactRes : (artifactRes?.data || []);
    llmCreateArtifactTasks.value = rawArtifacts.map((item: any) => ({
      title: item.name,
      value: item.id
    }));
  } catch (error) {
    console.error('Failed to load automation task chooser data:', error);
  }
});

// Helper to compute visible arguments considering first-usage and Email provider rules
const getVisibleTaskArgumentsSchema = (item: LocalTaskInstance, index: number) => {
  const schema = getTaskArgumentsSchema(item.name);
  const visible: Record<string, string> = {};
  if (schema) {
    for (const [argName, argType] of Object.entries(schema)) {
      // Rule 2: 'keep_threadid' only if destination channel provider is 'Email' or 'IMAP'
      if ((item.name === 'send_message' || item.name === 'send_attachment' || item.name === 'send_items') && argName === 'keep_threadid') {
        const channelId = item.arguments?.destination;
        const channel = notificationChannels.value.find(c => c.value === channelId);
        const provider = channel?.provider?.toLowerCase();
        if (provider && provider !== 'email' && provider !== 'imap') {
          continue;
        }
      }
      visible[argName] = argType;
    }
  }
  return visible;
};

// Add a new task to the list
const addTask = (task: TaskSchema) => {
  const initialArgs: Record<string, any> = {};
  
  // Seed initial arguments based on type
  if (task.arguments) {
    for (const [argName, argType] of Object.entries(task.arguments)) {
      if (argType === 'boolean') {
        initialArgs[argName] = false;
      } else if (argType === 'artifact_name') {
        initialArgs[argName] = 'email';
      } else if (argType === 'artifact_names') {
        initialArgs[argName] = [{ name: 'email', mime_type: 'text/plain' }];
      } else if (argType === 'notification_channel_id') {
        initialArgs[argName] = notificationChannels.value[0]?.value || null;
      } else if (argType === 'task_id') {
        initialArgs[argName] = llmCreateArtifactTasks.value[0]?.value || null;
      } else {
        initialArgs[argName] = '';
      }
    }
  }

  localTasks.value.push({
    _id: generateId(),
    name: task.name,
    arguments: initialArgs
  });
  
  sanitizeArtifactSelections();
  emitUpdate();
};

// Remove a task at index
const removeTask = (index: number) => {
  localTasks.value.splice(index, 1);
  sanitizeArtifactSelections();
  emitUpdate();
};

// Clear all tasks
const clearTasks = () => {
  localTasks.value = [];
  emitUpdate();
};

// Reordering rules
const isMoveUpDisabled = (index: number) => {
  return index === 0;
};

const isMoveDownDisabled = (index: number) => {
  return index === localTasks.value.length - 1;
};

const moveUp = (index: number) => {
  if (isMoveUpDisabled(index)) return;
  const temp = localTasks.value[index];
  localTasks.value[index] = localTasks.value[index - 1];
  localTasks.value[index - 1] = temp;
  sanitizeArtifactSelections();
  emitUpdate();
};

const moveDown = (index: number) => {
  if (isMoveDownDisabled(index)) return;
  const temp = localTasks.value[index];
  localTasks.value[index] = localTasks.value[index + 1];
  localTasks.value[index + 1] = temp;
  sanitizeArtifactSelections();
  emitUpdate();
};

const getArgRules = (item: LocalTaskInstance, argName: string, argType: string, index: number) => {
  const rules: any[] = [];
  
  if (argType === 'string' || argType === 'notification_channel_id' || argType === 'artifact_name' || argType === 'task_id') {
    rules.push((v: any) => {
      if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
        return t('rules.required');
      }
      return true;
    });
  } else if (argType === 'artifact_names') {
    rules.push((v: any) => {
      if (!Array.isArray(v) || v.length === 0) {
        return t('rules.required');
      }
      return true;
    });
  }
  
  if (argName === 'name') {
    rules.push((v: string) => {
      if (!v) return true;
      const duplicates = localTasks.value.filter(
        (t, idx) => t.name === item.name && t.arguments?.name === v && idx !== index
      );
      return duplicates.length === 0 || t('rules.unique_name');
    });
  }
  
  return rules;
};
</script>

<style scoped>
.task-list-move,
.task-list-enter-active,
.task-list-leave-active {
  transition: all 0.3s ease;
}

.task-list-enter-from,
.task-list-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.task-list-leave-active {
  position: absolute;
  width: 100%;
}
</style>
