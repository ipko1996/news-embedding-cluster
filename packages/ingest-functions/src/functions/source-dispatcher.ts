import { app, InvocationContext, Timer } from '@azure/functions';

export async function sourceDispatcher(
  myTimer: Timer,
  context: InvocationContext
): Promise<void> {
  context.log('Timer function processed request.');
}

app.timer('source-dispatcher', {
  schedule: '0 */5 * * * *',
  handler: sourceDispatcher,
});
