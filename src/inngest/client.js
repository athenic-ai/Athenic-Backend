const { Inngest } = require('inngest');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Inngest client
const inngest = new Inngest({
  id: 'athenic-backend',
  // Optional: Specify Inngest API key if you're using Inngest Cloud
  // (You would add this to your .env file)
  apiKey: process.env.INNGEST_API_KEY,
  // Optional: Specify an event key which is used to sign events
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// Export a simple function to test connectivity
async function testInngestConnection() {
  try {
    // Send a test event to Inngest
    await inngest.send({
      name: 'athenic/test.connection',
      data: {
        message: 'Testing Inngest connection',
        timestamp: new Date().toISOString(),
      },
    });
    console.log('Successfully sent test event to Inngest!');
    return true;
  } catch (error) {
    console.error('Failed to connect to Inngest:', error);
    return false;
  }
}

module.exports = { inngest, testInngestConnection }; 