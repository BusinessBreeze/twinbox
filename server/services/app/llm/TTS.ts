import { markdownToTxt } from 'markdown-to-txt';

/**
 * Normalizes and cleans text before sending to TTS:
 * 1. Strips Markdown formatting (links, headings, tables).
 * 2. Ensures each line/bullet ends with sentence punctuation (e.g. '.') so Chatterbox can split cleanly.
 * 3. Caps length to maxChars, trimming cleanly at a sentence boundary.
 */
export function prepareTtsText(rawText: string, maxChars: number = 4000): string {
    if (!rawText || !rawText.trim()) return '';

    // 1. Convert Markdown to plain text
    const plainText = markdownToTxt(rawText);

    // 2. Turn line breaks and items into separate sentences by adding '.' if missing
    const sentenceEndingRegex = /[.!?…:;]$/;
    const lines = plainText
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    const sentences = lines.map(line => {
        return sentenceEndingRegex.test(line) ? line : `${line}.`;
    });

    let combined = sentences.join(' ').replace(/\s+/g, ' ').trim();

    // 3. Cap length if exceeding maxChars
    if (combined.length > maxChars) {
        const slice = combined.slice(0, maxChars);
        const lastBoundary = Math.max(
            slice.lastIndexOf('.'),
            slice.lastIndexOf('!'),
            slice.lastIndexOf('?')
        );
        if (lastBoundary > maxChars * 0.5) {
            combined = slice.slice(0, lastBoundary + 1).trim();
        } else {
            combined = slice.trim() + '.';
        }
    }

    return combined;
}

export const generateTTS = async (text: string) => {
    const baseUrl = process.env.TTS_BASE_URL;
    if (!baseUrl) {
        throw new Error('TTS_BASE_URL environment variable is not defined');
    }

    const cleanText = prepareTtsText(text);
    if (!cleanText) {
        return new ArrayBuffer(0);
    }

    const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

    const payload = {
        model: "chatterbox",
        input: cleanText,
        voice: "Abigail.wav",
        response_format: "mp3",
        language: "en",
        seed: 888
    };

    const headers: Record<string, string> = {};
    if (process.env.TTS_API_KEY) {
        headers['Authorization'] = `Bearer ${process.env.TTS_API_KEY}`;
    }

    try {
        const response: Blob = await $fetch(`${cleanBaseUrl}/v1/audio/speech`, {
            method: 'POST',
            headers,
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
