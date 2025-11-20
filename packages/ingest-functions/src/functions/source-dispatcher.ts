import { app, InvocationContext, Timer, output } from '@azure/functions';
import { HUNGARIAN_SOURCES } from '../rss.js'; // Adjust path as needed
import { NewsSource } from '../types/index.js';

export async function sourceDispatcher(
  _myTimer: Timer,
  context: InvocationContext
): Promise<NewsSource[]> {
  const runId = new Date().toISOString();
  context.log(`[${runId}] 🚀 Source Dispatcher started.`);

  // Filter active sources
  const activeSources = HUNGARIAN_SOURCES.filter(
    (source) => source.isActive !== false
  );

  if (activeSources.length === 0) {
    context.warn(`[${runId}] ⚠️ No active sources found. Skipping dispatch.`);
    return [];
  }

  // Log the IDs for easier debugging in App Insights
  const sourceIds = activeSources.map((s) => s.id).join(', ');
  context.log(
    `[${runId}] 📤 Dispatching ${activeSources.length} sources: [${sourceIds}]`
  );

  return activeSources;
}

app.timer('source-dispatcher', {
  schedule: '0 */5 * * * *',
  runOnStartup: true,
  return: output.serviceBusQueue({
    queueName: 'sources.dispatch.queue',
    connection: 'SERVICE_BUS_CONNECTION',
  }),
  handler: sourceDispatcher,
});
