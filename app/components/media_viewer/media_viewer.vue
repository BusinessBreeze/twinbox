<template>
  <v-dialog v-model="open" max-width="800" scrollable>
    <v-card class="media-viewer">
      <v-card-item>
        <template #prepend>
          <v-avatar color="primary" variant="tonal" size="40" class="me-2">
            <v-icon color="primary">{{ icon }}</v-icon>
          </v-avatar>
        </template>
        <v-card-title>{{ title }}</v-card-title>
        <v-card-subtitle>{{ subtitle }}</v-card-subtitle>
        <template #append>
          <v-btn icon="mdi-close" variant="text" size="small" :title="t('common.close')" @click="open = false" />
        </template>
      </v-card-item>

      <v-divider v-if="scrolls" />

      <v-card-text ref="bodyRef" style="max-height: 70vh;">
        <div ref="contentRef">
          <v-progress-circular v-if="loading || preparing" indeterminate color="primary" class="d-block mx-auto my-6" />
          <div v-else-if="failed" class="text-body-2 text-medium-emphasis text-center py-6">{{ t('media_viewer.unsupported', { type: mime }) }}</div>
          <component :is="body" v-else-if="body" />
        </div>
      </v-card-text>

      <v-divider v-if="scrolls" />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('common.close') }}</v-btn>
        <v-btn color="primary" variant="flat" prepend-icon="mdi-download" :disabled="data == null && !downloadUrl" @click="download">
          {{ t('media_viewer.download') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
// A modal that shows content of any type it has a renderer for (./renderers): give it the mime type and the data.
// The data is sanitized by the renderer before it is shown; the download is the data as given (or download-url).
import { ref, shallowRef, computed, watch, onBeforeUnmount, type FunctionalComponent } from 'vue';
import { useI18n } from 'vue-i18n';
import { rendererFor, formatSize, type MediaData, type MediaRenderer } from './renderers';

const props = defineProps<{
  modelValue: boolean
  /** Mime type of `data`, e.g. text/html, text/markdown, audio/mpeg */
  mime: string
  /** The content; null while it loads */
  data: MediaData | null
  title?: string
  /** Name of the downloaded file; default: the title with the type's extension */
  filename?: string
  /** Download from here instead of the data (e.g. a server-built .eml of an email record) */
  downloadUrl?: string
  loading?: boolean
}>();
const emit = defineEmits<{ 'update:modelValue': [boolean] }>();
const { t } = useI18n();

const open = computed({ get: () => props.modelValue, set: (v: boolean) => emit('update:modelValue', v) });
const icon = computed(() => rendererFor(props.mime)?.icon ?? 'mdi-file-outline');

// Under the title, the same for every type: mime type · size (bytes as UTF-8 for text)
const subtitle = computed(() => {
  const data = props.data;
  if (data == null) return props.mime;
  const bytes = data instanceof Blob ? data.size : new TextEncoder().encode(data).length;
  return `${props.mime} · ${formatSize(bytes)}`;
});

// Dividers above and below the body only while it scrolls (checked whenever the content's size changes)
const bodyRef = ref<{ $el: HTMLElement } | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const scrolls = ref(false);
const sizes = import.meta.client ? new ResizeObserver(() => {
  const el = bodyRef.value?.$el;
  scrolls.value = !!el && el.scrollHeight > el.clientHeight + 1;
}) : null;
watch(contentRef, (el) => {
  sizes?.disconnect();
  if (el) sizes?.observe(el);
});

const preparing = ref(false);
const failed = ref(false);
const body = shallowRef<FunctionalComponent | null>(null);
let shown: { renderer: MediaRenderer<any>; safe: unknown } | null = null;
let generation = 0;

const clear = () => {
  if (shown) shown.renderer.release(shown.safe);
  shown = null;
  body.value = null;
};

// Sanitize once per content; a newer content wins over a slower older one
watch(() => [open.value, props.data, props.mime] as const, async ([isOpen, data, mime]) => {
  const run = ++generation;
  clear();
  failed.value = false;
  if (!isOpen || data == null) return;
  const renderer = rendererFor(mime);
  if (!renderer) { failed.value = true; return; }
  preparing.value = true;
  try {
    const safe = await renderer.sanitize(data, mime);
    if (run !== generation) { renderer.release(safe); return; }
    shown = { renderer, safe };
    body.value = () => renderer.render(safe);
  } catch (err) {
    console.error('media_viewer: could not show content:', err);
    if (run === generation) failed.value = true;
  } finally {
    if (run === generation) preparing.value = false;
  }
}, { immediate: true });

onBeforeUnmount(() => { clear(); sizes?.disconnect(); });

const download = () => {
  if (props.downloadUrl) {
    Object.assign(document.createElement('a'), { href: props.downloadUrl }).click();
    return;
  }
  if (props.data == null) return;
  const blob = props.data instanceof Blob ? props.data : new Blob([props.data], { type: props.mime });
  const extension = rendererFor(props.mime)?.extension(props.mime) ?? 'bin';
  const name = props.filename || `${(props.title || 'download').replace(/[\\/:*?"<>|\p{Cc}]+/gu, '_').slice(0, 100)}.${extension}`;
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
</script>

<style>
/* Not scoped: the renderers build their elements outside this component */
.media-viewer .media-viewer__frame {
  display: block;
  width: 100%;
  min-height: 120px;
  background: #fff;
  border-radius: 4px;
}

.media-viewer .markdown-body h1,
.media-viewer .markdown-body h2,
.media-viewer .markdown-body h3,
.media-viewer .markdown-body h4 {
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
  line-height: 1.3;
}

.media-viewer .markdown-body h1 {
  font-size: 1.4rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding-bottom: 0.3rem;
}

.media-viewer .markdown-body h2 {
  font-size: 1.2rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  padding-bottom: 0.2rem;
}

.media-viewer .markdown-body h3 {
  font-size: 1.05rem;
}

.media-viewer .markdown-body p {
  margin-bottom: 0.75rem;
  line-height: 1.6;
}

.media-viewer .markdown-body ul,
.media-viewer .markdown-body ol {
  padding-left: 1.5rem;
  margin-bottom: 0.75rem;
}

.media-viewer .markdown-body li {
  margin-bottom: 0.25rem;
}

.media-viewer .markdown-body code {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  padding: 0.15em 0.35em;
  border-radius: 4px;
  font-size: 88%;
  font-family: monospace;
}

.media-viewer .markdown-body pre {
  background-color: rgba(var(--v-theme-on-surface), 0.06);
  padding: 0.85rem;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 1rem;
}

.media-viewer .markdown-body pre code {
  background-color: transparent;
  padding: 0;
  font-size: 0.85rem;
}

.media-viewer .markdown-body blockquote {
  padding: 0.5rem 1rem;
  border-left: 4px solid rgb(var(--v-theme-primary));
  background-color: rgba(var(--v-theme-primary), 0.05);
  margin-bottom: 1rem;
  border-radius: 0 4px 4px 0;
}

.media-viewer .markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1rem;
}

.media-viewer .markdown-body th,
.media-viewer .markdown-body td {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  padding: 6px 12px;
}

.media-viewer .markdown-body th {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
  font-weight: 600;
}

.media-viewer .markdown-body hr {
  border: 0;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  margin: 1rem 0;
}
</style>
