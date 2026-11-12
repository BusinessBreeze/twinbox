<template>
  <v-dialog v-model="open" max-width="640">
    <v-card>
      <v-card-title class="d-flex align-center ga-2">
        <v-icon color="primary">mdi-creation</v-icon>
        <span class="flex-grow-1 text-truncate">{{ t('automation_draft.title') }}</span>
        <!-- The draft's name, filter and tasks as JSON on the clipboard, to share or keep -->
        <template v-if="step === 'draft' && automation">
          <span v-if="copied" class="text-caption text-success">({{ t('automation_draft.copied') }})</span>
          <v-btn icon variant="text" size="small" :title="t('automation_draft.share')" @click="copyDraft">
            <v-icon>mdi-share-variant</v-icon>
          </v-btn>
        </template>
      </v-card-title>

      <!-- 1. What should happen with emails like the staged ones -->
      <v-card-text v-if="step === 'intent'">
        <p class="text-body-2 text-medium-emphasis mb-4">
          {{ stagedCount ? t('automation_draft.based_on', { count: stagedCount }) : t('automation_draft.none_staged') }}
        </p>
        <!-- The app's form (fields, rules, translations); the dialog has its own buttons -->
        <FormWrapper
          v-if="loaded"
          :key="formKey"
          :headers="headers"
          :initial-data="values"
          no-submit
          @valid="(v: boolean) => (formValid = v)"
        />
      </v-card-text>

      <!-- 2. The saved draft (inactive), and 3. the result of a test run over the staged emails -->
      <v-card-text v-else-if="automation">
        <div class="facts text-body-2">
          <span class="label">{{ t('automation_draft.name') }}</span>
          <span>{{ automation.name }}</span>
          <span class="label">{{ t('automation_draft.filter_prompt') }}</span>
          <span>{{ automation.filter_prompt || '—' }}</span>
          <span class="label">{{ t('automation_draft.tasks') }}</span>
          <span>{{ (automation.tasks || []).map((task: any) => task.label).join(' → ') }}</span>
        </div>
        <p class="text-caption text-medium-emphasis mt-3">{{ t('automation_draft.saved_inactive') }}</p>

        <template v-if="result">
          <v-divider class="my-3" />
          <p class="text-body-2 font-weight-bold">{{ t('automation_draft.result', { passed: result.passed, total: result.total }) }}</p>
          <p v-if="result.unjudged" class="text-body-2 text-error">{{ t('automation_draft.unjudged', { count: result.unjudged }) }}</p>
          <p v-if="result.aborted" class="text-body-2 text-error">{{ t('automation_draft.aborted', { reason: result.aborted }) }}</p>
          <p v-if="!result.files.length" class="text-body-2 text-medium-emphasis">{{ t('automation_draft.no_files') }}</p>
          <!-- The files are in Artifacts; each opens in a new tab, so this dialog stays open -->
          <div v-for="file in result.files" :key="file.id" class="text-body-2">
            <a :href="`/api/v0.1/app/files/${encodeURIComponent(file.file_id)}?inline=1`" target="_blank" rel="noopener" class="text-primary">{{ file.filename }}</a>
          </div>
        </template>
      </v-card-text>

      <v-card-actions class="flex-wrap">
        <template v-if="step === 'intent'">
          <v-spacer />
          <v-btn @click="open = false">{{ t('common.close') }}</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!stagedCount || !formValid" :loading="busy" @click="createDraft">
            {{ t('automation_draft.create') }}
          </v-btn>
        </template>
        <template v-else>
          <v-btn color="error" :disabled="busy" @click="deleteDraft">{{ t('automation_draft.delete') }}</v-btn>
          <v-spacer />
          <v-btn :disabled="busy" @click="openAutomations">{{ t('automation_draft.open') }}</v-btn>
          <v-btn v-if="result" :disabled="busy" @click="activate">{{ t('automation_draft.activate') }}</v-btn>
          <v-btn color="primary" variant="flat" :loading="busy" @click="testDraft">
            {{ result ? t('automation_draft.test_again') : t('automation_draft.test') }}
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
// New automation from the staged emails: say what should happen (1), the server drafts and saves it inactive (2) with
// one artifact task delivered to the chosen channel (more tasks are added in the automation form),
// test it on the staged emails with deliveries going to Artifacts (3), then activate, edit or delete it. Everything is
// on the server, so leaving the dialog loses nothing: the draft is a normal (inactive) automation.
import { ref, reactive, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiGet, apiPost, apiPatch, apiDelete } from '#ba/utils/fetch/wrappers';
import FormWrapper from '#ba/components/form/form.vue';
import { getRules } from '#b/shared/rules/getRules';
import { zod_rules } from '#shared/rules/app/automation_draft';
import { limits } from '#shared/limits';

