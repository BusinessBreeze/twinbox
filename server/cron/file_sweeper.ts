// Hourly: applies each automation's artifact retention, then removes what failures and deletions left in the file
// store (see artifactService.applyRetention, fileService.sweep).
import { defineCronHandler } from '#nuxt/cron';
import { fileService } from '#server/services/app/files';
import { artifactService } from '#server/services/app/artifacts';
import { emitTelemetryEvent, EventScope, EventLevel } from '#bs/utils/telemetry/event';

export default defineCronHandler(() => '0 17 * * * *', async () => {
    try {
        const removed = { artifacts: await artifactService.applyRetention(), ...(await fileService.sweep()) };
        if (removed.artifacts || removed.orphaned || removed.unreferenced || removed.blobs) {
            await emitTelemetryEvent({ scope: EventScope.SYSTEM, level: EventLevel.INFO, category: 'files', message: 'File sweep', metadata: removed });
        }
    } catch (err: any) {
        await emitTelemetryEvent({ scope: EventScope.SYSTEM, level: EventLevel.ERROR, category: 'files', message: `File sweep failed: ${err?.message || err}` });
    }
});
