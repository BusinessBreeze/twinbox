import { db } from "hub:db";
import { accounts } from "hub:db:schema";
import { automations, connectionsIMAP, imapSearches, llmFilters } from "#server/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { decryptConfig } from "#server/services/app/connections_imap";

/**
 * Finds all due automations, joining with their attached IMAP connection records,
 * IMAP search criteria, and LLM filters, and updates their last_poll timestamp to the current time.
 */
export const getDueAutomations = async () => {
    const nowSec = Math.floor(Date.now() / 1000);

    // Query automations where last_poll + poll_seconds <= current time in seconds
    const results = await db
        .select({
            automation: automations,
            connection: connectionsIMAP,
            search: imapSearches,
            llmFilter: llmFilters,
            account: accounts
        })
        .from(automations)
        .leftJoin(accounts, eq(automations.owner_id, accounts.id))
        .leftJoin(connectionsIMAP, eq(automations.imap_connection_id, connectionsIMAP.id))
        .leftJoin(imapSearches, eq(automations.search_id, imapSearches.id))
        .leftJoin(llmFilters, eq(automations.llm_filter_id, llmFilters.id))
        .where(
            sql`${automations.last_poll} + ${automations.poll_seconds} <= ${nowSec}`
        );

    // Check automations.active and accounts.cron_active integers as booleans; if 0 (false), filter from the list
    const activeResults = results.filter(r => {
        // Automation active state (default 1)
        const autoActive = r.automation?.active;
        if (autoActive !== undefined && autoActive !== null && !Boolean(autoActive)) {
            return false;
        }

        // Account cron_active state (default 1)
        const cronActive = r.account?.cron_active;
        return cronActive === undefined || cronActive === null ? true : Boolean(cronActive);
    });

    if (activeResults.length > 0) {
        const ids = activeResults.map(r => r.automation.id);

        // Update last_poll to now for these automations
        await db
            .update(automations)
            .set({ last_poll: new Date() })
            .where(inArray(automations.id, ids));
    }

    return activeResults
        .map(r => {
            let connection = r.connection ? {
                ...r.connection,
                config: decryptConfig(r.connection.config)
            } : null;

            if (!connection && r.automation.imap_connection_id === 'staging') {
                connection = {
                    id: 'staging',
                    name: 'Staging',
                    host: 'staging',
                    port: 0,
                    use_ssl: 0,
                    auth_type: 'staging',
                    username: 'staging',
                    owner_id: r.automation.owner_id,
                    folders: ['INBOX'],
                    config: {},
                    createdAt: new Date(),
                    updatedAt: new Date()
                } as any;
            }

            return {
                ...r,
                connection
            };
        })
        .filter(r => r.connection !== null);
};

