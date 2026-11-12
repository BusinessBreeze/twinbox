<template>
  <v-container fluid class="dashboard-container d-flex flex-column pa-4 ga-3">
    <!-- Top Tier - User Stats & KPIs -->
    <div class="dashboard-tier tier-top">
      <div class="kpi-container d-flex flex-nowrap align-center justify-center ga-3 w-100">
        <!-- Greeting -->
        <div class="greeting-wrapper d-flex flex-column justify-center px-1">
          <div class="greeting-title font-weight-bold text-truncate" :title="greetingTitle">
            {{ greetingTitle }}
          </div>
          <div class="greeting-subtitle text-caption text-medium-emphasis text-truncate mt-1">
            {{ $t('dashboard.greeting_subtitle') }}
          </div>
        </div>

        <!-- 1. Jobs in the queue, all users (waiting or running) -->
        <div class="kpi-wrapper">
          <KpiText
            title="Queue Total"
            :value="metrics.tasks_qty"
            color="#FB8C00"
            icon="mdi-tray-full"
          />
        </div>

        <!-- 2. The user's own jobs in the queue -->
        <div class="kpi-wrapper">
          <KpiText
            title="My Queue"
            :value="userMetrics.user_tasks_in_queue"
            color="#5C6B73"
            icon="mdi-account-clock-outline"
          />
        </div>

        <!-- 3. The user's source items (emails) in the database -->
        <div class="kpi-wrapper">
          <KpiText
            title="Source Items"
            :value="userMetrics.source_items"
            color="#4F7767"
            icon="mdi-email-multiple-outline"
          />
        </div>

        <!-- 4. The user's artifact files on disk -->
        <div class="kpi-wrapper">
          <KpiText
            title="Artifacts Stored"
            :value="userMetrics.artifacts_stored"
            color="#9E6B75"
            icon="mdi-file-document-multiple-outline"
          />
        </div>

        <!-- 5. Toggleable Cron Button Card -->
        <div class="cron-toggle-wrapper d-flex align-stretch flex-shrink-0">
          <v-card
            class="cron-toggle-card rounded-lg d-flex flex-column align-center justify-center cursor-pointer select-none"
            :class="{
              'cron-toggle-card--on': isCronOn,
              'cron-toggle-card--off': !isCronOn
            }"
            flat
            @click="toggleCron"
          >
            <v-icon
              :icon="isCronOn ? 'mdi-clock-check-outline' : 'mdi-clock-remove-outline'"
              size="28"
              class="mb-1"
            />
            <span class="text-caption font-weight-bold letter-spacing-wide">
              {{ isCronOn ? ($t('dashboard.cron_on') || 'Cron On') : ($t('dashboard.cron_off') || 'Cron Off') }}
            </span>
          </v-card>
        </div>
      </div>
    </div>

    <!-- Middle Tier - Recent Automations Row -->
    <DashboardRow />

    <!-- Bottom Tier - Status & Endpoints -->
    <div class="dashboard-tier tier-bottom">
      <!-- One row: the text card takes the width its text needs, the readouts share the rest -->
      <div class="bottom-row d-flex align-stretch ga-3">
        <!-- Left: Model and 3 URLs, each with whether the server could reach it (checked every 30 s) -->
        <v-card class="system-text-card px-4 py-3 d-flex flex-column justify-center ga-2" flat>
          <!-- Model -->
          <div class="d-flex align-center ga-2 text-body-2 overflow-hidden">
            <span class="font-weight-bold text-primary">Model:</span>
            <span class="text-truncate">{{ modelDisplay }}</span>
          </div>

          <!-- LLM -->
          <div class="d-flex align-center ga-2 text-body-2 overflow-hidden">
            <span class="font-weight-bold text-primary">LLM:</span>
            <span class="font-mono text-truncate">{{ metrics.llm_url || '—' }}</span>
            <v-icon v-if="metrics.llm_url" v-bind="reachIcon(metrics.healthy)" size="small" class="flex-shrink-0" />
          </div>

          <!-- TTS -->
          <div class="d-flex align-center ga-2 text-body-2 overflow-hidden">
            <span class="font-weight-bold text-primary">TTS:</span>
            <span class="font-mono text-truncate">{{ metrics.tts_url || '—' }}</span>
            <v-icon v-if="metrics.tts_url" v-bind="reachIcon(metrics.tts_reachable)" size="small" class="flex-shrink-0" />
          </div>

          <!-- Apprise -->
          <div class="d-flex align-center ga-2 text-body-2 overflow-hidden">
            <span class="font-weight-bold text-primary">Apprise:</span>
            <span class="font-mono text-truncate">{{ metrics.apprise_url || '—' }}</span>
            <v-icon v-if="metrics.apprise_url" v-bind="reachIcon(metrics.apprise_reachable)" size="small" class="flex-shrink-0" />
          </div>
        </v-card>

        <!-- Right: LLM readouts (rates and averages over the last 50 requests, tokens since the server started) -->
        <div class="llm-kpis d-flex flex-nowrap align-center ga-2">
          <div class="kpi-wrapper">
            <KpiTextSparkline
              title="Tok/s"
              :value="metrics.recent_tok_per_sec || []"
              :format="(v: any) => metrics.generation_speed || v || 0"
              color="#8E24AA"
              icon="mdi-speedometer"
              dense
            />
          </div>

          <!-- LLM calls waiting for a free slot (or a retry) / time per call -->
          <div class="kpi-wrapper">
            <KpiText
              title="Waiting / Response"
              :value="metrics.avg_response_sec"
              :format="(v: any) => `${metrics.llm_waiting || 0} / ${(v || 0).toFixed(1)} s`"
              :color="(metrics.llm_waiting || 0) > 0 ? '#FB8C00' : '#3D5A80'"
              icon="mdi-timer-outline"
              dense
            />
          </div>

          <!-- Average prompt; totals and cache hits on hover -->
          <div class="kpi-wrapper">
            <KpiText
              title="Prompt Size (avg)"
              :value="metrics.avg_prompt_tokens"
              :format="(v: any) => compact(v)"
              color="#00897B"
              icon="mdi-text-box-outline"
              dense
            />
            <v-tooltip activator="parent" location="top">
              <div>Average tokens per prompt (last 50 requests)</div>
              <div>Tokens in / out since start: {{ compact(metrics.tokens_in) }} / {{ compact(metrics.tokens_out) }}</div>
              <div>Cache hits: {{ percent(metrics.cache_hit_rate) }}</div>
            </v-tooltip>
          </div>

          <!-- Errors, timeouts and cut-off answers together; each one is also in the event log -->
          <div class="kpi-wrapper">
            <KpiText
              title="LLM Problems"
              :value="metrics.problem_rate"
              :format="(v: any) => percent(v)"
              :color="(metrics.problem_rate || 0) > 0 ? '#E53935' : '#43A047'"
              :icon="(metrics.problem_rate || 0) > 0 ? 'mdi-alert-circle' : 'mdi-shield-check'"
              dense
            />
            <v-tooltip activator="parent" location="top">
              <div>Of the last 50 requests:</div>
              <div>Errors: {{ percent(metrics.error_rate) }}</div>
              <div>Timeouts: {{ percent(metrics.timeout_rate) }}</div>
              <div>Cut-off answers: {{ percent(metrics.truncation_rate) }}</div>
              <div>Details are in the event log.</div>
            </v-tooltip>
          </div>
        </div>
      </div>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import KpiText from '~/components/kpi/text.vue';
