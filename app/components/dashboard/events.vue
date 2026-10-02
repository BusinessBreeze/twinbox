<template>
  <v-card
    class="dashboard-events-panel rounded-lg d-flex flex-column h-100 min-w-0"
    variant="flat"
  >
    <!-- Header -->
    <div class="events-header d-flex align-center justify-space-between px-3 py-2 border-b">
      <!-- Left: Level filter buttons -->
      <div class="d-flex align-center ga-1">
        <!-- Info Filter -->
        <v-btn
          icon
          size="x-small"
          :variant="isLevelActive('info') ? 'flat' : 'outlined'"
          :color="isLevelActive('info') ? 'info' : undefined"
          :title="$t('common.info') || 'Info'"
          @click="toggleLevel('info')"
        >
          <v-icon size="16">mdi-information</v-icon>
        </v-btn>

        <!-- Warning Filter -->
        <v-btn
          icon
          size="x-small"
          :variant="isLevelActive('warn') ? 'flat' : 'outlined'"
          :color="isLevelActive('warn') ? 'warning' : undefined"
          :title="$t('common.warning') || 'Warning'"
          @click="toggleLevel('warn')"
        >
          <v-icon size="16">mdi-alert</v-icon>
        </v-btn>

        <!-- Error Filter -->
        <v-btn
          icon
          size="x-small"
          :variant="isLevelActive('error') ? 'flat' : 'outlined'"
          :color="isLevelActive('error') ? 'error' : undefined"
          :title="$t('common.error') || 'Error'"
          @click="toggleLevel('error')"
        >
          <v-icon size="16">mdi-alert-circle</v-icon>
        </v-btn>
      </div>

      <!-- Center: Automation Name -->
      <div
        class="events-title text-subtitle-1 font-weight-bold text-truncate text-center px-2 flex-grow-1 text-primary"
        :title="automationTitle"
      >
        {{ automationTitle }}
      </div>

      <!-- Right: Mark as read icon (when items selected) & Close button -->
      <div class="d-flex align-center ga-1">
        <!-- Mark Selected as Read Button -->
        <v-btn
          v-if="selectedIds.length > 0"
          icon
          size="x-small"
          color="primary"
          variant="tonal"
          :title="`${$t('common.mark_read') || 'Mark as read'} (${selectedIds.length})`"
          :loading="markingRead"
          @click="markSelectedAsRead"
        >
          <v-icon size="18">mdi-email-open-outline</v-icon>
        </v-btn>

        <!-- Close Button -->
        <v-btn
          icon="mdi-close"
          variant="text"
          size="x-small"
          color="medium-emphasis"
          @click="$emit('close')"
        />
      </div>
    </div>

    <!-- Table Body -->
    <div class="events-table-wrapper flex-grow-1 overflow-y-auto">
      <v-table density="compact" class="events-table" fixed-header>
        <thead>
          <tr>
            <th class="text-center px-1" style="width: 38px;">
              <v-checkbox-btn
                :model-value="isAllSelected"
                :indeterminate="isSomeSelected && !isAllSelected"
                density="compact"
                hide-details
                color="primary"
                @update:model-value="toggleSelectAll"
              />
            </th>
            <th class="text-center px-1" style="width: 34px;"></th>
            <th class="text-left font-weight-bold" style="width: 125px;">{{ $t('common.date') || 'Date' }}</th>
            <th class="text-left font-weight-bold">{{ $t('common.message') || 'Message' }}</th>
          </tr>
        </thead>
        <tbody>
          <!-- Loading State -->
          <tr v-if="loading">
            <td colspan="4" class="text-center py-6 text-medium-emphasis">
              <v-progress-circular indeterminate size="24" color="primary" class="mr-2" />
              <span class="text-caption">{{ $t('common.loading') || 'Loading events...' }}</span>
            </td>
          </tr>

          <!-- Empty State -->
          <tr v-else-if="paginatedEvents.length === 0">
            <td colspan="4" class="text-center py-6 text-medium-emphasis">
              <v-icon icon="mdi-bell-sleep-outline" size="28" class="mb-1 d-block mx-auto text-disabled" />
              <span class="text-caption">{{ $t('common.no_events') || 'No events found for this automation' }}</span>
            </td>
          </tr>

          <!-- Event Rows -->
          <tr
            v-for="event in paginatedEvents"
            v-else
            :key="event.id"
            class="event-row"
            :class="{ 'event-row--unread': !event.read, 'event-row--selected': isSelected(event.id) }"
          >
            <!-- Checkbox -->
            <td class="text-center px-1">
              <v-checkbox-btn
                :model-value="isSelected(event.id)"
                density="compact"
                hide-details
                color="primary"
                @update:model-value="toggleSelect(event.id)"
              />
            </td>

            <!-- Level Icon -->
            <td class="text-center px-1">
              <v-icon :color="getLevelColor(event.level)" size="18">
                {{ getLevelIcon(event.level) }}
              </v-icon>
            </td>

            <!-- Date -->
            <td class="text-caption font-mono text-medium-emphasis py-1">
              {{ formatDateTime(event.createdAt || event.created_at) }}
            </td>

            <!-- Message Text -->
            <td class="text-caption py-1" :class="{ 'font-weight-medium text-black': !event.read, 'text-medium-emphasis': !!event.read }">
              {{ formatEventMessage(event) }}
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <!-- Footer / Pagination -->
    <div class="events-footer d-flex align-center justify-space-between px-3 py-1 border-t">
      <!-- Items per page selector -->
      <div class="d-flex align-center ga-2">
        <span class="text-caption text-medium-emphasis">{{ $t('common.items_per_page') || 'Items' }}:</span>
        <v-select
          v-model="limit"
          :items="[5, 10, 20, 50]"
          density="compact"
          variant="plain"
          hide-details
          class="limit-select"
        />
      </div>

      <!-- Pagination controls -->
      <div class="d-flex align-center ga-1">
        <span class="text-caption text-medium-emphasis mr-2">
          {{ paginationSummary }}
        </span>

        <!-- Prev Page -->
        <v-btn
          icon="mdi-chevron-left"
          size="x-small"
          variant="text"
          :disabled="page <= 1 || loading"
          @click="prevPage"
        />

        <!-- Next Page -->
        <v-btn
          icon="mdi-chevron-right"
          size="x-small"
          variant="text"
          :disabled="!hasMore || loading"
          @click="nextPage"
        />
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

