// NOTE: This function has JWT checks disabled in settings (as typically can't ask eg. Slack API to pass a bearer token when calling back to Athenic)
// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
// @deno-types="npm:@types/express@5.0.1"
import express from 'npm:express@5.0.1';
import cors from 'npm:cors@2.8.5'; // Add the cors package
import { MessagingService } from '../_shared/services/messaging/messagingService.ts';
import * as config from "../_shared/configs/index.ts";

const app = express();
const port = 3000;

// Configure CORS TODO: confirm if I actually need this
app.use(
  cors({
    origin: '*', // Allow all origins. Replace '*' with specific domains if needed.
    methods: ['GET', 'POST', 'OPTIONS'], // Allow specific HTTP methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allow specific headers
  })
);

app.use(express.json());
// app.use(express.json({ limit: '300kb' })); // If you want a payload larger than 100kb, then you can tweak it here:

app.get('/auth/:connection', async (req, res) => {
  try {
    console.log('/auth/:connection started');
    const connection = req.params.connection;
    const connectionMetadata = req.query;
    console.log(`/auth/:connection with connection: ${connection} and connectionMetadata: ${JSON.stringify(connectionMetadata)}`);

    switch (connection) {
      case 'slack':
        const messagingService: MessagingService = new MessagingService();
        const result = await messagingService.auth(connection, connectionMetadata);
        res.status(result.status).send(result.message);
        // res.json({ success: true, data: result });
        break;
      default:
        throw new Error('Unsupported service');
    }
  } catch (error) {
    console.error(`Error in /auth/:connection: ${error.message}`);
    res.status(500).send(error.message);
  }
});

app.listen(port, () => {
  console.log(`Auth app listening on port ${port}`);
});