import KpiTextSparkline from '~/components/kpi/text_sparkline.vue';
import DashboardRow from '~/components/dashboard/row.vue';

const { t } = useI18n();
const { user } = useUserSession();

const userName = computed(() => {
  const raw = (user.value?.username || user.value?.email || (user.value as any)?.user || (user.value as any)?.name || '') as string;
  if (!raw) return '';
  const beforeAt = raw.includes('@') ? raw.split('@')[0] : raw;
  return beforeAt;
});

const greetingTitle = computed(() => {
  const hour = new Date().getHours();
  const name = userName.value;

  if (hour < 12) {
    return name ? t('dashboard.greeting_morning', { name }) : t('dashboard.greeting_morning_simple');
  } else if (hour < 18) {
    return name ? t('dashboard.greeting_afternoon', { name }) : t('dashboard.greeting_afternoon_simple');
  } else {
    return name ? t('dashboard.greeting_evening', { name }) : t('dashboard.greeting_evening_simple');
  }
});

const isCronOn = computed(() => {
  return Boolean(metrics.value?.cron_active);
});

const togglingCron = ref(false);

const toggleCron = async () => {
  if (togglingCron.value) return;
  togglingCron.value = true;
  const nextVal = isCronOn.value ? 0 : 1;
  metrics.value.cron_active = nextVal;
  const targetId = user.value?.id || 'me';
  try {
    await $fetch(`/api/user/account/${targetId}`, {
      method: 'PATCH',
      body: { cron_active: nextVal }
    });
  } catch (err) {
    console.error('Failed to toggle cron active:', err);
    metrics.value.cron_active = nextVal === 1 ? 0 : 1;
  } finally {
    togglingCron.value = false;
  }
};

