import express from 'express';
import { McpConnectionController } from '../api/controllers/mcpConnectionController';
import { StorageServiceWithAI } from '../services/storage/storageService';
import { NLPService } from '../services/nlp/nlpService';

// Add these route definitions where appropriate, either in existing routes setup
// or as a new function that gets called from the main file

export function addMcpConnectionRoutes(
  router: express.Router, 
  storageService: StorageServiceWithAI,
  nlpService: NLPService
): void {
  // Create an instance of the MCP Connection controller
  const mcpConnectionController = new McpConnectionController(storageService, nlpService);
  
  // MCP server connection routes
  router.post('/mcp-connections/install', mcpConnectionController.installMcpServer);
  router.get('/mcp-connections', mcpConnectionController.getMcpConnections);
  router.delete('/mcp-connections/:connection_id', mcpConnectionController.deleteMcpServer);
  router.get('/mcp-server-definitions', mcpConnectionController.getMcpServerDefinitions);
} 