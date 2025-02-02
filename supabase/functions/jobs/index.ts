// TODO: Re-enable JWT checks in settings (as only called by athenic where we can provide it)







// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
// @deno-types="npm:@types/express@5.0.1"
import express from 'npm:express@5.0.1';
import cors from 'npm:cors';
import bodyParser from 'npm:body-parser';
import { ExecuteJobs } from '../_shared/jobs/executeJobs.ts';
import { NlpService } from "../_shared/services/nlp/nlpService.ts";
import * as config from "../_shared/configs/index.ts";

config.initSentry(); // Initialise Sentry

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

app.post('/jobs/execute', async (req, res) => {
  try {
    console.log('/jobs/execute started');

    const dataIn = req.body // Will handle in any format, however if coming from Athenic, will be in a structured form to speed up processing, eg.:
    // {
    //  "companyMetadata": {
    //    "organisationId": widget.memberData.ownerOrganisationId,
    //    "memberId": widget.memberData.id
    //  },
    //  "companyDataContents": [<job ids to execute here>]
    // }

    console.log(`/jobs/execute with:\ndataIn:${config.stringify(dataIn)}`);
    
    const nlpService = new NlpService();
    const executeJobs = new ExecuteJobs(nlpService);
    const result = await executeJobs.start({dataIn});
    console.log(`Edge function complete result: ${config.stringify(result)}`);
    res.status(result.status).send(result);
  } catch (error) {
    console.error(`Error in /jobs/execute/: ${error.message}`);
    config.Sentry.captureException(error); // Capture the error in Sentry
    res.status(500).send(error.message);
  }
});

app.listen(port, () => {
  console.log(`Data app listening on port ${port}`);
});