interface SystemStatus {
  healthy: boolean;
  tts_reachable: boolean | null;
  apprise_reachable: boolean | null;
  cron_active: number;
  generation_speed: number;
  recent_tok_per_sec: number[];
  avg_response_sec: number;
  avg_prompt_tokens: number;
  tokens_in: number;
  tokens_out: number;
  cache_hit_rate: number | null;
  llm_waiting: number;
  problem_rate: number;
  error_rate: number;
  timeout_rate: number;
  failed_rate: number;
  truncation_rate: number;
  total_requests: number;
  tasks_qty: number;
  llm_model: string;
  llm_url: string;
  tts_url: string;
  apprise_url: string;
}

const metrics = ref<SystemStatus>({
  healthy: false,
  tts_reachable: null,
  apprise_reachable: null,
  cron_active: 1,
  generation_speed: 0,
  recent_tok_per_sec: [],
  avg_response_sec: 0,
  avg_prompt_tokens: 0,
  tokens_in: 0,
  tokens_out: 0,
  cache_hit_rate: null,
  llm_waiting: 0,
  problem_rate: 0,
  error_rate: 0,
  timeout_rate: 0,
  failed_rate: 0,
  truncation_rate: 0,
  total_requests: 0,
  tasks_qty: 0,
  llm_model: '',
  llm_url: '',
  tts_url: '',
  apprise_url: ''
});

const modelDisplay = computed(() => {
  return metrics.value?.llm_model?.trim() || '—';
});

// Reachable: green check, not reachable: red alert, not checked (null): grey question mark
const reachIcon = (reachable: boolean | null | undefined) =>
  reachable === null || reachable === undefined
    ? { icon: 'mdi-help-circle-outline', color: 'grey' }
    : reachable
      ? { icon: 'mdi-check-circle', color: 'success' }
      : { icon: 'mdi-alert-circle', color: 'error' };

