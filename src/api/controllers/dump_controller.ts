import { Request, Response } from 'express';
import { inngest } from '../../inngest/client.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

// Schema for validation
const createDumpSchema = z.object({
  inputText: z.string().min(1, 'Input text cannot be empty'),
  userId: z.string().min(1, 'User ID is required'),
  accountId: z.string().min(1, 'Account ID is required'),
});

/**
 * Controller for handling dump creation
 */
export const createDump = async (req: Request, res: Response) => {
  console.log('POST /dump endpoint called');
  
  try {
    // Validate request body
    const validation = createDumpSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid request body', 
        details: validation.error.issues 
      });
    }
    
    const { inputText, userId, accountId } = validation.data;
    
    // Generate a client ID for tracking
    const clientId = uuidv4();

    // Send the event to Inngest
    await inngest.send({
      name: 'dump/create.requested',
      data: {
        userId,
        accountId,
        inputText,
        clientId,
      },
    });

    // Return a 202 Accepted response
    res.status(202).json({ 
      message: 'Dump creation request received and is being processed', 
      clientId 
    });
  } catch (error: any) {
    console.error(`Error in createDump controller: ${error.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
}; 