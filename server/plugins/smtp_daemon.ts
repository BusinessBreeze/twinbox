import { SMTPServer } from 'smtp-server';
import { generateReportItem } from '#server/services/app/llm/generate_report_item';

import { getService as getEmailService } from "#server/services/app/email";

export default defineNitroPlugin((_nitroApp) => {
  // const server = new SMTPServer({
  //   authOptional: true,
  //   allowInsecureAuth: true,
  //   disableReverseLookup: true,
  //   // Note: We don't need skipHtmlToText here as we handle parsing manually
  //   async onData(stream, _session, callback) {

  //     let bytesReceived = 0;
  //     const MAX_SIZE = 10 * 1024 * 1024; // 10MB

  //     // Create a listener to monitor size as simpleParser pulls from the stream
  //     stream.on('data', (chunk) => {
  //       bytesReceived += chunk.length;
  //       if (bytesReceived > MAX_SIZE) {
  //         // This kills the stream and stops memory alloc
  //         stream.destroy(new Error('SMTP: Message too large'));
  //       }
  //     });

  //     try {
  //       const emailService = await getEmailService("");
  //       const persisted = await emailService.create(stream);

  //       // Trigger LLM processing
  //       if (persisted) {
  //         await generateReportItem(persisted);
  //       }

  //       callback();
  //     } catch (err: any) {
  //       console.error('SMTP Error:', err);
  //       callback(err as Error);
  //     }
  //   }
  // });

  // server.listen(2525, () => {
  //   console.log('--- SMTP SERVER STARTED ---');
  //   console.log('Listening on port 2525 for incoming emails');
  //   console.log('---------------------------');
  // });

  // _nitroApp.hooks.hook('close', () => {
  //   server.close();
  // });
});