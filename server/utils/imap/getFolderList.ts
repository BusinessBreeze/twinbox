import { ImapFlow } from 'imapflow';

/**
 * Connects to the IMAP server using the connection details in the record,
 * retrieves the folder list, sorts it alphabetically, and returns the sorted folders array.
 */
export const getFolderList = async (record: any) => {
    const client = new ImapFlow({
        host: record.host,
        port: record.port,
        secure: record.use_ssl === 1,
        auth: {
            user: record.username,
            pass: record.auth_type === 'login' ? record.config?.credential : undefined,
            accessToken: record.auth_type === 'oauth' ? record.config?.credential : undefined,
        },
        connectionTimeout: 10000,
        greetingTimeout: 20000,
        logger: false
    });

    try {
        await client.connect();
        const list = await client.list();
        const folders = list.map(mailbox => mailbox.path).sort((a, b) => a.localeCompare(b));
        
        await client.logout();
        return folders;
    } catch (err: any) {
        console.error(`[IMAP getFolderList] Failed to get folders for connection ${record.id}:`, err?.message || err);
        throw err;
    }
};

export default getFolderList;