interface Props {
  automation?: {
    id?: string | number;
    title?: string;
    name?: string;
  } | null;
}

const props = defineProps<Props>();
defineEmits(['close']);

const { t, te } = useI18n();

const events = ref<any[]>([]);
const loading = ref(false);
const markingRead = ref(false);
const selectedIds = ref<string[]>([]);
const selectedLevels = ref<string[]>(['info', 'warn', 'error']);

// Pagination
const limit = ref(10);
const page = ref(1);

const automationTitle = computed(() => {
  return props.automation?.title || props.automation?.name || 'Automation Events';
});

const automationId = computed(() => {
  return props.automation?.id ? String(props.automation.id) : '';
});

// Level toggles
const isLevelActive = (lvl: string) => {
  if (lvl === 'warn') {
    return selectedLevels.value.includes('warn') || selectedLevels.value.includes('warning');
  }
  return selectedLevels.value.includes(lvl);
};

const toggleLevel = (lvl: string) => {
  const targetLevels = lvl === 'warn' ? ['warn', 'warning'] : [lvl];
  const isActive = isLevelActive(lvl);

  if (isActive) {
    selectedLevels.value = selectedLevels.value.filter(l => !targetLevels.includes(l));
  } else {
    selectedLevels.value = [...selectedLevels.value, ...targetLevels];
  }
  page.value = 1;
};

// Filtered events by automation ID/name and selected levels
const filteredEvents = computed(() => {
  const autoId = automationId.value;
  const autoName = (automationTitle.value || '').toLowerCase().trim();

  return events.value.filter((ev) => {
    // 1. Level filter
    const evLvl = (ev.level || '').toLowerCase();
    const isLevelMatch = selectedLevels.value.some(l => {
      if (l === 'warn') return evLvl === 'warn' || evLvl === 'warning';
      return evLvl === l;
    });
    if (!isLevelMatch) return false;

    // 2. Automation ID / Name filter in metadata
    let meta = ev.metadata;
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta); } catch {}
    }
    meta = meta || {};

    const metaId = meta.id ? String(meta.id) : '';
    const metaName = (meta.name || meta.automationName || '').toLowerCase().trim();

    // Match either exact ID or automation title/name
    if (autoId && metaId && metaId === autoId) return true;
    if (autoName && metaName && metaName === autoName) return true;
    if (autoId && !metaId && metaName && metaName === autoName) return true;

    return false;
  });
});

// Client-side pagination slices from filtered list
const paginatedEvents = computed(() => {
  const start = (page.value - 1) * limit.value;
  return filteredEvents.value.slice(start, start + limit.value);
});

const totalPages = computed(() => {
  return Math.max(1, Math.ceil(filteredEvents.value.length / limit.value));
});

const hasMore = computed(() => {
  return page.value < totalPages.value;
});

const paginationSummary = computed(() => {
  const total = filteredEvents.value.length;
  if (total === 0) return '0 / 0';
  const start = (page.value - 1) * limit.value + 1;
  const end = Math.min(start + limit.value - 1, total);
  return `${start}-${end} / ${total}`;
});

const prevPage = () => {
  if (page.value > 1) {
    page.value--;
  }
};

const nextPage = () => {
  if (hasMore.value) {
    page.value++;
  }
};

// Selection helpers
const isSelected = (id: string) => selectedIds.value.includes(id);

