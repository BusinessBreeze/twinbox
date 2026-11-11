<template>
  <v-card
    class="automation-card rounded-lg d-flex flex-column border-opacity-100"
    :class="[`border-${healthColor}`, isSelected ? 'border-md' : 'border']"
    variant="flat"
    @click="emit('select', automation)"
  >
    <!-- Header in the automation's health color: name (the only bold text) and the problem icon -->
    <div class="d-flex align-center ga-2 min-w-0 px-3 py-2 border-b border-opacity-100" :class="[`bg-${healthColor}-lighten-5`, `border-${healthColor}`]">
      <span class="automation-title text-truncate flex-grow-1" :title="automation.title">{{ automation.title }}</span>
      <v-icon v-if="health === 'error'" color="error" size="20">mdi-alert-circle</v-icon>
      <v-icon v-else-if="health === 'warning'" color="warning" size="20">mdi-alert</v-icon>
    </div>

    <!-- One fact per row: labels in a grey column, values aligned beside them. First the automation's work, then
         its source (context): which one, when it was last read, when it is read next. -->
    <div class="facts text-caption bg-surface pa-3 flex-grow-1">
      <span class="label">{{ t('dashboard.card.last') }}</span>
      <span class="value" :title="exact(automation.lastRun)">{{ relative(automation.lastRun) }}</span>

      <span class="label">{{ t('dashboard.card.source') }}</span>
      <span class="value text-truncate" :title="sourceText">{{ sourceText }}</span>

      <!-- The source's own status: not read for over two intervals, or its warnings / errors in the log -->
      <span class="label">{{ t('dashboard.card.checked') }}</span>
      <span class="value d-flex align-center ga-1" :class="{ 'text-warning': sourceIssue }" :title="sourceIssue || exact(automation.lastPoll)">
        {{ relative(automation.lastPoll) }}
        <v-icon v-if="sourceIssue" color="warning" size="16">mdi-alert</v-icon>
      </span>

      <span class="label">{{ t('dashboard.card.next') }}</span>
      <span class="value" :title="next.at ? exact(next.at) : undefined">{{ next.text }}</span>
    </div>
  </v-card>
</template>

<script lang="ts">
export interface AutomationCardData {
  id?: string | number;
  title: string;
  active: number | boolean;
  lastRun: string | Date | null;              // the automation's last run (items passed its filter, tasks ran)
  lastIssueLevel: 'warn' | 'error' | null;
  problems: number;                           // its warnings / errors still in the event log
  sourceLabel: string;                        // "Work mailbox › INBOX › Newsletters"
  lastPoll: string | Date | null;             // the source's last successful poll
  sourceProblems: boolean;                    // the source has warnings / errors in the event log
  pollSeconds: number | null;                 // null: the source isn't polled (e.g. staging, run by hand)
}
</script>

<script setup lang="ts">
// One automation on the dashboard: the work it did first, its source as context. Color only shows health: the
// automation's in the header (tint, border, icon), the source's on its "checked" row; bold only marks the name; facts are label (grey) / value pairs in two aligned columns. Times are
// relative (the browser's own wording, any language), the exact time on hover.
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ automation: AutomationCardData; isSelected?: boolean }>();
const emit = defineEmits<{ (e: 'select', automation: AutomationCardData): void }>();

const { t, locale } = useI18n();

const health = computed(() => {
  if (!props.automation.active) return 'paused';
  if (props.automation.problems > 0) return props.automation.lastIssueLevel === 'error' ? 'error' : 'warning';
  return 'ok';
});

// Theme colors (and their shades from the theme's variations): tinted background, border in the color itself
const healthColor = computed(() => ({ ok: 'success', warning: 'warning', error: 'error', paused: 'secondary' })[health.value]);

const sourceText = computed(() => (props.automation.sourceLabel || '').split(' › ').join(':'));

const toDate = (val: string | Date | null) => (val ? new Date(val) : null);

const exact = (val: string | Date | null) => toDate(val)?.toLocaleString(locale.value) ?? '';

// "2 hr. ago", "in 56 min." (Intl.RelativeTimeFormat: worded by the browser for every language)
const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86400], ['hour', 3600], ['minute', 60], ['second', 1]];
const relative = (val: string | Date | null) => {
  const date = toDate(val);
  if (!date || isNaN(date.getTime())) return '—';
  const seconds = (date.getTime() - Date.now()) / 1000;
  const [unit, size] = UNITS.find(([, s]) => Math.abs(seconds) >= s) ?? ['second', 1];
  return new Intl.RelativeTimeFormat(locale.value, { style: 'short', numeric: 'auto' }).format(Math.round(seconds / size), unit);
};

// Hint for a source with a problem (else ''): not read successfully for more than two intervals, or problems logged
const sourceIssue = computed(() => {
  const { pollSeconds, lastPoll, active, sourceProblems } = props.automation;
  const last = toDate(lastPoll);
  const stale = !!active && !!pollSeconds && !!last && Date.now() - last.getTime() > 2 * pollSeconds * 1000;
  if (stale) return t('dashboard.card.source_stale', { time: exact(lastPoll) });
  return sourceProblems ? t('dashboard.card.source_problems') : '';
});

// The source's next poll: last successful poll + interval; "due" when that has passed (or it was never read)
const next = computed<{ text: string; at?: Date }>(() => {
  const { pollSeconds, lastPoll, active } = props.automation;
  if (!active) return { text: t('dashboard.card.paused') };
  if (!pollSeconds) return { text: t('dashboard.card.manual') };
  const last = toDate(lastPoll);
  if (!last) return { text: t('dashboard.card.due') };
  const at = new Date(last.getTime() + pollSeconds * 1000);
  return at.getTime() <= Date.now() ? { text: t('dashboard.card.due'), at } : { text: relative(at), at };
});
</script>

<style scoped>
.automation-card {
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.automation-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.automation-title {
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
}

/* Label column as wide as its longest label, values beside it */
.facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 2px;
}

.label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.value {
  font-variant-numeric: tabular-nums;
}
</style>
