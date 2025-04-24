// Handler for consumer app messaging
import "jsr:@supabase/functions-js/edge-runtime.d.ts" // Required for Supabase Edge Functions
// @deno-types="npm:@types/express@5.0.1"
import express from 'npm:express@5.0.1';
// @deno-types="npm:@types/cors@2.8.5"
import cors from 'npm:cors@2.8.5';
import { ProcessMessageJob } from '../../_shared/jobs/processMessageJob.ts';
import * as config from "../../_shared/configs/index.ts";

// Initialize Sentry for error tracking
config.initSentry();

const app = express();
const port = 3000;

// Configure CORS
app.use(
  cors({
    origin: '*', // Allow all origins
    methods: ['POST'], // Only allow POST for this endpoint
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json());

app.post('/', async (req: express.Request, res: express.Response) => {
  const connectionId = "company"; // Fixed connection ID for consumer app

  try {
    console.log("Consumer app messaging endpoint called");
    
    const body = req.body;
    
    // Validate required fields
    if (!body?.companyMetadata?.organisationId || !body?.companyMetadata?.memberId) {
      console.error("Missing required fields in request body");
      return res.status(400).send({
        message: "Missing required fields: organisationId or memberId"
      });
    }
    
    // Check if this is a consumer app request
    const isConsumerApp = body?.companyMetadata?.isConsumerApp === true;
    if (!isConsumerApp) {
      console.warn("Request doesn't have isConsumerApp flag set to true");
      // We'll continue processing, but log a warning
    }

    console.log(`Processing consumer app message from user: ${body.companyMetadata.organisationId}`);
    
    // Create and run the message processing job
    const processMessageJob = new ProcessMessageJob();
    const result = await processMessageJob.start({
      connectionId,
      dryRun: false,
      dataIn: body,
      req
    });
    
    if (result.status !== 200) {
      throw new Error(result.message || "Unknown error processing message");
    }
    
    // Return the successful response
    res.status(200).send(result.data || { message: "Message processed successfully" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in consumer app messaging endpoint: ${errorMessage}`);
    
    if (error instanceof Error) {
      config.Sentry.captureException(error); // Capture the error in Sentry
    }
    
    res.status(500).send({ 
      message: `Failed to process message with error: ${errorMessage}. Please try again.`
    });
  }
});

app.listen(port, () => {
  console.log(`Consumer messaging app listening on port ${port}`);
}); 