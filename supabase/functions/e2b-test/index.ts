// @ts-ignore
import { Sandbox } from "npm:@e2b/code-interpreter";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json'
};

Deno.serve(async (req) => {
  // Setup CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: CORS_HEADERS
    });
  }

  try {
    const params = await req.json();
    const userMessage = params.message || "Hello! Please tell me about yourself.";
    
    console.log(`Received message: ${userMessage}`);
    console.log("Testing E2B SDK with API key");
    
    // Get the E2B API key from environment variable
    const e2bApiKey = Deno.env.get("E2B_API_KEY");
    
    if (!e2bApiKey) {
      console.error("E2B_API_KEY not found in environment variables");
      throw new Error("E2B API key is missing. Please set the E2B_API_KEY environment variable.");
    }
    
    // Log the API key format (safely)
    const keyFormat = e2bApiKey.startsWith("e2b_") ? "Valid e2b_ prefix" : "Invalid prefix (should start with e2b_)";
    const keyLength = e2bApiKey.length;
    const maskedKey = e2bApiKey.substring(0, 6) + "..." + e2bApiKey.substring(keyLength - 4);
    console.log(`API Key format: ${keyFormat}, Length: ${keyLength}, Key: ${maskedKey}`);
    
    try {
      // Create a new sandbox instance
      console.log("Creating E2B Sandbox...");
      const sandbox = await Sandbox.create({
        apiKey: e2bApiKey,
      });
      
      console.log("E2B Sandbox created successfully");
      
      // Run the code interpreter
      const result = await sandbox.chat.completions.create({
        messages: [
          { role: "system", content: "You are a helpful AI assistant running in a sandbox environment." },
          { role: "user", content: userMessage }
        ],
        stream: false,
      });
      
      // Extract the assistant's response
      const assistantResponse = result.choices[0]?.message?.content || "I encountered an issue while processing your request.";
      
      // Clean up the sandbox when done
      await sandbox.close();
      
      console.log("E2B code execution completed successfully");
      
      return new Response(JSON.stringify({
        response: assistantResponse,
        success: true
      }), {
        headers: CORS_HEADERS,
      });
    } catch (e2bError) {
      console.error("Error using E2B SDK:", e2bError);
      return new Response(JSON.stringify({
        response: `Error using E2B SDK: ${e2bError.message || e2bError}`,
        debug: {
          keyFormat,
          keyLength,
          maskedKey
        },
        success: false
      }), {
        headers: CORS_HEADERS,
        status: 500
      });
    }
  } catch (error) {
    console.error(`Error parsing request: ${error}`);
    return new Response(JSON.stringify({
      response: `Error parsing request: ${error.message || error}`,
      success: false
    }), {
      headers: CORS_HEADERS,
      status: 400
    });
  }
}); 