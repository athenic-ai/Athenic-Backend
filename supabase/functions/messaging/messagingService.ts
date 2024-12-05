import { MessagingInterface } from './messagingInterface.ts';
import { MessagingPluginSlack } from './messagingPluginSlack.ts';

const connectionPlugins: Record<string, MessagingInterface> = {
  slack: new MessagingPluginSlack(),
  // teams: new MessagingPluginTeams(),
};

export class MessagingService {
  static async auth(connection: string, connectionMetadata: Map<string, any>) {
    const plugin = connectionPlugins[connection];
    if (!plugin) throw new Error(`Unsupported connection: ${connection}`);
    return plugin.auth(connection, connectionMetadata);
  }

  // static async send(provider: string, message: string, userId: string) {
  //   const service = providers[provider];
  //   if (!service) throw new Error(`Unsupported provider: ${provider}`);
  //   return service.send(message, userId);
  // }
}
