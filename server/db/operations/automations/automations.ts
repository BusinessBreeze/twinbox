import { db } from "hub:db";
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
            llmFilter: llmFilters
        })
        .from(automations)
        .innerJoin(connectionsIMAP, eq(automations.imap_connection_id, connectionsIMAP.id))
        .leftJoin(imapSearches, eq(automations.search_id, imapSearches.id))
        .leftJoin(llmFilters, eq(automations.llm_filter_id, llmFilters.id))
        .where(
            sql`${automations.last_poll} + ${automations.poll_seconds} <= ${nowSec}`
        );

    if (results.length > 0) {
        const ids = results.map(r => r.automation.id);

        // Update last_poll to now for these automations
        await db
            .update(automations)
            .set({ last_poll: new Date() })
            .where(inArray(automations.id, ids));
    }

    return results.map(r => ({
        ...r,
        connection: r.connection ? {
            ...r.connection,
            config: decryptConfig(r.connection.config)
        } : r.connection
    }));
};
