<template>
  <v-container fluid class="automation-library-page pa-6 max-w-7xl mx-auto">
    <!-- Header Section -->
    <div class="header-section d-flex flex-column flex-sm-row align-sm-center justify-space-between ga-4 mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold text-slate-900 tracking-tight mb-1">
          {{ $t('automation_libraries.title') }}
        </h1>
        <p class="text-body-1 text-medium-emphasis">
          {{ $t('automation_libraries.subtitle') }}
        </p>
      </div>

      <!-- Quick Navigation -->
      <div class="d-flex flex-wrap align-center ga-2 flex-shrink-0 align-self-start align-self-sm-center">
        <span class="text-body-2 font-weight-medium text-medium-emphasis me-1">
          {{ $t('automation_libraries.go_to') }}
        </span>

        <v-btn
          variant="outlined"
          color="primary"
          rounded="pill"
          size="small"
          prepend-icon="mdi-robot-happy-outline"
          to="/automations"
          class="text-none font-weight-medium px-3"
        >
          {{ $t('automation_libraries.automations') }}
        </v-btn>

        <v-btn
          variant="outlined"
          color="primary"
          rounded="pill"
          size="small"
          prepend-icon="mdi-filter-cog-outline"
          to="/llm_filter"
          class="text-none font-weight-medium px-3"
        >
          {{ $t('automation_libraries.filters') }}
        </v-btn>

        <v-btn
          variant="outlined"
          color="primary"
          rounded="pill"
          size="small"
          prepend-icon="mdi-file-code-outline"
          to="/llm_create_artifact"
          class="text-none font-weight-medium px-3"
        >
          {{ $t('automation_libraries.artifacts') }}
        </v-btn>
      </div>
    </div>

    <!-- Search Field -->
    <div class="search-section mb-5">
      <v-text-field
        v-model="searchQuery"
        :placeholder="$t('automation_libraries.search_placeholder')"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="comfortable"
        rounded="pill"
        hide-details
        clearable
        class="library-search-input"
      />
    </div>

    <!-- Category Filter Chips -->
    <div class="category-filter-section mb-8">
      <div class="d-flex flex-wrap align-center ga-2">
        <v-chip
          :color="selectedCategory === 'All' ? 'primary' : undefined"
          :variant="selectedCategory === 'All' ? 'flat' : 'outlined'"
          class="font-weight-medium px-4 cursor-pointer"
          @click="selectedCategory = 'All'"
        >
          {{ $t('automation_libraries.all') }}
        </v-chip>

        <v-chip
          v-for="cat in availableCategories"
          :key="cat"
          :color="selectedCategory === cat ? 'primary' : undefined"
          :variant="selectedCategory === cat ? 'flat' : 'outlined'"
          class="font-weight-medium px-4 cursor-pointer"
          @click="selectedCategory = cat"
        >
          {{ cat }}
        </v-chip>
      </div>
    </div>

    <!-- Section Header: All templates -->
    <div class="section-title-wrapper mb-4">
      <h2 class="text-h6 font-weight-bold text-slate-900">
        {{ $t('automation_libraries.all_templates') }}
      </h2>
      <div class="text-caption text-medium-emphasis">
        {{ $t('automation_libraries.items_count', { count: filteredTemplates.length }) }}
      </div>
    </div>

    <!-- Empty State -->
    <div
      v-if="filteredTemplates.length === 0"
      class="empty-state-wrapper text-center py-12 px-4 rounded-xl border border-dashed"
    >
      <v-icon size="48" color="medium-emphasis" class="mb-3">mdi-filter-variant-remove</v-icon>
      <div class="text-subtitle-1 font-weight-medium text-medium-emphasis">
        {{ $t('automation_libraries.no_results') }}
      </div>
    </div>

    <!-- Templates Grid -->
    <v-row v-else dense class="template-grid-row">
      <v-col
        v-for="item in filteredTemplates"
        :key="item.title"
        cols="12"
        sm="6"
        md="4"
        lg="3"
        class="pa-2 d-flex"
      >
        <v-card
          variant="outlined"
          class="automation-card rounded-xl pa-5 d-flex flex-column w-100 transition-all"
        >
          <!-- Card Title -->
          <div class="card-title text-subtitle-1 font-weight-bold mb-2">
            {{ item.title }}
          </div>

          <!-- Card Description -->
          <div class="card-description text-body-2 text-medium-emphasis flex-grow-1 mb-4">
            {{ item.description }}
          </div>

          <!-- Card Footer (Tags & Action) -->
          <div class="card-footer d-flex align-center justify-space-between mt-auto pt-3">
            <!-- Tags styled with strColor -->
            <div class="tags-container d-flex flex-wrap ga-1">
              <v-chip
                v-for="tag in item.tags"
                :key="tag"
                size="small"
                variant="flat"
                :style="strColor(tag)"
                class="font-weight-medium text-caption px-2 py-0"
              >
                {{ tag }}
              </v-chip>
            </div>

            <!-- Add Button -->
            <v-btn
              size="small"
              variant="flat"
              color="primary"
              class="add-btn rounded-lg text-capitalize px-3 font-weight-medium ms-2"
              :loading="addingMap[item.title]"
              @click="addTemplate(item)"
            >
              {{ $t('automation_libraries.add') }}
            </v-btn>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import strColor from '#ba/utils/str_color';
