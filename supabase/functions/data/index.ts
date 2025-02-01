// NOTE: This function has JWT checks disabled in settings (as typically can't ask eg. Prodct Fruits API to pass a bearer token when sending data to Athenic)
// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
// @deno-types="npm:@types/express@5.0.1"
import express from 'npm:express@5.0.1';
import cors from 'npm:cors';
import bodyParser from 'npm:body-parser';
import { UpsertDataJob } from '../_shared/jobs/upsertDataJob.ts';
import { NlpService } from "../_shared/services/nlp/nlpService.ts";
import * as config from "../_shared/configs/index.ts";

const app = express();
const port = 3000;

app.use(cors(config.CORS_OPTIONS));

// Middleware to handle multiple content types (as e.g. email isn't delivered as a JSON)
app.use((req, res, next) => {
  const contentType = req.headers['content-type'] || '';

  // JSON parser
  if (contentType.includes('application/json')) {
    express.json()(req, res, next);
  }
  // URL-encoded form parser
  else if (contentType.includes('application/x-www-form-urlencoded')) {
    express.urlencoded({ extended: true })(req, res, next);
  }
  // Plain text parser
  else if (contentType.includes('text/plain')) {
    bodyParser.text()(req, res, next);
  }
  // Binary or raw data (as buffer)
  else if (contentType.includes('application/octet-stream')) {
    bodyParser.raw()(req, res, next);
  }
  // Default to raw text
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
    res.status(500).send(error.message);  }
});

app.listen(port, () => {
  console.log(`Data app listening on port ${port}`);
});
