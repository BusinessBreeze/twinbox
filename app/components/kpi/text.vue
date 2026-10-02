<template>
  <v-card
    class="kpi-card position-relative d-flex flex-column pa-0 rounded-lg overflow-hidden"
    :class="{ 'kpi-disabled': disabled }"
    flat
  >
    <!-- Top Main Section (White / Surface) -->
    <div class="kpi-top-section position-relative d-flex justify-space-between align-center pa-3 flex-grow-1">
      <!-- Left: Value -->
      <div class="d-flex align-center flex-grow-1 overflow-hidden pr-2 z-1">
        <div class="kpi-value font-weight-bold text-truncate" :style="valueStyle">
          {{ formattedValue }}
        </div>
      </div>

      <!-- Right: Outline Icon -->
      <div v-if="icon" class="kpi-icon-wrapper d-flex align-center justify-center z-1">
        <v-icon :icon="icon" size="26" :color="iconColor" />
      </div>

      <slot />
    </div>

    <!-- Bottom Banner / Colored Footer Strip with Title -->
    <div class="kpi-footer-strip d-flex align-center px-3 py-1" :style="footerStyle">
      <span class="kpi-footer-title text-caption font-weight-bold text-truncate">
        {{ title }}
      </span>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  title: string;
  value?: any;
  format?: (val: any) => string | number;
  disabled?: boolean;
  color?: string;
  icon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  value: 0,
  disabled: false,
  color: 'primary'
});

const accentColor = computed(() => {
  if (props.disabled) return '#9E9E9E';
  if (!props.color || props.color === 'primary') {
    return 'rgb(var(--v-theme-primary))';
  }
  return props.color;
});

const valueStyle = computed(() => ({
  color: accentColor.value
}));

const footerStyle = computed(() => ({
  backgroundColor: accentColor.value,
  color: '#FFFFFF'
}));

const iconColor = computed(() => {
  if (props.disabled) return '#9E9E9E';
  return accentColor.value;
});

const formattedValue = computed(() => {
  if (props.format && typeof props.format === 'function') {
    return props.format(props.value);
  }
  if (props.value === null || props.value === undefined) {
    return '0';
  }
  if (typeof props.value === 'boolean') {
    return props.value ? 'Yes' : 'No';
  }
  return String(props.value);
});
</script>

<style scoped>
.kpi-card {
  transition: all 0.2s ease-in-out;
  background-color: rgb(var(--v-theme-surface));
  border-radius: 8px !important;
  width: 100%;
  max-width: 240px;
  min-height: 105px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.kpi-card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12) !important;
}

.kpi-card.kpi-disabled {
  opacity: 0.7;
  box-shadow: none !important;
}

.kpi-top-section {
  min-height: 68px;
}

.z-1 {
  z-index: 1;
}

.kpi-value {
  font-size: clamp(1.05rem, 1.8vw, 1.45rem);
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.kpi-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.kpi-footer-strip {
  min-height: 30px;
  font-size: 0.78rem;
  line-height: 1;
  color: #FFFFFF;
  border-bottom-left-radius: 7px;
  border-bottom-right-radius: 7px;
}

.kpi-footer-title {
  color: #FFFFFF;
  font-weight: 700;
  letter-spacing: 0.03em;
}
</style>
