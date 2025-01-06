import { MessagingInterface } from './messagingInterface.ts';
import { MessagingPluginCompany } from './messagingPluginCompany.ts';
import { MessagingPluginSlack } from './messagingPluginSlack.ts';

const connectionPlugins: Record<string, MessagingInterface> = {
  company: new MessagingPluginCompany(),
  slack: new MessagingPluginSlack(),
};

export class MessagingService {
  async auth(connection: string, connectionMetadata: Map<string, any>) {
    const plugin = connectionPlugins[connection];
    if (!plugin) throw new Error(`Unsupported connection: ${connection}`);
    return plugin.auth(connection, connectionMetadata);
  }

  async receiveMessage(connection: string, messageData: Map<string, any>) {
    const plugin = connectionPlugins[connection];
    if (!plugin) throw new Error(`Unsupported connection: ${connection}`);
    return plugin.receiveMessage(messageData);
  }
}