import { apiPost } from '#ba/utils/fetch/wrappers';

const { t } = useI18n();

// Fetch default automations from public directory
const { data: defaultAutomationsData } = await useFetch<any[]>('/libraries/default_automations.json', {
  default: () => []
});

// State
const searchQuery = ref('');
const selectedCategory = ref('All');
const addingMap = ref<Record<string, boolean>>({});

// Categories list
const availableCategories = computed(() => {
  const catSet = new Set<string>();
  const items = defaultAutomationsData.value || [];
  for (const item of items) {
    if (Array.isArray(item.tags)) {
      item.tags.forEach((tag: string) => catSet.add(tag));
    }
  }
  return Array.from(catSet);
});

// Filtered templates
const filteredTemplates = computed(() => {
  let list = defaultAutomationsData.value || [];

  // Filter by category
  if (selectedCategory.value !== 'All') {
    list = list.filter((item: any) =>
      Array.isArray(item.tags) && item.tags.includes(selectedCategory.value)
    );
  }

  // Filter by search query
  if (searchQuery.value?.trim()) {
    const q = searchQuery.value.toLowerCase().trim();
    list = list.filter((item: any) => {
      const matchTitle = (item.title || '').toLowerCase().includes(q);
      const matchDesc = (item.description || '').toLowerCase().includes(q);
      const matchTags = Array.isArray(item.tags) && item.tags.some((t: string) => t.toLowerCase().includes(q));
      return matchTitle || matchDesc || matchTags;
    });
  }

  return list;
});

// Add template action
const addTemplate = async (template: any) => {
  addingMap.value[template.title] = true;
  try {
    await apiPost('/api/v0.1/app/automation/add_template', template);
  } catch (err: any) {
    console.error('Failed to add automation template:', err);
  } finally {
    addingMap.value[template.title] = false;
  }
};
</script>

<style scoped>
.automation-library-page {
  max-width: 1400px;
}

.library-search-input :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface));
  border-radius: 9999px !important;
}

.automation-card {
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity, 0.12));
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}

.automation-card:hover {
  border-color: rgba(var(--v-theme-primary), 0.4);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.card-title {
  color: rgb(var(--v-theme-on-surface));
  line-height: 1.35;
}

.card-description {
  line-height: 1.5;
  min-height: 3rem;
}

.cursor-pointer {
  cursor: pointer;
}

.transition-all {
  transition: all 0.2s ease-in-out;
}
</style>
