/**
 * Test script for the Athenic chat functionality 
 * This can be used to ensure the new Inngest implementation is working correctly
 */
import fetch from 'node-fetch';
import { v4 as uuid } from 'uuid';

// Define interfaces for the expected response types
interface ApiResponse {
  status: string;
  message: string;
  clientId: string;
}

interface SessionData {
  processingState: string;
  lastResponse?: string;
  clientId: string;
  [key: string]: any; // For other fields we don't explicitly check
}

async function testChat() {
  console.log('Testing chat functionality with new Inngest implementation...');
  
  const testMessage = {
    message: 'Hello, this is a test message from the Inngest test script!',
    userId: 'test-user',
    organisationId: 'test-org',
    clientId: uuid()
  };
  
  try {
    console.log('Sending test message:', testMessage);
    
    // Send message to API server
    const response = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testMessage),
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status: ${response.status}`);
    }
    
    const data = await response.json() as ApiResponse;
    console.log('Initial response:', data);
    
    // Now poll for the actual response from the Inngest function
    if (data.clientId) {
      console.log(`Polling for response with clientId: ${data.clientId}`);
      
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        attempts++;
        console.log(`Polling attempt ${attempts}/${maxAttempts}...`);
        
        const pollResponse = await fetch(`http://localhost:3000/api/chat/session/${data.clientId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (!pollResponse.ok) {
          console.log(`Polling failed with status: ${pollResponse.status}`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        
        const sessionData = await pollResponse.json() as SessionData;
        console.log('Session data:', sessionData);
        
        // Check if processing is complete and we have a response
        if (sessionData.processingState === 'completed' && sessionData.lastResponse) {
          console.log('\n=== TEST SUCCESSFUL ===');
          console.log('Response received:', sessionData.lastResponse);
          console.log('========================\n');
          return;
        }
        
        // Wait before polling again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('\n=== TEST TIMED OUT ===');
      console.log('Did not receive a complete response after maximum attempts');
      console.log('======================\n');
    }
  } catch (error) {
    console.error('Error testing chat functionality:', error);
  }
}

// Run the test
testChat(); 