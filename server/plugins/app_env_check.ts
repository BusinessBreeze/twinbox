import { checkEnv } from '#bs/utils/check_env';

// A missing required variable stops startup instead of failing later with a confusing error.
export default defineNitroPlugin(() => {
  checkEnv('twinbox', ['SECRET_ENCRYPTION_KEY', 'BASE_URL', 'LLM_BASE_URL', 'LLM_MODEL'], {
    TTS_BASE_URL: 'the TTS task',
  });
});
