import { MessagingInterface } from './messagingInterface.ts';
import axios from 'npm:axios@1.7.9';
import * as config from "../../configs/index.ts";
import { StorageService } from "../storage/storageService.ts";
import { NlpService } from "../nlp/nlpService.ts";

export class MessagingPluginSlack implements MessagingInterface {
  async auth(connection: string, connectionMetadata: Map<string, any>) {
    console.log(`Auth Slack with connection: ${connection} and connectionMetadata: ${JSON.stringify(connectionMetadata)}`)
    const stateMap = JSON.parse(connectionMetadata.state);

    try {
      const tokenResponse = await axios.post(
        "https://slack.com/api/oauth.v2.access",
        null,
        {
          params: {
            client_id: Deno.env.get("SLACK_CLIENT_ID"),
            client_secret: Deno.env.get("SLACK_CLIENT_SECRET"),
            code: connectionMetadata["code"],
            redirect_uri: config.SLACK_REDIRECT_URI,
          },
        }
      );

      const slackAccessToken = tokenResponse.data.access_token;
      const slackTeam = tokenResponse.data.team;
      const slackMemberId = tokenResponse.data.authed_user.id;

      if (!slackAccessToken) {
        throw new Error(
          "Failed to retrieve access token from Slack: " +
            JSON.stringify(tokenResponse.data)
        );
      }

      const memberRow = {
        connection_metadata: {
          slack: {
            accessToken: slackAccessToken,
            teamId: slackTeam.id,
            teamName: slackTeam.name,
            memberId: slackMemberId,
            reportsEnabled: true,
            lastModified: new Date().toISOString(),
          },
        },
      };

      const storageService = new StorageService({accessToken: stateMap.accessToken});
      const nlpService = new NlpService();
      await nlpService.initialiseClientCore();
      const membersUpdateResult = await storageService.updateRow({
        table: "members", 
        keys: {id: stateMap.memberId}, 
        rowData: memberRow,
        nlpService: nlpService, // TODO: check this is implemented correctly
      })

      if (membersUpdateResult.status != 200) {
        return membersUpdateResult;
      }

      const connectionMemberMappingUpdateResult = await storageService.updateRow({
        table: "connection_member_mapping",
        keys: {connection: "slack", connection_id: slackTeam.id},
        rowData: {member_id: stateMap.memberId},
        mayBeNew: true,
        nlpService: nlpService, // TODO: check this is implemented correctly
      });

      if (membersUpdateResult.status == 200) {
        const result: FunctionResult = {
          status: 200,
          message: "Slack connected successfully!\nYou can close this tab now.",
        };
        return result;
      } else {
        return membersUpdateResult;
      }
    } catch (error) {
      console.error("Auth callback error:", error);
      const result: FunctionResult = {
        status: 500,
        message: `❌ An error occurred while connecting Slack.\nError: ${error.message}`,
      };
    }
  }

  // async send(message: string, userId: string) {
  //   // Logic to send a Slack message
  // }
}
