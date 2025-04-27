// Handler for consumer app messaging
import "jsr:@supabase/functions-js/edge-runtime.d.ts" // Required for Supabase Edge Functions
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { ProcessMessageJob } from "../../_shared/jobs/processMessageJob.ts";
import * as config from "../../_shared/configs/index.ts";

// Initialize Sentry for error tracking
config.initSentry();

// Direct HTTP request handler for serving the function at /messaging/con/company
serve(async (req: Request) => {
  try {
    console.log("Consumer app messaging endpoint called via HTTP");
    
    // Parse the request body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error("Failed to parse request body", e);
      return new Response(
        JSON.stringify({ message: "Invalid request body format" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Validate required fields
    if (!body?.companyMetadata?.organisationId || !body?.companyMetadata?.memberId) {
      console.error("Missing required fields in request body");
      return new Response(
        JSON.stringify({ message: "Missing required fields: organisationId or memberId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Get authentication token from request headers
    const authHeader = req.headers.get('authorization');
    const token = authHeader ? authHeader.replace('Bearer ', '') : null;
    
    console.log(`Processing message from user: ${body.companyMetadata.organisationId}`);
    
    // Create and run the message processing job
    const processMessageJob = new ProcessMessageJob();
    const result = await processMessageJob.start({
      connectionId: "company",
      dryRun: false,
      dataIn: body,
      req
      // token will be handled automatically by the ProcessMessageJob
    });
    
    if (result.status !== 200) {
      throw new Error(result.message || "Unknown error processing message");
    }
    
    // Return the successful response
    return new Response(
      JSON.stringify(result.data || { message: "Message processed successfully" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in consumer app messaging endpoint: ${errorMessage}`);
    
    if (error instanceof Error) {
      config.Sentry.captureException(error); // Capture the error in Sentry
    }
    
    return new Response(
      JSON.stringify({ message: `Failed to process message with error: ${errorMessage}. Please try again.` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}); 