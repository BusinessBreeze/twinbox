<template>
  <v-card class="dashboard-events-panel rounded-lg d-flex flex-column h-100 min-w-0" variant="flat">
    <EventList
      class="flex-grow-1"
      :title="automationTitle"
      :events="automationEvents"
      :loading="loading"
      :has-more="!!cursor"
      @close="emit('close')"
      @deleted="onDeleted"
      @more="fetchEvents(true)"
    />
  </v-card>
</template>

<script setup lang="ts">
// One automation's events on the dashboard: the shared event list (base layer) with the events of this automation
// (category automation, its id in the metadata; older events without an id by its name).
import { ref, computed, watch } from 'vue';
import EventList, { type EventListItem } from '#ba/components/event_list.vue';

const props = defineProps<{ automation?: { id?: string | number; title?: string; name?: string } | null }>();
// changed: events were deleted (the dashboard updates the cards' problem counts)
const emit = defineEmits(['close', 'changed']);

const events = ref<EventListItem[]>([]);
const loading = ref(false);

const automationTitle = computed(() => props.automation?.title || props.automation?.name || '');
const automationId = computed(() => (props.automation?.id ? String(props.automation.id) : ''));

const metaOf = (ev: EventListItem): Record<string, any> => {
  if (typeof ev.metadata !== 'string') return ev.metadata ?? {};
  try { return JSON.parse(ev.metadata); } catch { return {}; }
};

const automationEvents = computed(() => {
  const name = automationTitle.value.toLowerCase().trim();
  return events.value.filter((ev) => {
    const meta = metaOf(ev);
    if (meta.id) return String(meta.id) === automationId.value;
    return !!name && String(meta.name || meta.automationName || '').toLowerCase().trim() === name;
  });
});

// Automation events, newest first, 100 at a time (`older`: the next 100 by the server's cursor); this automation's
// are picked out above
const cursor = ref<string | null>(null);
const fetchEvents = async (older = false) => {
  if (older && !cursor.value) return;
  loading.value = true;
  try {
    const query = new URLSearchParams({ limit: '100', sortBy: 'createdAt', sortDir: 'desc', category: 'automation' });
    if (older) query.set('cursor', cursor.value!);
    const res = await $fetch<any>(`/api/user/event/search?${query}`).catch(() => ({ data: [], cursor: null }));
    events.value = older ? [...events.value, ...(res?.data || [])] : res?.data || [];
    cursor.value = res?.cursor ?? null;
  } finally {
    loading.value = false;
  }
};

const onDeleted = (ids: string[]) => {
  events.value = events.value.filter((ev) => !ids.includes(ev.id));
  emit('changed');
};

watch(() => props.automation?.id, () => fetchEvents(), { immediate: true });
</script>

<style scoped>
.dashboard-events-panel {
  background-color: rgb(var(--v-theme-surface));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
  overflow: hidden;
}
</style>