// 0.25 -> 25%; null (not reported) -> —
const percent = (v?: number | null) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(0)}%`);

// 950, 12.3k, 4.1M
const compact = (v?: number) => {
  const n = v || 0;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
};

interface ActivityMetrics {
  user_tasks_in_queue: number;
  source_items: number;
  artifacts_stored: number;
}

const userMetrics = ref<ActivityMetrics>({
  user_tasks_in_queue: 0,
  source_items: 0,
  artifacts_stored: 0
});

const fetchStatus = async () => {
  try {
    const data = await $fetch<SystemStatus>('/api/v0.1/app/status/system');
    if (data) {
      metrics.value = data;
    }
  } catch (err) {
    console.error('Failed to fetch LLM status metrics:', err);
  }
};

const fetchUserStatus = async () => {
  try {
    const data = await $fetch<ActivityMetrics>('/api/v0.1/app/status/activity');
    if (data) {
      userMetrics.value = data;
    }
  } catch (err) {
    console.error('Failed to fetch user status metrics:', err);
  }
};

// Live updates (no polling): the system figures are recomputed every 30 s ('system', to every user); the activity
// changes with the user's jobs and stored emails / artifacts. Every reconnect reloads both.
useUserStream(['system'], fetchStatus);
useUserStream(['jobs', 'emails', 'artifacts'], fetchUserStatus);

onMounted(() => {
  fetchStatus();
  fetchUserStatus();
});
</script>

<style scoped>
.dashboard-container {
  height: 100%;
  max-height: 100%;
  box-sizing: border-box;
}

.dashboard-tier {
  transition: border-color 0.2s ease;
}

.tier-top {
  flex: 0 0 auto;
}

.tier-bottom {
  flex: 0 0 auto;
}

.font-mono {
  font-family: monospace, monospace;
}

.kpi-container {
  display: flex;
  flex-wrap: nowrap;
  width: 100%;
}

.greeting-wrapper {
  flex: 1 1 0px;
  min-width: 180px;
  max-width: 270px;
}

.greeting-title {
  font-size: clamp(1.15rem, 1.6vw, 1.45rem);
  line-height: 1.2;
  letter-spacing: -0.01em;
  color: rgb(var(--v-theme-on-surface));
}

.greeting-subtitle {
  font-size: clamp(0.75rem, 0.95vw, 0.85rem);
  line-height: 1.25;
}

/* Each readout as wide as its content (spare room is shared out); a second line only when they don't fit */
.llm-kpis {
  flex: 1 1 auto;
  min-width: 0;
  flex-wrap: wrap !important;
  row-gap: 8px;
}

.llm-kpis .kpi-wrapper {
  flex: 1 1 auto;
  min-width: auto;
}

/* Narrow screens: text card above the readouts, which wrap */
@media (max-width: 959px) {
  .bottom-row {
    flex-direction: column;
  }
  .system-text-card {
    max-width: none;
  }
  .llm-kpis .kpi-wrapper {
    flex: 1 1 140px;
  }
}

.kpi-wrapper {
  flex: 1 1 0px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bottom-row {
  width: 100%;
}

/* As wide as its text needs; gives way first (the URLs shorten with …) when the readouts need the room */
.system-text-card {
  flex: 0 3 auto;
  min-width: 180px;
  max-width: 420px;
  transition: all 0.2s ease-in-out;
  background-color: rgb(var(--v-theme-surface));
  border-radius: 8px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.system-text-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.cron-toggle-wrapper {
  height: 100%;
}

.cron-toggle-card {
  width: 105px;
  min-height: 105px;
  height: 100%;
  aspect-ratio: 1;
  border-radius: 8px !important;
  transition: all 0.2s ease-in-out;
}

.cron-toggle-card--on {
  background-color: rgb(var(--v-theme-primary)) !important;
  color: #FFFFFF !important;
  border: 1px solid rgb(var(--v-theme-primary)) !important;
  box-shadow: 0 2px 8px rgba(var(--v-theme-primary), 0.25) !important;
}

.cron-toggle-card--on:hover {
  box-shadow: 0 4px 14px rgba(var(--v-theme-primary), 0.38) !important;
  transform: translateY(-1px);
}

.cron-toggle-card--off {
  background-color: rgb(var(--v-theme-surface)) !important;
  color: #757575 !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
}

.cron-toggle-card--off:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
  transform: translateY(-1px);
}

.letter-spacing-wide {
  letter-spacing: 0.05em;
}

.select-none {
  user-select: none;
}
</style>
