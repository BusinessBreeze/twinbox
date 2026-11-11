<template>
  <div class="dashboard-tier tier-middle d-flex flex-column ga-1 w-100 py-2 overflow-hidden">
    <!-- Header: section title and the create button (top right, like the tables) -->
    <div class="d-flex align-center justify-space-between px-1">
      <span class="text-subtitle-1 font-weight-bold">{{ $t('dashboard.recent_automations') }}</span>
      <v-btn
        color="primary"
        :variant="isCreating ? 'flat' : 'tonal'"
        size="small"
        prepend-icon="mdi-plus"
        @click="onToggleCreate"
      >
        {{ $t('dashboard.new_automation') }}
      </v-btn>
    </div>

    <!-- Cards, and the create form or an automation's events beside them -->
    <div class="section-content d-flex ga-3 align-stretch min-w-0">
      <!-- Sub-section A: Automation Cards Container (Wraps if too many) -->
      <div
        class="cards-container align-content-start overflow-y-auto min-w-0 pa-1"
        :class="{ 'cards-container--split': !!selectedAutomation || isCreating }"
      >
        <template v-if="recentAutomations.length > 0">
          <DashboardCard
            v-for="auto in recentAutomations"
            :key="auto.id"
            :automation="auto"
            :is-selected="selectedAutomation?.id === auto.id"
            @select="onSelectAutomation"
          />
        </template>

        <!-- Empty State: no automation yet (create the first one), or none has run recently -->
        <v-card
          v-else
          class="flex-grow-1 w-100 h-100 rounded-lg d-flex flex-column align-center justify-center border-dashed pa-6"
          style="grid-column: 1 / -1;"
          variant="outlined"
          flat
        >
          <v-icon icon="mdi-robot-outline" size="36" color="medium-emphasis" class="mb-2" />
          <div class="text-caption text-uppercase font-weight-medium text-medium-emphasis letter-spacing-1">
            {{ hasAutomations ? $t('dashboard.no_recent_automations') : $t('dashboard.no_automations') }}
          </div>
          <v-btn
            v-if="!hasAutomations && !isCreating"
            color="primary"
            prepend-icon="mdi-plus"
            class="mt-4"
            @click="onToggleCreate"
          >
            {{ $t('dashboard.create_first_automation') }}
          </v-btn>
        </v-card>
      </div>

      <!-- Sub-section B: Split Panel (Takes half of the remaining space when active) -->
      <v-card
        v-if="isCreating"
        class="detail-panel my-1 pa-4 overflow-y-auto d-flex flex-column"
        variant="flat"
      >
        <div class="d-flex align-center justify-space-between mb-3 pb-2 border-b">
          <span class="text-subtitle-1 font-weight-bold text-primary">
            {{ $t('dashboard.new_automation') }}
          </span>
          <v-btn icon size="small" variant="text" @click="isCreating = false">
            <v-icon size="18">mdi-close</v-icon>
          </v-btn>
        </div>
        <FormCreate
          ref="formCreateRef"
          v-if="automationMeta"
          :meta="automationMeta"
          :no-card="true"
          @created="onCreatedAutomation"
          @cancel="isCreating = false"
        />
      </v-card>

      <DashboardEvents
        v-else-if="selectedAutomation"
        class="detail-panel my-1"
        :automation="selectedAutomation"
        @close="closeDetail"
        @changed="fetchRecentAutomations"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import DashboardCard, { type AutomationCardData } from '~/components/dashboard/card.vue';
import { getSourceType } from '#shared/source_types';
import DashboardEvents from '~/components/dashboard/events.vue';
import FormCreate from '#ba/components/form/form_create.vue';
import automationMetaFcn from '~/schemas/automation';
import automationTaskChooser from '~/components/form_widgets/automation_task_chooser.vue';

export type RecentAutomation = AutomationCardData;

const { t } = useI18n();

const recentAutomations = ref<RecentAutomation[]>([]);
const hasAutomations = ref(true);   // until loaded: no "create your first" flash
const selectedAutomation = ref<RecentAutomation | null>(null);
const isCreating = ref(false);
const automationMeta = ref<any>(null);
const formCreateRef = ref<any>(null);

