<template>
  <v-card
    class="automation-card flex-grow-1 rounded-lg d-flex flex-column pa-4"
    variant="flat"
  >
    <!-- Top Row: Top Left (Last issue + date) & Top Right (Last run timestamp) -->
    <div class="d-flex justify-space-between align-start w-100 mb-2">
      <!-- Top Left: Last issue -->
      <div class="d-flex flex-column">
        <span class="text-caption text-primary font-weight-medium">{{ $t('dashboard.last_issue') }}</span>
        <span class="text-caption font-weight-bold font-mono text-black">
          {{ formatDateTime(displayLastIssueDate) }}
        </span>
      </div>

      <!-- Top Right: Last run timestamp -->
      <div class="d-flex flex-column align-end">
        <span class="text-caption text-primary font-weight-medium">{{ $t('common.last_run') || 'Last run' }}</span>
        <span class="text-caption font-weight-bold font-mono text-black">
          {{ formatDateTime(displayLastRun) }}
        </span>
      </div>
    </div>

    <!-- Center: Title Centered (Clickable to edit) -->
    <div class="d-flex align-center justify-center flex-grow-1 my-4 text-center">
      <span
        class="automation-title text-truncate px-2 text-black title-link"
        :title="displayTitle"
        @click="onTitleClick"
      >
        {{ displayTitle }}
      </span>
    </div>

    <!-- Bottom Row: Bottom Left (Active value only, no label) -->
    <div class="d-flex justify-space-between align-end w-100 mt-2">
      <!-- Bottom Left -->
      <span class="text-caption font-weight-bold text-black">
        {{ isActive ? ($t('common.active') || 'Active') : ($t('common.inactive') || 'Inactive') }}
      </span>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';

export interface AutomationCardData {
  id?: string | number;
  title?: string;
  name?: string;
  active?: number | boolean;
  lastRun?: string | Date | number | null;
  lastIssueDate?: string | Date | number | null;
  lastIssueLevel?: 'warn' | 'error' | null;
}

interface Props {
  automation?: AutomationCardData;
  id?: string | number;
  title?: string;
  active?: number | boolean;
  lastRun?: string | Date | number | null;
  lastIssueDate?: string | Date | number | null;
}

const props = withDefaults(defineProps<Props>(), {
  automation: undefined,
  id: undefined,
  title: '',
  active: 1,
  lastRun: null,
  lastIssueDate: null
});

const router = useRouter();

const displayTitle = computed(() => {
  return props.automation?.title || props.automation?.name || props.title || '—';
});

const isActive = computed(() => {
  if (props.automation && props.automation.active !== undefined) {
    return Boolean(props.automation.active);
  }
  return Boolean(props.active);
});

const displayLastRun = computed(() => {
  return props.automation?.lastRun ?? props.lastRun;
});

const displayLastIssueDate = computed(() => {
  return props.automation?.lastIssueDate ?? props.lastIssueDate;
});

const onTitleClick = () => {
  const targetId = props.automation?.id ?? props.id;
  router.push({
    path: '/automations',
    state: {
      action: 'edit',
      openEdit: true,
      id: targetId,
      name: displayTitle.value,
      title: displayTitle.value,
      item: props.automation
    }
  });
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
  return `${day}/${month} ${hours}:${minutes}`;
};
</script>

<style scoped>
.automation-card {
  min-width: 260px;
  max-width: 380px;
  background-color: rgb(var(--v-theme-surface));
  border: 2px solid rgb(var(--v-theme-primary)) !important;
  box-shadow: 0 2px 8px rgba(var(--v-theme-primary), 0.08);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.automation-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(var(--v-theme-primary), 0.18);
}

.automation-card .text-black {
  color: #000000 !important;
}

.automation-title {
  font-size: 1.75rem;
  font-weight: 700;
  line-height: 1.25;
  color: #000000;
}

.title-link {
  cursor: pointer;
  transition: color 0.15s ease, transform 0.1s ease;
}

.title-link:hover {
  color: rgb(var(--v-theme-primary)) !important;
  text-decoration: underline;
}

.font-mono {
  font-family: monospace, monospace;
}
</style>
