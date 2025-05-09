import { Request, Response } from 'express';
import { StorageServiceWithAI } from '../../services/storage/storageService';
import { NLPService } from '../../services/nlp/nlpService';
import { Sandbox } from '@e2b/code-interpreter';
import { logger } from '../../utils/logger';
import { encryptSensitiveFields, decryptSensitiveFields } from '../../utils/credentials';
import config from '../../configs/config';

// Constants for MCP server operations
const DEFAULT_MCP_SERVER_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MCP_SERVER_PORT = 3000;

/**
 * Controller for MCP Connection operations
 */
export class McpConnectionController {
  private storageService: StorageServiceWithAI;
  private nlpService: NLPService;

  constructor(storageService: StorageServiceWithAI, nlpService: NLPService) {
    this.storageService = storageService;
    this.nlpService = nlpService;
  }

  /**
   * Install a new MCP server connection
   */
  public installMcpServer = async (req: Request, res: Response): Promise<void> => {
    try {
      // Parse request body
      const { mcp_server_id, account_id, provided_credential_schema, title, test_connection } = req.body;
      const organisationId = account_id; // Use organisationId internally to be consistent with our schema
      
      // Log whether we're in test mode
      logger.info(`Installing MCP server in ${test_connection ? 'test' : 'normal'} mode`);
      
      if (!mcp_server_id || !organisationId || !title) {
        res.status(400).json({ 
          error: 'Bad Request', 
          message: 'Missing required fields: mcp_server_id, account_id, and title are required' 
        });
        return;
      }
      
      // Fetch the MCP server definition from the database
      const mcpServerDefinition = await this.storageService.getRowById({
        table: config.OBJECT_TABLE_NAME,
        id: mcp_server_id,
        filterByRelatedObjectType: 'mcp_server'
      });
      
      if (!mcpServerDefinition) {
        logger.error(`MCP server definition not found: ${mcp_server_id}`);
        res.status(404).json({ 
          error: 'Not Found', 
          message: 'MCP server definition not found' 
        });
        return;
      }
      
      let newConnection = null;

      // Only create a connection record if not in testing mode
      if (!test_connection) {
      // Create a new connection object with initial pending status
      const newConnectionData = {
        related_object_type_id: 'connection',
        owner_organisation_id: organisationId,
        metadata: {
          title,
          mcp_status: 'mcpPending',
          mcp_server_id: mcp_server_id,
          created_at: new Date().toISOString(),
          provided_credential_schema: provided_credential_schema 
            ? encryptSensitiveFields(provided_credential_schema)
            : {}
        }
      };
      
        newConnection = await this.storageService.updateRow({
        table: config.OBJECT_TABLE_NAME,
        rowData: newConnectionData,
        nlpService: this.nlpService,
        mayAlreadyExist: false
      });
      
      if (!newConnection) {
        logger.error('Failed to create MCP connection record');
        res.status(500).json({ 
          error: 'Database Error', 
          message: 'Failed to create MCP connection record' 
        });
        return;
      }
      
      // Update status to deploying
      const updatedConnectionData = {
        ...newConnection,
        metadata: {
          ...newConnection.metadata,
          mcp_status: 'mcpDeploying'
        }
      };
      
      await this.storageService.updateRow({
        table: config.OBJECT_TABLE_NAME,
        keys: { id: newConnection.id },
        rowData: updatedConnectionData,
        nlpService: this.nlpService,
        mayAlreadyExist: true
      });
      }
      
      try {
        // Deploy the MCP server in an E2B sandbox
        const { sandboxId, serverUrl, sandbox } = await this.deployMcpServer(
          mcpServerDefinition,
          provided_credential_schema || {},
          organisationId
        );
        
        // Try to verify the MCP server is responding
        try {
          // Wait up to 15 seconds for the server to start
          let serverReady = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              // Make a simple HTTP request to the server
              const fetch = (await import('node-fetch')).default;
              const response = await fetch(serverUrl);
              
              if (response.ok) {
                serverReady = true;
                logger.info(`MCP server is ready at ${serverUrl} after ${attempt + 1} attempts`);
                break;
              }
              logger.info(`MCP server not ready yet (attempt ${attempt + 1}), status: ${response.status}`);
            } catch (error) {
              logger.info(`MCP server connection failed (attempt ${attempt + 1})`);
            }
            // Wait 3 seconds between attempts
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
          
          if (!serverReady) {
            throw new Error('MCP server is not responding after maximum attempts');
          }
        } catch (verifyError) {
          logger.error(`MCP server verification failed: ${verifyError.message}`);
          
          // Kill the sandbox since the server failed to start properly
          try {
            await sandbox.kill();
          } catch (killError) {
            logger.error(`Failed to kill sandbox: ${killError.message}`);
          }
          
          throw new Error(`MCP server verification failed: ${verifyError.message}`);
        }
        
        // If we're in test mode, kill the sandbox and just return success
        if (test_connection) {
          // Kill the sandbox since we don't need it in test mode
          try {
            await sandbox.kill();
          } catch (killError) {
            logger.error(`Failed to kill test sandbox: ${killError.message}`);
          }
          
          res.status(200).json({
            success: true,
            message: 'MCP server connection test successful',
            test_mode: true
          });
          return;
        }
        
        // Only update connection if we're in normal (non-test) mode
        const finalConnectionData = {
          ...newConnection,
          metadata: {
            ...newConnection.metadata,
            mcp_status: 'mcpRunning',
            e2b_sandbox_id: sandboxId,
            mcp_server_url: serverUrl,
          }
        };
        
        const updatedConnection = await this.storageService.updateRow({
          table: config.OBJECT_TABLE_NAME,
          keys: { id: newConnection.id },
          rowData: finalConnectionData,
          nlpService: this.nlpService,
          mayAlreadyExist: true
        });
        
        if (!updatedConnection) {
          logger.error('Failed to update MCP connection record');
          res.status(500).json({ 
            error: 'Database Error', 
            message: 'Failed to update MCP connection record' 
          });
          return;
        }
        
        // Redact sensitive information before returning
        const sanitizedConnection = {
          ...updatedConnection,
          metadata: {
            ...updatedConnection.metadata,
            provided_credential_schema: Object.keys(updatedConnection.metadata.provided_credential_schema || {})
              .reduce((acc, key) => ({ ...acc, [key]: '[REDACTED]' }), {})
          }
        };
        
        res.status(200).json({
          success: true,
          message: 'MCP server deployed successfully',
          connection: sanitizedConnection
        });
      } catch (deployError: any) {
        logger.error(`Error deploying MCP server: ${deployError.message}`);
        
        // Only update connection status if we're not in test mode
        if (!test_connection && newConnection) {
        // Update the connection with error status
        const errorConnectionData = {
          ...newConnection,
          metadata: {
            ...newConnection.metadata,
            mcp_status: 'mcpError',
            last_error: deployError.message || 'Unknown error'
          }
        };
        
        await this.storageService.updateRow({
          table: config.OBJECT_TABLE_NAME,
          keys: { id: newConnection.id },
          rowData: errorConnectionData,
          nlpService: this.nlpService,
          mayAlreadyExist: true
        });
        }
        
        res.status(500).json({ 
          error: 'Deployment Error', 
          message: `Failed to deploy MCP server: ${deployError.message}`,
          connection_id: test_connection ? null : newConnection?.id
        });
      }
    } catch (error: any) {
      logger.error(`Error in installMcpServer: ${error.message}`);
      res.status(500).json({ error: 'Server Error', message: error.message });
    }
  };

  /**
   * Delete an MCP server connection
   */
  public deleteMcpServer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { connection_id } = req.params;
      
      // Fetch the connection to get the sandbox ID
      const connection = await this.storageService.getRowById({
        table: config.OBJECT_TABLE_NAME,
        id: connection_id,
        filterByRelatedObjectType: 'connection'
      });
      
      if (!connection) {
        res.status(404).json({ 
          error: 'Not Found', 
          message: 'MCP connection not found' 
        });
        return;
      }
      
      // If there's a sandbox ID, try to kill the sandbox
      const sandboxId = connection.metadata?.e2b_sandbox_id;
      if (sandboxId) {
        try {
          // Try to connect to the sandbox and kill it
          const sandbox = await Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY });
          await sandbox.kill();
          logger.info(`Killed E2B sandbox ${sandboxId}`);
        } catch (sandboxError: any) {
          logger.error(`Error killing E2B sandbox ${sandboxId}: ${sandboxError.message}`);
          // Continue with deletion even if sandbox cleanup fails
        }
      }
      
      // Delete the connection from the database
      await this.storageService.deleteRow({
        table: config.OBJECT_TABLE_NAME,
        keys: { id: connection_id }
      });
      
      res.status(200).json({
        success: true,
        message: 'MCP connection deleted successfully'
      });
    } catch (error: any) {
      logger.error(`Error in deleteMcpServer: ${error.message}`);
      res.status(500).json({ error: 'Server Error', message: error.message });
    }
  };

  /**
   * Get all MCP connections for an account/organisation
   */
  public getMcpConnections = async (req: Request, res: Response): Promise<void> => {
    try {
      const organisationId = req.query.account_id as string;
      
      if (!organisationId) {
        res.status(400).json({ 
          error: 'Bad Request', 
          message: 'Missing required query parameter: account_id' 
        });
        return;
      }
      
      // Fetch all MCP connections for the organisation
      const connections = await this.storageService.getRows({
        table: config.OBJECT_TABLE_NAME,
        filterByRelatedObjectType: 'connection',
        whereEqual: { owner_organisation_id: organisationId }
      });
      
      // Redact sensitive credential information before returning
      const redactedConnections = connections.map(connection => ({
        ...connection,
        metadata: {
          ...connection.metadata,
          provided_credential_schema: Object.keys(connection.metadata.provided_credential_schema || {})
            .reduce((acc, key) => ({ ...acc, [key]: '[REDACTED]' }), {})
        }
      }));
      
      res.status(200).json({
        success: true,
        connections: redactedConnections || []
      });
    } catch (error: any) {
      logger.error(`Error in getMcpConnections: ${error.message}`);
      res.status(500).json({ error: 'Server Error', message: error.message });
    }
  };

  /**
   * Get all MCP server definitions
   */
  public getMcpServerDefinitions = async (_req: Request, res: Response): Promise<void> => {
    try {
      // Fetch all MCP server definitions
      const serverDefinitions = await this.storageService.getRows({
        table: config.OBJECT_TABLE_NAME,
        filterByRelatedObjectType: 'mcp_server'
      });
      
      res.status(200).json({
        success: true,
        server_definitions: serverDefinitions || []
      });
    } catch (error: any) {
      logger.error(`Error in getMcpServerDefinitions: ${error.message}`);
      res.status(500).json({ error: 'Server Error', message: error.message });
    }
  };

  /**
   * Deploy an MCP server in an E2B sandbox
   */
  private deployMcpServer = async (
    mcpServerObject: any,
    userProvidedEnvs: Record<string, string>,
    organisationId: string
  ): Promise<{ sandboxId: string; serverUrl: string; sandbox: Sandbox }> => {
    try {
      logger.info(`Deploying MCP server "${mcpServerObject.metadata.title}" for organisation ${organisationId}`);
      
      // Create an E2B sandbox
      const sandbox = await Sandbox.create({
        apiKey: process.env.E2B_API_KEY,
        // Use default timeout from the MCP server object, or default to 30 minutes
        timeoutMs: mcpServerObject.metadata.default_timeout || DEFAULT_MCP_SERVER_TIMEOUT_MS,
      });
      
      const sandboxId = sandbox.sandboxId;
      logger.info(`Created E2B sandbox with ID: ${sandboxId}`);
      
      // Extract the start command from the MCP server object
      const startCommand = mcpServerObject.metadata.start_command;
      if (!startCommand) {
        throw new Error('MCP server object is missing the start_command in metadata');
      }
      
      // Decrypt sensitive credentials for use in the sandbox
      const decryptedEnvs = decryptSensitiveFields(userProvidedEnvs);
      
      // Get the port to use (from metadata or use default)
      const port = mcpServerObject.metadata.port || MCP_SERVER_PORT;
      
      // Set up environment variables for the MCP server
      const envVars = {
        ...decryptedEnvs,
        // Make the server listen on all interfaces (0.0.0.0) inside the sandbox
        MCP_HOST: '0.0.0.0',
        MCP_PORT: port.toString(),
      };
      
      // Log available methods to help with debugging
      logger.info('Available methods on sandbox:', Object.getOwnPropertyNames(sandbox));
      
      // Check if install command exists and run it
      if (mcpServerObject.metadata.install_command) {
        logger.info(`Installing MCP server with command: ${mcpServerObject.metadata.install_command}`);
        
        // Check for different methods to run the install command
        if (sandbox.commands && typeof sandbox.commands.exec === 'function') {
          // Preferred method: use commands.exec if available
          const installResult = await sandbox.commands.exec(mcpServerObject.metadata.install_command, {
            env: envVars,
            onStdout: (data: string) => logger.info(`[Install Stdout] ${data}`),
            onStderr: (data: string) => logger.error(`[Install Stderr] ${data}`),
          });
          
          if (installResult.exitCode !== 0) {
            throw new Error(`Installation failed with exit code ${installResult.exitCode}`);
          }
        } else if (sandbox.process && typeof sandbox.process.start === 'function') {
          // Alternative: use process.start if available
          const installProcess = await sandbox.process.start({
            cmd: mcpServerObject.metadata.install_command,
            env: envVars,
            onStdout: (data: string) => logger.info(`[Install Stdout] ${data}`),
            onStderr: (data: string) => logger.error(`[Install Stderr] ${data}`),
          });
          
          const exitCode = await installProcess.waitForExit();
          if (exitCode !== 0) {
            throw new Error(`Installation failed with exit code ${exitCode}`);
          }
        } else if (typeof sandbox.exec === 'function') {
          // Direct sandbox.exec method if available
          const installResult = await sandbox.exec(mcpServerObject.metadata.install_command, {
            env: envVars
          });
          
          if (installResult.exitCode !== 0) {
            throw new Error(`Installation failed with exit code ${installResult.exitCode}`);
          }
        } else if (sandbox.files && typeof sandbox.files.write === 'function' && typeof sandbox.run === 'function') {
          // Last resort: create a shell script with environment variables
          const scriptPath = '/tmp/install_script.sh';
          
          // Create env vars export statements
          const envExports = Object.entries(envVars)
            .map(([key, value]) => `export ${key}="${value?.replace(/"/g, '\\"') || ''}"`)
            .join('\n');
          
          const scriptContent = `#!/bin/bash
${envExports}
${mcpServerObject.metadata.install_command}
`;
          
          // Write and run the script
          await sandbox.files.write(scriptPath, scriptContent);
          await sandbox.files.chmod?.(scriptPath, '755');
          
          const result = await sandbox.run(scriptPath);
          if (result.exitCode !== 0) {
            throw new Error(`Installation failed with exit code ${result.exitCode}`);
          }
        } else {
          throw new Error('No suitable method found to execute installation command');
        }
      }
      
      // Start the MCP server
      logger.info(`Starting MCP server with command: ${startCommand}`);
      
      // Run the MCP server command using the best available method
      if (sandbox.commands && typeof sandbox.commands.spawn === 'function') {
        // Preferred: Use commands.spawn for long-running processes if available
        await sandbox.commands.spawn(startCommand, {
          env: envVars,
          onStdout: (data: string) => logger.info(`[MCP Server Stdout]: ${data}`),
          onStderr: (data: string) => logger.error(`[MCP Server Stderr]: ${data}`),
        });
      } else if (sandbox.commands && typeof sandbox.commands.exec === 'function') {
        // Use commands.exec with nohup for background execution
        const backgroundCommand = `nohup ${startCommand} > /tmp/mcp-server.log 2>&1 &`;
        await sandbox.commands.exec(backgroundCommand, {
          env: envVars,
          onStdout: (data: string) => logger.info(`[MCP Server Stdout]: ${data}`),
          onStderr: (data: string) => logger.error(`[MCP Server Stderr]: ${data}`),
        });
      } else if (sandbox.process && typeof sandbox.process.start === 'function') {
        // Use process.start if available
        await sandbox.process.start({
          cmd: startCommand,
          env: envVars,
          onStdout: (data: string) => logger.info(`[MCP Server Stdout]: ${data}`),
          onStderr: (data: string) => logger.error(`[MCP Server Stderr]: ${data}`),
        });
      } else if (typeof sandbox.exec === 'function') {
        // Use direct exec with nohup
        await sandbox.exec(`nohup ${startCommand} > /tmp/mcp-server.log 2>&1 &`, {
          env: envVars
        });
      } else if (sandbox.files && typeof sandbox.files.write === 'function' && typeof sandbox.run === 'function') {
        // Last resort: shell script approach
        const scriptPath = '/tmp/start_script.sh';
        
        const envExports = Object.entries(envVars)
          .map(([key, value]) => `export ${key}="${value?.replace(/"/g, '\\"') || ''}"`)
          .join('\n');
        
        const scriptContent = `#!/bin/bash
${envExports}
nohup ${startCommand} > /tmp/mcp-server.log 2>&1 &
`;
        
        await sandbox.files.write(scriptPath, scriptContent);
        await sandbox.files.chmod?.(scriptPath, '755');
        await sandbox.run(scriptPath);
      } else {
        throw new Error('No suitable method found to execute MCP server start command');
      }
      
      // Wait for a moment to allow the server to start
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Get the server URL using the getHost method
      const serverUrl = sandbox.getHost(port);
      logger.info(`MCP server is running on port ${port}, accessible at: ${serverUrl}`);
      
      return {
        sandboxId,
        serverUrl,
        sandbox,
      };
    } catch (error) {
      logger.error('Error deploying MCP server:', error);
      throw new Error(`Failed to deploy MCP server: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
} 