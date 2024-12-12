// NOTE: This function has JWT checks disabled in settings (as typically can't ask eg. Prodct Fruits API to pass a bearer token when sending data to Athenic)
// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
// @deno-types="npm:@types/express@5.0.1"
import express from 'npm:express@5.0.1';
// import cors from 'npm:cors@2.8.5'; // Add the cors package
import { ProcessDataJob } from '../_shared/jobs/processDataJob.ts';
import * as config from "../_shared/configs/index.ts";

const app = express();
const port = 3000;

// // Configure CORS
// app.use(
//   cors({
//     origin: '*', // Allow all origins. Replace '*' with specific domains if needed.
//     methods: ['GET', 'POST', 'OPTIONS'], // Allow specific HTTP methods
//     allowedHeaders: ['Content-Type', 'Authorization'], // Allow specific headers
//   })
// );

app.use(express.json());
// app.use(express.json({ limit: '300kb' })); // If you want a payload larger than 100kb, then you can tweak it here:

app.post('/data/:connection/:datatype/:dryrun', async (req, res) => {
  try {
    console.log('/data/:connection/:datatype/:dryrun started');
    const connection = req.params.connection;
    const dataType = req.params.datatype;
    const dryrun = req.params.dryrun.toLowerCase() === 'true';
    const dataIn = req.body
    console.log(`/data/:connection with:\nconnection: ${connection}\ntype: ${dataType}\ndryrun: ${dryrun}\ndataIn:${config.stringify(dataIn)}`);
    
    const processDataJob: ProcessDataJob = new ProcessDataJob();
    const result = await processDataJob.start({connection: connection, dryrun: dryrun, dataIn: dataIn}); // NOTE: datatype not currently used. Could be used to help inform the AI of the likely datatype
    res.status(result.status).send(result.message);
  } catch (error) {
    console.error(`Error in /data/:connection/:type: ${error.message}`);
    res.status(500).send(error.message);  }
});

app.listen(port, () => {
  console.log(`Data app listening on port ${port}`);
});
