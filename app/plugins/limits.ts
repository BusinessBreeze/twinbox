// The browser takes the server's limits (app_defaults.json + LIMITS_* env) from the page payload,
// so form rules and counters match what the server enforces.
import { limits, setLimits } from '#shared/limits';

export default defineNuxtPlugin(() => {
    const state = useState('limits', () => limits);
    if (import.meta.client) setLimits(state.value);
});
