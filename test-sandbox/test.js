const { Sandbox } = require('e2b');

async function main() {
  // Use the API key from the .env file or specify it directly here
  const apiKey = process.env.E2B_API_KEY || 'e2b_2b13b8ede67452acb12f271d21337c26d08a238a';
  
  console.log('Starting sandbox with API key:', apiKey);
  
  try {
    // Create a sandbox instance
    const sandbox = await Sandbox.create({
      apiKey: apiKey,
    });
    
    console.log('Sandbox created successfully!');
    console.log('Sandbox ID:', sandbox.id);
    
    // Run a simple command
    const result = await sandbox.filesystem.readdir('/');
    console.log('Directory contents:', result);
    
    // Close the sandbox
    await sandbox.close();
    console.log('Sandbox closed successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
