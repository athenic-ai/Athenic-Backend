import { testInngestConnection } from '../../src/inngest/client';

/**
 * Simple script to test Inngest connection
 * Run with: npx ts-node tests/inngest/test-inngest.ts
 */
async function main() {
  console.log('Testing Inngest connection...');
  
  try {
    const success = await testInngestConnection();
    
    if (success) {
      console.log('✅ Inngest connection successful!');
      console.log('Next steps:');
      console.log('1. Run the Inngest Dev Server to see the event: npx inngest-cli@latest dev');
      console.log('2. This will open a browser with the Inngest Dev UI');
      console.log('3. You should see the test event and can track its processing');
    } else {
      console.log('❌ Inngest connection failed');
      console.log('Check your environment variables and network connection');
    }
  } catch (error) {
    console.error('Error testing Inngest connection:', error);
  }
}

main().catch(console.error); 