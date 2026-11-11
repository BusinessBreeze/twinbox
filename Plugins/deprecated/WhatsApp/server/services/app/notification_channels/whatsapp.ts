import makeWASocket, { BufferJSON, Browsers, DisconnectReason, initAuthCreds } from '@whiskeysockets/baileys';
import P from 'pino';

export class WhatsappChannel {
    private state: any;
    private saveCreds: () => void;
    private memoryDatabase: Map<any, any>;
    private saveConfig: any;

    constructor(configData: any, save: any = null) {
        this.memoryDatabase = new Map(configData || []);
        this.saveConfig = save;

        const generated = this.useDbAuthState();
        this.state = generated.state;
        this.saveCreds = generated.saveCreds;
    }


    private useDbAuthState() {
        // 1. Fetch data safely from the map
        const rawCreds = this.memoryDatabase.get('creds');
        const databaseKeysCount = this.memoryDatabase.size;

        let creds;

        if (!rawCreds) {
            // A completely fresh authorization sequence. 
            // Do not warn or clear; simply initialize a clean state template.
            creds = initAuthCreds();
        } else if (databaseKeysCount <= 2) {
            // CRITICAL FAIL-SAFE CHECK:
            // Creds text exists, but the accompanying cryptographic keys are missing.
            // This indicates actual session corruption. Purge and force a fresh QR.
            console.warn("Stale or corrupted session signatures detected. Purging local states to force fresh QR sequence...");
            this.memoryDatabase.clear();
            creds = initAuthCreds();
        } else {
            // Data is healthy and complete. Restore the session normally.
            creds = JSON.parse(rawCreds as string, BufferJSON.reviver);
        }

        // Explicitly use an arrow function to lock in context execution safety
        const saveCreds = () => {
            this.memoryDatabase.set('creds', JSON.stringify(creds, BufferJSON.replacer));
            if (this.saveConfig) {
                this.saveConfig(Array.from(this.memoryDatabase.entries()));
            }
        };

        return {
            state: {
                creds,
                keys: {
                    get: (type: any, ids: any) => {
                        const data: any = {};
                        for (const id of ids) {
                            let value = this.memoryDatabase.get(`${type}-${id}`);
                            if (value) value = JSON.parse(value as string, BufferJSON.reviver);
                            data[id] = value;
                        }
                        return data;
                    },
                    set: (data: any) => {
                        for (const type in data) {
                            for (const id in data[type]) {
                                const value = data[type][id];
                                if (value) {
                                    this.memoryDatabase.set(`${type}-${id}`, JSON.stringify(value, BufferJSON.replacer));
                                } else {
                                    this.memoryDatabase.delete(`${type}-${id}`);
                                }
                            }
                        }
                    }
                }
            },
            saveCreds
        };
    }



    async authorize(eventStream: any) {
        this.memoryDatabase.clear();

        // Ensure state and saveCreds match identically
        const initialized = this.useDbAuthState();
        this.state = initialized.state;
        this.saveCreds = initialized.saveCreds;

        let isDone = false;
        let currentSock: any = null;

        const timeout = setTimeout(() => {
            if (!isDone) {
                isDone = true;
                eventStream.push(JSON.stringify({ type: 'error', message: 'Timeout' }));
                eventStream.close();
                if (currentSock) currentSock.end(undefined);
            }
        }, 45000);

        const connectWhatsApp = async () => {
            if (isDone) return;

            currentSock = makeWASocket({
                auth: this.state,
                logger: P({ level: 'silent' }),
                printQRInTerminal: false,
                browser: Browsers.macOS('Chrome'),
                syncFullHistory: false
            });

            currentSock.ev.on('creds.update', this.saveCreds);

            currentSock.ev.on('connection.update', async (update: any) => {
                if (isDone) return;
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    eventStream.push(JSON.stringify({ type: 'qr', data: qr }));
                }

                if (connection === 'open') {
                    console.log('Session Authenticated Successfully!');
                    isDone = true;
                    clearTimeout(timeout);
                    this.saveCreds();

                    try {
                        const rawUser = currentSock.user.id.split(':')[0];
                        const myChatId = `${rawUser}@s.whatsapp.net`;
                        await currentSock.sendMessage(myChatId, { text: 'Hello from Fomo-mail!' });
                    } catch (err) {
                        console.error('Failed to send initial ping:', err);
                    }

                    eventStream.push(JSON.stringify({ type: 'success' }));
                    eventStream.close();
                    currentSock.end(undefined);
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                    if (statusCode !== DisconnectReason.loggedOut) {
                        console.log(`Connection dropped (${statusCode}). Reconnecting to finalize session...`);
                        connectWhatsApp();
                    } else {
                        isDone = true;
                        clearTimeout(timeout);
                        eventStream.push(JSON.stringify({ type: 'error', message: 'Logged out' }));
                        eventStream.close();
                    }
                }
            });
        };

        connectWhatsApp();

        eventStream.onClosed(async () => {
            if (!isDone) {
                isDone = true;
                clearTimeout(timeout);
                if (currentSock) currentSock.end(undefined);
            }
        });
    }

    private async send(data: any): Promise<boolean> {
        return new Promise((resolve, reject) => {
            const sock = makeWASocket({
                auth: this.state,
                logger: P({ level: 'silent' }), // Debug log generates extreme noise
                printQRInTerminal: false,
                browser: Browsers.macOS('Chrome'),
                syncFullHistory: false
            });

            // Handle credential saving persistently
            sock.ev.on('creds.update', this.saveCreds);

            const onConnectionUpdate = async (update: any) => {
                const { connection, lastDisconnect } = update;
                if (connection === 'open') {
                    // Send message
                    try {
                        const rawUser = sock?.user?.id?.split(':')[0];
                        if (rawUser) {
                            const myChatId = `${rawUser}@s.whatsapp.net`;
                            // console.log("Sending to chat id: ", myChatId);
                            await sock.sendMessage(myChatId, data);
                            await new Promise(r => setTimeout(r, 2500));
                        }
                    } catch (err) {
                        console.error("Failed executing send buffer", err);
                    }

                    sock.ev.off('creds.update', this.saveCreds);
                    sock.ev.off('connection.update', onConnectionUpdate);
                    sock.end(undefined);
                    resolve(true);

                } else if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
                    if (statusCode === DisconnectReason.loggedOut) {
                        sock.ev.off('creds.update', this.saveCreds);
                        sock.ev.off('connection.update', onConnectionUpdate);
                        reject(new Error("WhatsApp logged out. Please Reauthorize."));
                    }
                    // if it drops, Baileys will automatically reconnect, we just keep waiting.
                }
            };

            sock.ev.on('connection.update', onConnectionUpdate);
        });
    }

    async sendMessage(text: string) {
        const info = console.info; // bailey's is too chatty
        console.info = () => { };
        try {
            return await this.send({ text });
        } catch (e) {
            console.error("Failed to send WhatsApp text payload:", e);
            throw e;
        } finally {
            console.info = info;
        }
    }

    async sendAudio(data: string) {
        const info = console.info;
        console.info = () => { };
        try {
            // Strip out the "data:audio/mpeg;base64," prefix if it exists [1]
            const cleanBase64 = data.includes(',') ? data.split(',')[1] : data;

            // Convert the clean string into a native Node.js Buffer
            const audioBuffer = Buffer.from(cleanBase64, 'base64');

            return await this.send({
                document: audioBuffer,
                fileName: 'report.mp3',
                mimetype: 'audio/mpeg'
            });
        } catch (e) {
            console.error("Failed to send WhatsApp document payload:", e);
            throw e;
        } finally {
            console.info = info;
        }
    }

}