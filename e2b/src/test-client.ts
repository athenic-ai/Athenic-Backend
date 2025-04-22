import WebSocket from 'ws';
import axios, { AxiosError } from 'axios';
import { ExecuteCodeRequest, ExecuteCodeResponse, WSMessage } from './types';

// Configuration
const API_URL = 'http://localhost:4000';
const WS_URL = 'ws://localhost:4001';

// Sample Python code to execute
const sampleCode = `
import time
import numpy as np
import matplotlib.pyplot as plt

# Print some messages to demonstrate real-time output
print("Starting execution...")
time.sleep(1)
print("Generating data...")
time.sleep(1)

# Create some sample data
x = np.linspace(0, 10, 100)
y = np.sin(x)

# Create a plot
plt.figure(figsize=(10, 6))
plt.plot(x, y, 'b-', linewidth=2)
plt.title('Sine Wave')
plt.xlabel('x')
plt.ylabel('sin(x)')
plt.grid(True)
plt.savefig('sine_wave.png')

print("Plot saved to sine_wave.png")
print("Calculation complete!")

# Return a dictionary as a result
result = {
    "max_value": float(np.max(y)),
    "min_value": float(np.min(y)),
    "mean_value": float(np.mean(y))
}

result  # This will be returned as the execution result
`;

// Connect to WebSocket for real-time updates
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('WebSocket connection established');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString()) as WSMessage;
    
    // Format the output based on message type
    switch (message.type) {
      case 'status':
        console.log(`[STATUS] ${message.status}: ${message.message}`);
        break;
      case 'stdout':
        console.log(`[STDOUT] ${message.data}`);
        break;
      case 'stderr':
        console.log(`[STDERR] ${message.data}`);
        break;
      case 'error':
        console.error(`[ERROR] ${message.error}`);
        break;
      default:
        console.log('[WS]', message);
    }
  } catch (error) {
    console.error('Error parsing WebSocket message:', error);
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.on('close', () => {
  console.log('WebSocket connection closed');
});

// Execute the code via REST API
async function executeCode() {
  try {
    console.log('Sending code execution request...');
    
    const request: ExecuteCodeRequest = {
      code: sampleCode,
      language: 'python',  // Specify Python language
      timeout: 30000       // 30 seconds timeout
    };
    
    const response = await axios.post<ExecuteCodeResponse>(`${API_URL}/execute`, request);
    
    console.log('\nExecution completed successfully!');
    console.log('Final results:', response.data);
    
    // Close the WebSocket connection after completion
    ws.close();
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      console.error('Error executing code:', (error as AxiosError).response?.data || error.message);
    } else {
      console.error('Error executing code:', error);
    }
    ws.close();
  }
}

// Wait for WebSocket connection before starting execution
setTimeout(executeCode, 1000); 