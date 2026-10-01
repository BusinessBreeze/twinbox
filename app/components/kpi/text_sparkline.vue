<template>
  <KpiText
    :title="title"
    :value="latestValue"
    :format="format"
    :disabled="disabled"
    :color="color"
    :icon="icon"
    class="sparkline-card"
  >
    <div class="sparkline-backdrop">
      <v-sparkline
        :model-value="sparklineData"
        :color="sparklineColor"
        :line-width="3"
        :smooth="10"
        fill
        auto-draw
        height="36"
        padding="2"
      />
    </div>
  </KpiText>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { VSparkline } from 'vuetify/components';
import KpiText from './text.vue';

interface Props {
  title: string;
  value?: number[] | number;
  format?: (val: any) => string | number;
  disabled?: boolean;
  color?: string;
  icon?: string;
}

const props = withDefaults(defineProps<Props>(), {
  value: () => [],
  disabled: false,
  color: 'primary'
});

const latestValue = computed(() => {
  if (Array.isArray(props.value)) {
    if (props.value.length === 0) return 0;
    return props.value[props.value.length - 1];
  }
  return props.value ?? 0;
});

const sparklineData = computed(() => {
  if (!Array.isArray(props.value) || props.value.length === 0) {
    return [0, 0];
  }
  if (props.value.length === 1) {
    return [0, props.value[0]];
  }
  return props.value;
});

const sparklineColor = computed(() => {
  if (props.disabled) {
    return '#9E9E9E';
  }
  return props.color || 'primary';
});
</script>

<style scoped>
.sparkline-card {
  position: relative;
  overflow: hidden;
}
.sparkline-backdrop {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 38px;
  opacity: 0.32;
  pointer-events: none;
  z-index: 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
</style>