const toggleSelect = (id: string) => {
  if (isSelected(id)) {
    selectedIds.value = selectedIds.value.filter(i => i !== id);
  } else {
    selectedIds.value.push(id);
  }
};

const isAllSelected = computed(() => {
  const currentIds = paginatedEvents.value.map(e => e.id);
  return currentIds.length > 0 && currentIds.every(id => selectedIds.value.includes(id));
});

const isSomeSelected = computed(() => {
  const currentIds = paginatedEvents.value.map(e => e.id);
  return currentIds.some(id => selectedIds.value.includes(id));
});

const toggleSelectAll = () => {
  const currentIds = paginatedEvents.value.map(e => e.id);
  if (isAllSelected.value) {
    selectedIds.value = selectedIds.value.filter(id => !currentIds.includes(id));
  } else {
    const newSelected = new Set([...selectedIds.value, ...currentIds]);
    selectedIds.value = Array.from(newSelected);
  }
};

// Fetch events from /api/user/event/search
const fetchEvents = async () => {
  loading.value = true;
  try {
    const res = await $fetch<any>('/api/user/event/search?limit=100&sortBy=createdAt&sortDir=desc').catch(() => ({ data: [] }));
    events.value = res?.data || [];
  } catch (err) {
    console.error('Failed to fetch automation events:', err);
  } finally {
    loading.value = false;
  }
};

// Mark selected events as read
const markSelectedAsRead = async () => {
  if (selectedIds.value.length === 0) return;
  markingRead.value = true;
  try {
    await $fetch('/api/user/event', {
      method: 'POST',
      body: { ids: selectedIds.value }
    });

    // Update local state to read = 1
    for (const ev of events.value) {
      if (selectedIds.value.includes(ev.id)) {
        ev.read = 1;
      }
    }
    selectedIds.value = [];
  } catch (err) {
    console.error('Failed to mark events as read:', err);
  } finally {
    markingRead.value = false;
  }
};

// Formatting helpers
const getLevelColor = (lvl: string) => {
  const normalized = (lvl || '').toLowerCase();
  if (normalized === 'error') return '#E53935';
  if (normalized === 'warn' || normalized === 'warning') return '#FB8C00';
  if (normalized === 'info') return '#1976D2';
  return '#757575';
};

const getLevelIcon = (lvl: string) => {
  const normalized = (lvl || '').toLowerCase();
  if (normalized === 'error') return 'mdi-alert-circle';
  if (normalized === 'warn' || normalized === 'warning') return 'mdi-alert';
  if (normalized === 'info') return 'mdi-information';
  return 'mdi-bell-outline';
};

const formatDateTime = (val: string | Date | number | null | undefined): string => {
  if (!val) return '—';
  let d: Date;
  if (typeof val === 'number') {
    d = val < 10000000000 ? new Date(val * 1000) : new Date(val);
  } else {
    d = new Date(val);
  }
  if (isNaN(d.getTime())) return String(val);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}:${seconds}`;
};

const formatEventMessage = (event: any): string => {
  if (!event) return '';
  const msgKey = event.message;
  let meta = event.metadata;
  if (typeof meta === 'string') {
    try { meta = JSON.parse(meta); } catch {}
  }
  meta = meta || {};

  if (te(msgKey)) {
    return t(msgKey, meta);
  }
  return msgKey;
};

// Re-fetch when automation changes
watch(() => props.automation, () => {
  selectedIds.value = [];
  page.value = 1;
  fetchEvents();
}, { immediate: true });

onMounted(() => {
  fetchEvents();
});
</script>

<style scoped>
.dashboard-events-panel {
  transition: all 0.2s ease-in-out;
  background-color: rgb(var(--v-theme-surface));
  border-radius: 8px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
  overflow: hidden;
}

.dashboard-events-panel:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.events-header {
  background-color: rgba(var(--v-theme-on-surface), 0.02);
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
}

.events-title {
  font-size: 1.1rem;
  letter-spacing: -0.01em;
}

.events-table-wrapper {
  background-color: rgb(var(--v-theme-surface));
}

.events-table :deep(table) {
  width: 100%;
}

.events-table :deep(th) {
  font-size: 0.75rem !important;
  color: rgba(var(--v-theme-on-surface), 0.7) !important;
  height: 32px !important;
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}

.events-table :deep(td) {
  height: 36px !important;
}

.event-row {
  transition: background-color 0.15s ease;
}

.event-row:hover {
  background-color: rgba(var(--v-theme-primary), 0.04);
}

.event-row--unread {
  background-color: rgba(var(--v-theme-primary), 0.02);
}

.event-row--selected {
  background-color: rgba(var(--v-theme-primary), 0.08) !important;
}

.events-footer {
  background-color: rgba(var(--v-theme-on-surface), 0.02);
  min-height: 38px;
}

.limit-select {
  width: 60px;
  font-size: 0.75rem;
}

.font-mono {
  font-family: monospace, monospace;
}
</style>
