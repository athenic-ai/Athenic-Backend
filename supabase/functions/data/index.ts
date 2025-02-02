// NOTE: This function has JWT checks disabled in settings (as typically can't ask eg. Prodct Fruits API to pass a bearer token when sending data to Athenic)
// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
// @deno-types="npm:@types/express@5.0.1"
import express from 'npm:express@5.0.1';
import cors from 'npm:cors';
import bodyParser from 'npm:body-parser';
import { UpsertDataJob } from '../_shared/jobs/upsertDataJob.ts';
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

app.post('/data/con/:connection/typ/:datatype/dry/:dryrun', async (req, res) => {
  try {
    console.log('/data/con/:connection/typ/:datatype/dry/:dryrun started');
    const connection = req.params.connection;
    const dataType = req.params.datatype;
    const dryRun: boolean = req.params.dryrun.toLowerCase() === 'true';
    
    // Log raw body for debugging Shopify webhooks
    if (req.headers['x-shopify-hmac-sha256']) {
      console.log('Raw body:', (req as any).rawBody);
      console.log('Shopify HMAC:', req.headers['x-shopify-hmac-sha256']);
    }

    const dataIn = req.body // Will handle in any format, however if coming from Athenic, will be in a structured form to speed up processing, eg.:
    // {
    //  "companyMetadata": {
    //    "organisationId": widget.memberData.ownerOrganisationId,
    //    "memberId": widget.memberData.id
    //    "objectTypeId": constants.OBJECT_TYPE_ID_PRODUCT,
    //    "parentObject": product,
    //    "dataDescription": inputtedFileUploadDescription.text,
    //    "requiredMatchThreshold": 0.8
    //  },
    //  "companyDataContents": inputtedFileUploadData.text
    // }

    console.log(`/data/:connection with:\nconnection: ${connection}\ntype: ${dataType}\ndryRun: ${dryRun}\ndataIn:${config.stringify(dataIn)}`);
    
    if (dataType == config.URL_DATA_TYPE_WEBHOOK) {
      res.status(200).send(); // If webhook, send immediate response as typically webhook senders demand an immediate answer

      const nlpService = new NlpService();
      const upsertDataJob = new UpsertDataJob(nlpService);
      const result = await upsertDataJob.start({initialCall: true, connection, dryRun, dataIn, req});
      console.log(`Edge function complete result: ${config.stringify(result)}`);
    } else {
      const nlpService = new NlpService();
      const upsertDataJob = new UpsertDataJob(nlpService);
      const result = await upsertDataJob.start({initialCall: true, connection, dryRun, dataIn, req});
      console.log(`Edge function complete result: ${config.stringify(result)}`);
      res.status(result.status).send(result);
    }
  } catch (error) {
    console.error(`Error in /data/:connection/:type: ${error.message}`);
    config.Sentry.captureException(error); // Capture the error in Sentry
    res.status(500).send(error.message);
  }
});

app.listen(port, () => {
  console.log(`Data app listening on port ${port}`);
});