const open = defineModel<boolean>({ default: false });
const { t } = useI18n();

// Step 1 as a form: the same rules the server checks (shared/rules/app/automation_draft.ts)
const rules = getRules(zod_rules);
const headers = computed(() => [
  // A filter by theme or none; exact terms are a job for the source's own search
  { key: 'match_note', set_type: 'note', opts: { text: 'automation_draft.match_note', color: 'primary' } },
  {
    key: 'match', title: 'automation_draft.match', set_type: 'enum', rules: rules.match, default: 'theme',
    opts: { enum_values: [
      { title: t('automation_draft.match_theme'), value: 'theme' },
      { title: t('automation_draft.match_none'), value: 'none' },
    ] },
  },
  {
    key: 'intent', title: 'automation_draft.intent', set_type: 'string_area', rules: rules.intent,
    opts: { placeholder: t('automation_draft.intent_hint'), max_chars: limits.llm.max_prompt_chars },
  },
  {
    key: 'channel_id', title: 'automation_draft.channel', set_type: 'enum', rules: rules.channel_id,
    default: channels.value[0]?.id ?? null,
    opts: { enum_values: channels.value.map((c) => ({ title: c.name, value: c.id })) },
  },
]);
// The form writes into this object (its initial data); a new key on each opening starts it fresh
const values = reactive<{ intent: string; match: string | null; channel_id: string | null }>({ intent: '', match: null, channel_id: null });
const formValid = ref(false);
const formKey = ref(0);
const loaded = ref(false);

const step = ref<'intent' | 'draft'>('intent');
const busy = ref(false);
const stagedCount = ref(0);
const channels = ref<Array<{ id: string; name: string }>>([]);
const automation = ref<any>(null);
const copied = ref(false);
const result = ref<{ total: number; passed: number; aborted: string | null; files: Array<{ id: string; file_id: string; filename: string; mime: string }> } | null>(null);

const rows = (res: any) => (Array.isArray(res) ? res : res?.data ?? []);

// Fresh start each time it opens: staged emails and channels as they are now
watch(open, async (isOpen) => {
  if (!isOpen) return;
  step.value = 'intent';
  automation.value = null;
  copied.value = false;
  result.value = null;
  const [emails, channelList] = await Promise.all([
    apiGet<any>('/api/v0.1/app/email').catch(() => []),
    apiGet<any>('/api/user/notification').catch(() => []),
  ]);
  stagedCount.value = rows(emails).filter((e: any) => e.staging_item).length;
  channels.value = rows(channelList).map((c: any) => ({ id: c.id, name: c.name }));
  Object.assign(values, { intent: '', match: undefined, channel_id: undefined });
  formKey.value++;
  loaded.value = true;
});

const run = async (fn: () => Promise<void>) => {
  busy.value = true;
  try {
    await fn();
  } catch {
    // the error is shown by the fetch wrappers
  } finally {
    busy.value = false;
  }
};

const createDraft = () => run(async () => {
  const res = await apiPost<any>('/api/v0.1/app/automation/draft', { intent: values.intent, match: values.match, channel_id: values.channel_id });
  automation.value = res?.data;
  step.value = 'draft';
});

const testDraft = () => run(async () => {
  result.value = (await apiPost<any>(`/api/v0.1/app/automation/${automation.value.id}/test`, {}))?.data ?? null;
});

const activate = () => run(async () => {
  await apiPatch(`/api/v0.1/app/automation/${automation.value.id}`, { active: 1 });
  open.value = false;
});

const deleteDraft = () => run(async () => {
  await apiDelete(`/api/v0.1/app/automation/${automation.value.id}`);
  open.value = false;
});

// Plain HTTP on the LAN has no navigator.clipboard (it needs HTTPS or localhost): fall back to a hidden textarea
const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  try {
    if (!document.execCommand('copy')) throw new Error('copy refused');
  } finally {
    area.remove();
  }
};

const copyDraft = async () => {
  // The two drafted prompts, both named after the automation (without "Draft: ")
  const name = String(automation.value.name || '').replace(/^Draft: /, '');
  const artifact = (automation.value.tasks || []).find((task: any) => task.type === 'create_artifact');
  const shared = {
    filter: { name, prompt: automation.value.filter_prompt || '' },
    artifact: { name, prompt: artifact?.args?.prompt || '' },
  };
  try {
    await copyText(JSON.stringify(shared, null, 2));
    copied.value = true;
  } catch (err) {
    console.error('Copying the draft failed:', err);
  }
};

const openAutomations = () => {
  open.value = false;
  navigateTo('/automations');
};
</script>

<style scoped>
.facts {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  column-gap: 12px;
  row-gap: 4px;
}

.label {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
