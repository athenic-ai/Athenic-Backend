// NOTE: This function has JWT checks disabled in settings (as typically can't ask eg. Slack API to pass a bearer token when sending data to Athenic)
// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
import express from 'npm:express@5.0.1';
import cors from 'npm:cors';
import bodyParser from 'npm:body-parser';
import { ProcessMessageJob } from '../_shared/jobs/processMessageJob.ts';
import * as config from "../_shared/configs/index.ts";

const app = express();
const port = 3000;

app.use(cors(config.CORS_OPTIONS));

// Custom middleware to handle multiple content types and preserve raw body when needed
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';

  // For Shopify webhooks or JSON content, preserve raw body
  if (req.headers['x-shopify-hmac-sha256'] || contentType.includes('application/json')) {
    let rawBody = '';
    req.on('data', chunk => {
      rawBody += chunk;
    });
    
    req.on('end', () => {
      (req as any).rawBody = rawBody;
      
      // Parse JSON after saving raw body
      if (rawBody) {
        try {
          req.body = JSON.parse(rawBody);
        } catch (e) {
          // If JSON parsing fails, keep the raw body
          req.body = rawBody;
        }
      }
      
      next();
    });
  }
  // Handle other content types
  else if (contentType.includes('application/x-www-form-urlencoded')) {
    bodyParser.urlencoded({ extended: true })(req, res, next);
  }
  else if (contentType.includes('text/plain')) {
    bodyParser.text()(req, res, next);
  }
  else if (contentType.includes('application/octet-stream')) {
    bodyParser.raw()(req, res, next);
  }
  else {
    bodyParser.text()(req, res, next);
  }
});

app.post('/messaging/con/:connection', async (req, res) => {
  try {
    console.log('/messaging/:connection started');
    const connectionId = req.params.connection;

    const dataIn = req.body // Will handle in any format, however if coming from Athenic, will be in a structured form to speed up processing, eg.:
    // {
    //  "companyMetadata": {
    //    "organisationId": widget.memberData.ownerOrganisationId,
    //    "memberId": widget.memberData.id,
    //  },
    //  "companyDataContents": inputtedFileUploadData.text
    // }
    console.log(`/messaging/con/:connection with:\nconnection: ${connectionId}\ndataIn:${config.stringify(dataIn)}`);
    
    const processMessageJob: ProcessMessageJob = new ProcessMessageJob();
    const processMessageJobResult = await processMessageJob.start({connectionId, dataIn, req});
    if (processMessageJobResult.status != 200) {
      throw Error(processMessageJobResult.message);
    }
    res.status(processMessageJobResult.status).send(processMessageJobResult.data);
  } catch (error) {
    console.error(`Error in /messaging/:connection/:type: ${error.message}`);
    res.status(500).send(error.message);  }
});

app.listen(port, () => {
  console.log(`Data app listening on port ${port}`);
});
