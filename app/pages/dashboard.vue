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

        <!-- 1. Ingested Mails -->
        <div class="kpi-wrapper">
          <KpiText
            title="Ingested"
            :value="userMetrics.ingested_mails"
            color="#4F7767"
            icon="mdi-email-outline"
          />
        </div>

        <!-- 2. Tasks Run -->
        <div class="kpi-wrapper">
          <KpiText
            title="Tasks Run"
            :value="userMetrics.tasks_run"
            color="#3D5A80"
            icon="mdi-play-circle-outline"
          />
        </div>

        <!-- 3. Artifacts Created -->
        <div class="kpi-wrapper">
          <KpiText
            title="Artifacts"
            :value="userMetrics.artifacts_created"
            color="#9E6B75"
            icon="mdi-file-document-outline"
          />
        </div>

        <!-- 4. Tasks in Queue -->
        <div class="kpi-wrapper">
          <KpiText
            title="In Queue"
            :value="userMetrics.user_tasks_in_queue"
            color="#5C6B73"
            icon="mdi-tray-full"
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
      <v-row align="center" class="ma-0">
        <!-- Left: Model and 3 URLs (Floating White Card) -->
        <v-col cols="12" lg="4" class="pa-0 pr-lg-2">
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
            </div>

            <!-- TTS -->
            <div class="d-flex align-center ga-2 text-body-2 overflow-hidden">
              <span class="font-weight-bold text-primary">TTS:</span>
              <span class="font-mono text-truncate">{{ metrics.tts_url || '—' }}</span>
            </div>

            <!-- Apprise -->
            <div class="d-flex align-center ga-2 text-body-2 overflow-hidden">
              <span class="font-weight-bold text-primary">Apprise:</span>
              <span class="font-mono text-truncate">{{ metrics.apprise_url || '—' }}</span>
            </div>
          </v-card>
        </v-col>

        <!-- Right: 4 KPI Visuals -->
        <v-col cols="12" lg="8" class="d-flex align-center justify-center overflow-x-auto py-0 px-0 pl-lg-2">
          <div class="kpi-container d-flex flex-nowrap align-center justify-center ga-3 w-100">
            <!-- 1. Cron / Tasks -->
            <div class="kpi-wrapper">
              <KpiText
                title="Cron / Tasks"
                :value="metrics.cron_active"
                :format="(v: any) => `${v ? 'Active' : 'Paused'} / ${metrics.tasks_qty ?? 0}`"
                color="#FB8C00"
                icon="mdi-clock-outline"
              />
            </div>

            <!-- 2. VRAM / KV -->
            <div class="kpi-wrapper">
              <KpiText
                title="VRAM / KV"
                :value="metrics.active_hardware_vram"
                :format="() => `${formatVram(metrics.active_hardware_vram)} / ${formatKv(metrics.kv_cache_allocation)}`"
                color="#1976D2"
                icon="mdi-memory"
              />
            </div>

            <!-- 3. Tok/s (Sparkline) -->
            <div class="kpi-wrapper">
              <KpiTextSparkline
                title="Tok/s"
                :value="metrics.recent_tok_per_sec || []"
                :format="(v: any) => v || 0"
                color="#8E24AA"
                icon="mdi-chart-bar"
              />
            </div>

            <!-- 4. Health -->
            <div class="kpi-wrapper">
              <KpiText
                title="Health"
                :value="metrics.healthy"
                :format="(v: any) => v ? 'ONLINE' : 'OFFLINE'"
                :color="metrics.healthy ? '#43A047' : '#E53935'"
                :icon="metrics.healthy ? 'mdi-heart-pulse' : 'mdi-alert-circle-outline'"
              />
            </div>
          </div>
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
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

interface StatusMetrics {
  healthy: boolean;
  cron_active: number;
  active_hardware_vram: number;
  kv_cache_allocation: number;
  recent_tok_per_sec: number[];
  tasks_qty: number;
  llm_model: string;
  llm_url: string;
  tts_url: string;
  apprise_url: string;
  metrics_type: string;
}

const metrics = ref<StatusMetrics>({
  healthy: false,
  cron_active: 1,
  active_hardware_vram: 0,
  kv_cache_allocation: 0,
  recent_tok_per_sec: [],
  tasks_qty: 0,
  llm_model: '',
  llm_url: '',
  tts_url: '',
  apprise_url: '',
  metrics_type: ''
});

const isOllama = computed(() => {
  return (metrics.value?.metrics_type || '').toLowerCase().trim() === 'ollama';
});

const modelDisplay = computed(() => {
  const type = metrics.value?.metrics_type?.trim();
  const model = metrics.value?.llm_model?.trim();
  if (type && model) {
    return `${type} - ${model}`;
  }
  return type || model || '—';
});

const formatVram = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
};

const formatKv = (val: number): string => {
  if (isOllama.value) return 'N/A';
  if (!val || val <= 0) return '0%';
  return `${(val * 100).toFixed(0)}%`;
};

interface UserStatusMetrics {
  ingested_mails: number;
  tasks_run: number;
  artifacts_created: number;
  user_tasks_in_queue: number;
}

const userMetrics = ref<UserStatusMetrics>({
  ingested_mails: 0,
  tasks_run: 0,
  artifacts_created: 0,
  user_tasks_in_queue: 0
});

const fetchStatus = async () => {
  try {
    const data = await $fetch<StatusMetrics>('/api/v0.1/app/status/llm');
    if (data) {
      metrics.value = data;
    }
  } catch (err) {
    console.error('Failed to fetch LLM status metrics:', err);
  }
};

const fetchUserStatus = async () => {
  try {
    const data = await $fetch<UserStatusMetrics>('/api/v0.1/app/status/user');
    if (data) {
      userMetrics.value = data;
    }
  } catch (err) {
    console.error('Failed to fetch user status metrics:', err);
  }
};

const fetchAllStatus = () => {
  fetchStatus();
  fetchUserStatus();
};

let pollTimer: any = null;

onMounted(() => {
  fetchAllStatus();
  pollTimer = setInterval(fetchAllStatus, 10000);
});

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
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

.kpi-wrapper {
  flex: 1 1 0px;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.system-text-card {
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
