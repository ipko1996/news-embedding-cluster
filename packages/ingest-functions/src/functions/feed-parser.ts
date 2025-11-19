import { app, InvocationContext } from '@azure/functions';

export async function feedParser(
  message: unknown,
  context: InvocationContext
): Promise<void> {
  context.log('Service bus queue function processed message:', message);
}

app.serviceBusQueue('feed-parser', {
  connection: 'SERVICE_BUS_CONNECTION',
  queueName: 'sources.dispatch.queue',
  handler: feedParser,
});
