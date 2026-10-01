<template>
  <v-container fluid class="dashboard-container d-flex flex-column pa-4 ga-3">
    <!-- Top Tier - User Stats & KPIs -->
    <div class="dashboard-tier tier-top">
      <div class="kpi-container d-flex flex-nowrap align-center justify-center ga-3 w-100">
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
import KpiText from '~/components/kpi/text.vue';
import KpiTextSparkline from '~/components/kpi/text_sparkline.vue';
import DashboardRow from '~/components/dashboard/row.vue';

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
</style>
