export const generateTTS = async (text: string) => {
    const baseUrl = process.env.TTS_BASE_URL;
    if (!baseUrl) {
        throw new Error('TTS_BASE_URL environment variable is not defined');
    }

    const payload = {
        tcfg_weight: 0.55,
        chunk_size: 240,
        exaggeration: 0.7,
        language: "en",
        output_format: "mp3",
        predefined_voice_id: "Abigail.wav",
        seed: 888,
        speed_factor: 1,
        split_text: true,
        temperature: 0.8,
        text: text,
        voice_mode: "predefined"
    };

    try {
        const response: Blob = await $fetch(`${baseUrl}/tts`, {
            method: 'POST',
            body: payload,
            responseType: 'blob'
        });

        // Convert the blob to an ArrayBuffer for downstream Base64 encoding in generate_report.ts
        return await response.arrayBuffer();
    } catch (error) {
        console.error('Error generating TTS:', error);
        throw error;
    }
};
