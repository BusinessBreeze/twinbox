<template>
  <div class="dashboard-tier tier-middle d-flex ga-3 align-stretch w-100 py-2 overflow-hidden">
    <!-- Section 1 (Left): Stays same width -->
    <div class="section-left flex-shrink-0 flex-grow-0 d-flex align-stretch pa-1">
      <DashboardAdd />
    </div>

    <!-- Section 2 (Right): Rest of the horizontal space -->
    <div class="section-right flex-grow-1 d-flex ga-3 align-stretch min-w-0">
      <!-- Sub-section A: Automation Cards Container (Wraps if too many) -->
      <div
        class="cards-container d-flex flex-wrap ga-3 align-content-start overflow-y-auto min-w-0 pa-1"
        :class="{ 'cards-container--split': !!selectedAutomation }"
      >
        <template v-if="recentAutomations.length > 0">
          <DashboardCard
            v-for="auto in recentAutomations"
            :key="auto.title"
            :automation="auto"
            :is-selected="selectedAutomation?.title === auto.title"
            @select="onSelectAutomation"
          />
        </template>

        <!-- Empty State -->
        <v-card
          v-else
          class="flex-grow-1 w-100 h-100 rounded-lg d-flex flex-column align-center justify-center border-dashed pa-6"
          variant="outlined"
          flat
        >
          <v-icon icon="mdi-robot-outline" size="36" color="medium-emphasis" class="mb-2" />
          <div class="text-caption text-uppercase font-weight-medium text-medium-emphasis letter-spacing-1">
            {{ $t('dashboard.no_recent_automations') || 'No Recent Automations Run' }}
          </div>
        </v-card>
      </div>

      <!-- Sub-section B: Split Panel (Takes half of the remaining space when active) -->
      <DashboardEvents
        v-if="selectedAutomation"
        class="detail-panel my-1"
        :automation="selectedAutomation"
        @close="closeDetail"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import DashboardAdd from '~/components/dashboard/add.vue';
import DashboardCard from '~/components/dashboard/card.vue';
import DashboardEvents from '~/components/dashboard/events.vue';

export interface RecentAutomation {
  id?: string | number;
  title: string;
  active: number | boolean;
  lastRun: string | Date | number;
  lastIssueDate: string | Date | number | null;
  lastIssueLevel: 'warn' | 'error' | null;
}

const recentAutomations = ref<RecentAutomation[]>([]);
const selectedAutomation = ref<RecentAutomation | null>(null);

const onSelectAutomation = (auto: RecentAutomation) => {
  selectedAutomation.value = auto;
};

const closeDetail = () => {
  selectedAutomation.value = null;
};

const fetchRecentAutomations = async () => {
  try {
    const [eventsRes, issuesRes, automationsRes] = await Promise.all([
      $fetch<any>('/api/user/event/search?limit=100&sortBy=createdAt&sortDir=desc').catch(() => ({ data: [] })),
      $fetch<any>('/api/user/event/search?limit=100&sortBy=createdAt&sortDir=desc&level=warn,warning,error').catch(() => ({ data: [] })),
      $fetch<any>('/api/v0.1/app/automation').catch(() => ({ data: [] }))
    ]);

    const events: any[] = eventsRes?.data || [];
    const issueEvents: any[] = issuesRes?.data || [];
    const automations: any[] = automationsRes?.data || [];

    const autoMap = new Map<string, any>();
    for (const a of automations) {
      if (a?.name) autoMap.set(a.name, a);
    }

    // Pre-index the latest warning/error event per automation title
    const issueMap = new Map<string, any>();
    for (const issue of issueEvents) {
      let meta = issue.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch {}
      }
      const title = meta?.name || meta?.automationName;
      if (!title) continue;
      if (!issueMap.has(title)) {
        issueMap.set(title, {
          date: issue.createdAt || issue.created_at,
          level: issue.level
        });
      }
    }

    const map = new Map<string, RecentAutomation>();
    for (const event of events) {
      let meta = event.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch {}
      }
      const title = meta?.name || meta?.automationName;
      if (!title) continue;

      if (!map.has(title)) {
        if (map.size >= 10) continue;
        const auto = autoMap.get(title);
        const issue = issueMap.get(title);
        const dateVal = event.createdAt || event.created_at;

        map.set(title, {
          id: auto?.id,
          title,
          active: auto ? (auto.active ?? 1) : 1,
          lastRun: dateVal,
          lastIssueDate: issue ? issue.date : null,
          lastIssueLevel: issue ? issue.level : null
        });
      }
    }

    recentAutomations.value = Array.from(map.values());
  } catch (err) {
    console.error('Failed to fetch recent automations:', err);
  }
};

let pollTimer: any = null;

onMounted(() => {
  fetchRecentAutomations();
  pollTimer = setInterval(fetchRecentAutomations, 10000);
});

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer);
  }
});
</script>

<style scoped>
.dashboard-tier {
  transition: border-color 0.2s ease;
}

.tier-middle {
  flex: 1 1 0px;
  min-height: 0;
}

.section-left {
  height: 100%;
}

.section-right {
  height: 100%;
}

.cards-container {
  flex: 1 1 100%;
  width: 100%;
  transition: flex 0.25s ease, width 0.25s ease, max-width 0.25s ease;
}

.cards-container--split {
  flex: 1 1 50%;
  max-width: 50%;
  width: 50%;
}

.detail-panel {
  flex: 1 1 50%;
  max-width: 50%;
  width: 50%;
  height: 100%;
  transition: all 0.2s ease-in-out;
  background-color: rgb(var(--v-theme-surface));
  border-radius: 8px !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  animation: fadeIn 0.2s ease;
}

.detail-panel:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.border-dashed {
  border-style: dashed !important;
  border-color: rgba(var(--v-theme-on-surface), 0.15) !important;
}

.letter-spacing-1 {
  letter-spacing: 0.12em;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