watch(() => formCreateRef.value, (formCreate) => {
  if (formCreate) {
    formCreate.register('automation_task_chooser', automationTaskChooser);
  }
});

const onToggleCreate = () => {
  selectedAutomation.value = null;
  isCreating.value = !isCreating.value;
};

const onSelectAutomation = (auto: RecentAutomation) => {
  isCreating.value = false;
  selectedAutomation.value = auto;
};

const closeDetail = () => {
  selectedAutomation.value = null;
};

const onCreatedAutomation = () => {
  isCreating.value = false;
  fetchRecentAutomations();
};

// The automations that ran, newest first (last run and last problem are kept on the automation), each with the
// number of its warnings and errors in the log (the bell only counts them; they are deleted here, in its events)
const fetchRecentAutomations = async () => {
  try {
    const [automationsRes, problemsRes, sourcesRes, sourceProblemsRes] = await Promise.all([
      $fetch<any>('/api/v0.1/app/automation').catch(() => ({ data: [] })),
      $fetch<any>('/api/user/event/search?limit=100&sortBy=createdAt&sortDir=desc&level=warn,warning,error&category=automation')
        .catch(() => ({ data: [] })),
      $fetch<any>('/api/v0.1/app/sources').catch(() => ({ data: [] })),
      $fetch<any>('/api/user/event/search?limit=100&sortBy=createdAt&sortDir=desc&level=warn,warning,error&category=source')
        .catch(() => ({ data: [] })),
    ]);
    const automations: any[] = automationsRes?.data || [];
    const sources = new Map<string, any>((sourcesRes?.data || []).map((src: any) => [src.id, src]));
    hasAutomations.value = automations.length > 0;

    const problems = new Map<string, number>();
    for (const event of problemsRes?.data || []) {
      let meta = event.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch {}
      }
      if (meta?.id) problems.set(String(meta.id), (problems.get(String(meta.id)) ?? 0) + 1);
    }

    // Sources with warnings / errors in the log (by source_id; older events only name the source)
    const sourceProblems = new Set<string>();
    const sourceIdByName = new Map<string, string>([...sources.values()].map((src: any) => [src.name, src.id]));
    for (const event of sourceProblemsRes?.data || []) {
      let meta = event.metadata;
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta); } catch {}
      }
      const id = meta?.source_id ?? sourceIdByName.get(meta?.source);
      if (id) sourceProblems.add(String(id));
    }

    recentAutomations.value = automations
      .filter((a) => a.last_run_at)
      .sort((a, b) => new Date(b.last_run_at).getTime() - new Date(a.last_run_at).getTime())
      .slice(0, 10)
      .map((a) => {
        const source = sources.get(a.source_id);
        return {
          id: a.id,
          title: a.name,
          active: a.active ?? 1,
          lastRun: a.last_run_at,
          lastIssueLevel: a.last_issue_level ?? null,
          problems: problems.get(String(a.id)) ?? 0,
          sourceLabel: a.source_label || source?.name || '',
          lastPoll: source?.last_successful_poll ?? null,
          sourceProblems: !!source && sourceProblems.has(String(source.id)),
          // Only pollable types have a schedule (staging runs by hand)
          pollSeconds: source && getSourceType(source.type)?.pollable ? Number(source.poll_seconds) || null : null,
        };
      });
  } catch (err) {
    console.error('Failed to fetch recent automations:', err);
  }
};

let pollTimer: any = null;

onMounted(async () => {
  automationMeta.value = await automationMetaFcn(t);
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

.section-content {
  flex: 1 1 0px;
  min-height: 0;
}

.cards-container {
  /* Cards of one fixed width in a grid (opening the events panel changes how many fit a row, not their size);
     the empty state spans it */
  display: grid;
  grid-template-columns: repeat(auto-fill, 260px);
  grid-auto-rows: max-content;
  gap: 12px;
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
